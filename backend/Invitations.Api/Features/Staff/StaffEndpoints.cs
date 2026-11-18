using System.Security.Claims;
using Invitations.Api.Data;
using Invitations.Api.Domain;
using Invitations.Api.Features.Public;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace Invitations.Api.Features.Staff;

public static class StaffAuth
{
    public const string Scheme = "Staff";
    public const string Policy = "Staff";
    public const string AccessClaim = "staff_access";
}

/// <summary>Lo que usan las hostess el día del evento. Sesión propia (cookie inv_staff), limitada a un evento.</summary>
public static class StaffEndpoints
{
    public record LoginRequest(Guid AccessId, string Pin);

    public record StaffSessionDto(
        Guid AccessId, string Label, string EventTitle, DateTimeOffset StartsAt, string? VenueName,
        int ConfirmedPasses, int CheckedIn, DateTimeOffset ExpiresAt);

    public record GuestDto(string Name, int? TableNumber);

    public record CheckInDto(Guid Id, int Count, DateTimeOffset At, string? StaffLabel);

    public record ScanResultDto(
        string Token, string DisplayName, int Passes, RsvpStatus RsvpStatus, int ConfirmedPasses,
        int CheckedIn, int Remaining, IReadOnlyList<int> Tables, IReadOnlyList<GuestDto> Guests,
        IReadOnlyList<string> Warnings, IReadOnlyList<CheckInDto> CheckIns);

    public record ScanRequest(string Content);

    public record CheckInRequest(string Token, int Count);

    public record SearchResultDto(string Token, string DisplayName, int Passes, RsvpStatus RsvpStatus, int CheckedIn);

    public static IEndpointRouteBuilder MapStaffEndpoints(this IEndpointRouteBuilder api)
    {
        var staff = api.MapGroup("/staff").WithTags("Staff");

        staff.MapPost("/login", async (LoginRequest req, HttpContext http, AppDbContext db, TimeProvider clock) =>
        {
            var access = await db.StaffAccesses.Include(s => s.Event).FirstOrDefaultAsync(s => s.Id == req.AccessId);
            if (access is null) return Results.Problem("Este acceso no existe o fue eliminado.", statusCode: 404);
            if (access.Event.Status == EventStatus.Draft)
                return Results.Problem("El evento aún no está publicado. Pide a los organizadores que completen el pago.", statusCode: 403);

            var now = clock.GetUtcNow();
            switch (StaffRules.CheckCanLogin(access, now))
            {
                case StaffRules.LoginBlock.Expired:
                    return Results.Problem("Este acceso ya expiró.", statusCode: 403);
                case StaffRules.LoginBlock.Locked:
                    return Results.Problem("Demasiados intentos. Espera unos minutos y vuelve a intentarlo.", statusCode: 429);
            }

            var ok = !string.IsNullOrWhiteSpace(req.Pin) &&
                StaffPins.Hasher.VerifyHashedPassword(access, access.PinHash, req.Pin.Trim()) != PasswordVerificationResult.Failed;
            if (!ok)
            {
                StaffRules.RegisterFailure(access, now);
                await db.SaveChangesAsync();
                var left = StaffRules.MaxFailedAttempts - access.FailedAttempts;
                return Results.Problem(left > 0
                    ? $"PIN incorrecto. Te quedan {left} {(left == 1 ? "intento" : "intentos")}."
                    : "Demasiados intentos. Espera unos minutos y vuelve a intentarlo.", statusCode: 401);
            }

            StaffRules.RegisterSuccess(access);
            await db.SaveChangesAsync();

            var identity = new ClaimsIdentity(
                [new Claim(StaffAuth.AccessClaim, access.Id.ToString())], StaffAuth.Scheme);
            await http.SignInAsync(StaffAuth.Scheme, new ClaimsPrincipal(identity),
                new AuthenticationProperties { IsPersistent = true, ExpiresUtc = access.ExpiresAt });
            return Results.NoContent();
        }).RequireRateLimiting(PublicInvitationEndpoints.RateLimitPolicy);

        var authed = staff.MapGroup("/").RequireAuthorization(StaffAuth.Policy);

        authed.MapPost("/logout", async (HttpContext http) =>
        {
            await http.SignOutAsync(StaffAuth.Scheme);
            return Results.NoContent();
        });

        authed.MapGet("/me", async (ClaimsPrincipal user, AppDbContext db, TimeProvider clock) =>
        {
            var access = await LoadAccessAsync(user, db, clock);
            if (access is null) return Results.Unauthorized();

            var eventId = access.EventId;
            var confirmed = await db.Invitations.Where(i => i.EventId == eventId).SumAsync(i => i.ConfirmedPasses);
            var checkedIn = await db.CheckIns.Where(c => c.Invitation.EventId == eventId).SumAsync(c => c.Count);
            return Results.Ok(new StaffSessionDto(
                access.Id, access.Label, access.Event.Title, access.Event.StartsAt, access.Event.VenueName,
                confirmed, checkedIn, access.ExpiresAt));
        });

        // Solo consulta: muestra a la hostess quién es y a qué mesa va, sin registrar la entrada.
        authed.MapPost("/scan", async (ScanRequest req, ClaimsPrincipal user, AppDbContext db, TimeProvider clock) =>
        {
            var access = await LoadAccessAsync(user, db, clock);
            if (access is null) return Results.Unauthorized();

            var token = CheckInRules.TokenFromQr(req.Content);
            if (token is null) return Results.Problem("Este código no es una invitación válida.", statusCode: 404);

            var inv = await LoadInvitationAsync(db, access.EventId, token);
            return inv is null
                ? Results.Problem("Esta invitación no pertenece a este evento.", statusCode: 404)
                : Results.Ok(ToScanResult(inv));
        });

        authed.MapPost("/checkins", async (CheckInRequest req, ClaimsPrincipal user, AppDbContext db, TimeProvider clock) =>
        {
            var access = await LoadAccessAsync(user, db, clock);
            if (access is null) return Results.Unauthorized();

            // Bloquea la fila de la invitación: si dos hostess escanean el mismo QR a la vez,
            // la segunda espera y ve las entradas de la primera (no se rebasan los pases).
            await using var tx = await db.Database.BeginTransactionAsync();
            var locked = await db.Invitations
                .FromSql($"""SELECT * FROM "Invitations" WHERE "Token" = {req.Token} AND "EventId" = {access.EventId} FOR UPDATE""")
                .Select(i => i.Id)
                .FirstOrDefaultAsync();
            if (locked == Guid.Empty) return Results.Problem("Esta invitación no pertenece a este evento.", statusCode: 404);

            var inv = (await LoadInvitationAsync(db, access.EventId, req.Token))!;
            if (CheckInRules.Validate(inv, req.Count) is { } error)
                return Results.Problem(error, statusCode: StatusCodes.Status409Conflict);

            inv.CheckIns.Add(new CheckIn
            {
                Id = Guid.CreateVersion7(),
                InvitationId = inv.Id,
                Count = req.Count,
                At = clock.GetUtcNow(),
                StaffAccessId = access.Id,
                StaffAccess = access,
            });
            await db.SaveChangesAsync();
            await tx.CommitAsync();
            return Results.Ok(ToScanResult(inv));
        });

        // Deshacer una entrada registrada por error.
        authed.MapDelete("/checkins/{id:guid}", async (Guid id, ClaimsPrincipal user, AppDbContext db, TimeProvider clock) =>
        {
            var access = await LoadAccessAsync(user, db, clock);
            if (access is null) return Results.Unauthorized();

            var checkIn = await db.CheckIns.Include(c => c.Invitation)
                .FirstOrDefaultAsync(c => c.Id == id && c.Invitation.EventId == access.EventId);
            if (checkIn is null) return Results.NotFound();

            db.CheckIns.Remove(checkIn);
            await db.SaveChangesAsync();
            var inv = (await LoadInvitationAsync(db, access.EventId, checkIn.Invitation.Token))!;
            return Results.Ok(ToScanResult(inv));
        });

        // Búsqueda manual por nombre (si el invitado no trae su QR o el celular no tiene pila).
        authed.MapGet("/search", async (string? q, ClaimsPrincipal user, AppDbContext db, TimeProvider clock) =>
        {
            var access = await LoadAccessAsync(user, db, clock);
            if (access is null) return Results.Unauthorized();
            if (string.IsNullOrWhiteSpace(q) || q.Trim().Length < 2) return Results.Ok(Array.Empty<SearchResultDto>());

            var pattern = $"%{q.Trim().Replace("%", "").Replace("_", "")}%";
            var results = await db.Invitations
                .Where(i => i.EventId == access.EventId &&
                    (EF.Functions.ILike(EF.Functions.Unaccent(i.DisplayName), EF.Functions.Unaccent(pattern)) ||
                     i.Guests.Any(g => EF.Functions.ILike(EF.Functions.Unaccent(g.Name), EF.Functions.Unaccent(pattern)))))
                .OrderBy(i => i.DisplayName)
                .Take(20)
                .Select(i => new SearchResultDto(i.Token, i.DisplayName, i.Passes, i.RsvpStatus, i.CheckIns.Sum(c => c.Count)))
                .ToListAsync();
            return Results.Ok(results);
        });

        return api;
    }

    /// <summary>Revisa en cada petición que el acceso siga existiendo (el cliente pudo revocarlo) y no haya expirado.</summary>
    private static async Task<StaffAccess?> LoadAccessAsync(ClaimsPrincipal user, AppDbContext db, TimeProvider clock)
    {
        if (!Guid.TryParse(user.FindFirstValue(StaffAuth.AccessClaim), out var id)) return null;
        var access = await db.StaffAccesses.Include(s => s.Event).FirstOrDefaultAsync(s => s.Id == id);
        return access is null || access.ExpiresAt <= clock.GetUtcNow() ? null : access;
    }

    private static Task<Invitation?> LoadInvitationAsync(AppDbContext db, Guid eventId, string token) =>
        db.Invitations
            .Include(i => i.Guests).ThenInclude(g => g.Table)
            .Include(i => i.CheckIns).ThenInclude(c => c.StaffAccess)
            .AsSplitQuery()
            .FirstOrDefaultAsync(i => i.EventId == eventId && i.Token == token);

    private static ScanResultDto ToScanResult(Invitation inv)
    {
        var guests = inv.Guests.OrderBy(g => g.Id).Select(g => new GuestDto(g.Name, g.Table?.Number)).ToList();
        return new ScanResultDto(
            inv.Token, inv.DisplayName, inv.Passes, inv.RsvpStatus, inv.ConfirmedPasses,
            CheckInRules.CheckedIn(inv), CheckInRules.Remaining(inv),
            guests.Where(g => g.TableNumber is not null).Select(g => g.TableNumber!.Value).Distinct().Order().ToList(),
            guests,
            CheckInRules.Warnings(inv),
            inv.CheckIns.OrderBy(c => c.At).Select(c => new CheckInDto(c.Id, c.Count, c.At, c.StaffAccess?.Label)).ToList());
    }
}
