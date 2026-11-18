using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using Invitations.Api.Data;
using Invitations.Api.Domain;
using Invitations.Api.Features.Common;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace Invitations.Api.Features.Staff;

/// <summary>El cliente crea y revoca accesos de hostess para su evento.</summary>
public static class StaffAccessEndpoints
{
    public record StaffAccessDto(Guid Id, string Label, DateTimeOffset ExpiresAt, DateTimeOffset CreatedAt, int CheckIns);

    /// <summary>El PIN solo se devuelve al crearlo: después ya no se puede consultar (se guarda con hash).</summary>
    public record CreatedStaffAccessDto(Guid Id, string Label, DateTimeOffset ExpiresAt, string Pin);

    public record CreateStaffAccessRequest([property: Required, StringLength(60, MinimumLength = 1)] string Label);

    public static IEndpointRouteBuilder MapStaffAccessEndpoints(this IEndpointRouteBuilder api)
    {
        var group = api.MapGroup("/events/{eventId:guid}/staff")
            .WithTags("Staff access")
            .RequireAuthorization();

        group.MapGet("/", async (Guid eventId, ClaimsPrincipal user, AppDbContext db) =>
        {
            if (!await db.Events.OwnedBy(user.GetUserId()).AnyAsync(e => e.Id == eventId))
                return Results.NotFound();

            var list = await db.StaffAccesses.Where(s => s.EventId == eventId)
                .OrderBy(s => s.CreatedAt)
                .Select(s => new StaffAccessDto(s.Id, s.Label, s.ExpiresAt, s.CreatedAt,
                    db.CheckIns.Count(c => c.StaffAccessId == s.Id)))
                .ToListAsync();
            return Results.Ok(list);
        });

        group.MapPost("/", async (Guid eventId, CreateStaffAccessRequest req, ClaimsPrincipal user, AppDbContext db,
            TimeProvider clock) =>
        {
            var ev = await db.Events.OwnedBy(user.GetUserId()).FirstOrDefaultAsync(e => e.Id == eventId);
            if (ev is null) return Results.NotFound();
            if (ev.Status == EventStatus.Archived)
                return Results.Problem("El evento está archivado.", statusCode: StatusCodes.Status409Conflict);
            if (await db.StaffAccesses.CountAsync(s => s.EventId == eventId) >= 20)
                return Results.Problem("Máximo 20 accesos por evento.", statusCode: StatusCodes.Status409Conflict);

            var pin = StaffRules.NewPin();
            var access = new StaffAccess
            {
                Id = Guid.CreateVersion7(),
                EventId = ev.Id,
                Label = req.Label.Trim(),
                ExpiresAt = StaffRules.ExpirationFor(ev),
                CreatedAt = clock.GetUtcNow(),
            };
            access.PinHash = StaffPins.Hasher.HashPassword(access, pin);
            db.StaffAccesses.Add(access);
            await db.SaveChangesAsync();

            return Results.Created($"/api/events/{eventId}/staff/{access.Id}",
                new CreatedStaffAccessDto(access.Id, access.Label, access.ExpiresAt, pin));
        });

        group.MapDelete("/{id:guid}", async (Guid eventId, Guid id, ClaimsPrincipal user, AppDbContext db) =>
        {
            if (!await db.Events.OwnedBy(user.GetUserId()).AnyAsync(e => e.Id == eventId))
                return Results.NotFound();

            // Las entradas registradas se conservan (quedan sin hostess asociada).
            var deleted = await db.StaffAccesses.Where(s => s.Id == id && s.EventId == eventId).ExecuteDeleteAsync();
            return deleted == 0 ? Results.NotFound() : Results.NoContent();
        });

        return api;
    }
}

public static class StaffPins
{
    /// <summary>Mismo algoritmo que las contraseñas de Identity (PBKDF2).</summary>
    public static readonly PasswordHasher<StaffAccess> Hasher = new();
}
