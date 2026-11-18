using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using Invitations.Api.Data;
using Invitations.Api.Domain;
using Invitations.Api.Features.Common;
using Microsoft.EntityFrameworkCore;

namespace Invitations.Api.Features.Invitations;

public static class InvitationEndpoints
{
    public record InvitationDto(
        Guid Id, string DisplayName, int Passes, string? Phone, string Token,
        RsvpStatus RsvpStatus, int ConfirmedPasses);

    public record SaveInvitationRequest(
        [property: Required, StringLength(200, MinimumLength = 1)] string DisplayName,
        [property: Range(1, 50)] int Passes,
        [property: StringLength(20), RegularExpression(@"^\+?[0-9 ()\-]{7,20}$",
            ErrorMessage = "Teléfono inválido.")] string? Phone);

    public static IEndpointRouteBuilder MapInvitationEndpoints(this IEndpointRouteBuilder api)
    {
        var group = api.MapGroup("/events/{eventId:guid}/invitations")
            .WithTags("Invitations")
            .RequireAuthorization();

        group.MapGet("/", async (Guid eventId, ClaimsPrincipal user, AppDbContext db) =>
        {
            if (!await db.Events.OwnedBy(user.GetUserId()).AnyAsync(e => e.Id == eventId))
                return Results.NotFound();

            var list = await db.Invitations.Where(i => i.EventId == eventId)
                .OrderBy(i => i.DisplayName)
                .Select(i => ToDto(i))
                .ToListAsync();
            return Results.Ok(list);
        });

        group.MapPost("/", async (Guid eventId, SaveInvitationRequest req, ClaimsPrincipal user, AppDbContext db) =>
        {
            var ev = await db.Events.OwnedBy(user.GetUserId()).FirstOrDefaultAsync(e => e.Id == eventId);
            if (ev is null) return Results.NotFound();
            if (Editable(ev) is { } blocked) return blocked;
            if (await CheckLimitAsync(db, ev, previousPasses: 0, req.Passes) is { } overLimit) return overLimit;

            var inv = new Invitation
            {
                Id = Guid.CreateVersion7(),
                EventId = ev.Id,
                Token = InvitationTokens.New(),
            };
            Apply(inv, req);
            db.Invitations.Add(inv);
            await db.SaveChangesAsync();
            return Results.Created($"/api/events/{eventId}/invitations/{inv.Id}", ToDto(inv));
        });

        group.MapPut("/{id:guid}", async (Guid eventId, Guid id, SaveInvitationRequest req, ClaimsPrincipal user, AppDbContext db) =>
        {
            var ev = await db.Events.OwnedBy(user.GetUserId()).FirstOrDefaultAsync(e => e.Id == eventId);
            if (ev is null) return Results.NotFound();
            if (Editable(ev) is { } blocked) return blocked;

            var inv = await db.Invitations.FirstOrDefaultAsync(i => i.Id == id && i.EventId == eventId);
            if (inv is null) return Results.NotFound();
            if (req.Passes < inv.ConfirmedPasses)
                return Results.Problem(
                    $"Esta invitación ya confirmó {inv.ConfirmedPasses} pases; no puedes asignarle menos.",
                    statusCode: 409);
            if (await CheckLimitAsync(db, ev, inv.Passes, req.Passes) is { } overLimit) return overLimit;

            Apply(inv, req);
            await db.SaveChangesAsync();
            return Results.Ok(ToDto(inv));
        });

        group.MapDelete("/{id:guid}", async (Guid eventId, Guid id, ClaimsPrincipal user, AppDbContext db) =>
        {
            var ev = await db.Events.OwnedBy(user.GetUserId()).FirstOrDefaultAsync(e => e.Id == eventId);
            if (ev is null) return Results.NotFound();
            if (Editable(ev) is { } blocked) return blocked;

            var deleted = await db.Invitations.Where(i => i.Id == id && i.EventId == eventId).ExecuteDeleteAsync();
            return deleted == 0 ? Results.NotFound() : Results.NoContent();
        });

        return api;
    }

    private static IResult? Editable(Event ev) => ev.Status == EventStatus.Archived
        ? Results.Problem("El evento está archivado y ya no se puede editar.", statusCode: 409)
        : null;

    private static async Task<IResult?> CheckLimitAsync(AppDbContext db, Event ev, int previousPasses, int newPasses)
    {
        var limit = await db.PassLimitAsync(ev);
        var total = await db.Invitations.Where(i => i.EventId == ev.Id).SumAsync(i => i.Passes);
        if (PassRules.Fits(limit, total, previousPasses, newPasses)) return null;

        var available = Math.Max(0, limit - (total - previousPasses));
        return Results.Problem(
            $"Superas el límite de {limit} invitados de tu paquete. Te quedan {available} pases disponibles.",
            statusCode: 409);
    }

    private static void Apply(Invitation inv, SaveInvitationRequest req)
    {
        inv.DisplayName = req.DisplayName.Trim();
        inv.Passes = req.Passes;
        inv.Phone = string.IsNullOrWhiteSpace(req.Phone) ? null : req.Phone.Trim();
    }

    private static InvitationDto ToDto(Invitation i) =>
        new(i.Id, i.DisplayName, i.Passes, i.Phone, i.Token, i.RsvpStatus, i.ConfirmedPasses);
}
