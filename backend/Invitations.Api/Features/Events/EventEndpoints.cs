using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using Invitations.Api.Data;
using Invitations.Api.Domain;
using Invitations.Api.Features.Common;
using Microsoft.EntityFrameworkCore;

namespace Invitations.Api.Features.Events;

public static class EventEndpoints
{
    public record EventSummaryDto(
        Guid Id, string Title, EventType Type, EventStatus Status, DateTimeOffset StartsAt,
        string? VenueName, int InvitationCount, int TotalPasses);

    public record EventDetailDto(
        Guid Id, string Title, EventType Type, EventStatus Status, DateTimeOffset StartsAt,
        string? VenueName, string? VenueAddress, string? MapsUrl, DateTimeOffset? RsvpDeadline,
        int InvitationCount, int TotalPasses, int PassLimit, RsvpSummaryDto Rsvp);

    /// <summary>Resumen de confirmaciones: invitaciones por estado y personas confirmadas.</summary>
    public record RsvpSummaryDto(int Confirmed, int Declined, int Pending, int ConfirmedPasses, int PendingPasses);

    public record SaveEventRequest(
        [property: Required, StringLength(200, MinimumLength = 1)] string Title,
        EventType Type,
        DateTimeOffset StartsAt,
        [property: StringLength(200)] string? VenueName,
        [property: StringLength(300)] string? VenueAddress,
        [property: Url, StringLength(500)] string? MapsUrl,
        DateTimeOffset? RsvpDeadline);

    public static IEndpointRouteBuilder MapEventEndpoints(this IEndpointRouteBuilder api)
    {
        var events = api.MapGroup("/events").WithTags("Events").RequireAuthorization();

        events.MapGet("/", async (ClaimsPrincipal user, AppDbContext db) =>
            await db.Events.OwnedBy(user.GetUserId())
                .OrderBy(e => e.StartsAt)
                .Select(e => new EventSummaryDto(
                    e.Id, e.Title, e.Type, e.Status, e.StartsAt, e.VenueName,
                    e.Invitations.Count, e.Invitations.Sum(i => i.Passes)))
                .ToListAsync());

        events.MapGet("/{id:guid}", async (Guid id, ClaimsPrincipal user, AppDbContext db) =>
        {
            var ev = await db.Events.OwnedBy(user.GetUserId()).FirstOrDefaultAsync(e => e.Id == id);
            return ev is null ? Results.NotFound() : Results.Ok(await ToDetailAsync(db, ev));
        });

        events.MapPost("/", async (SaveEventRequest req, ClaimsPrincipal user, AppDbContext db) =>
        {
            if (Validate(req) is { } problem) return problem;

            var ev = new Event { Id = Guid.CreateVersion7(), OwnerId = user.GetUserId() };
            Apply(ev, req);
            db.Events.Add(ev);
            await db.SaveChangesAsync();
            return Results.Created($"/api/events/{ev.Id}", await ToDetailAsync(db, ev));
        });

        events.MapPut("/{id:guid}", async (Guid id, SaveEventRequest req, ClaimsPrincipal user, AppDbContext db) =>
        {
            if (Validate(req) is { } problem) return problem;

            var ev = await db.Events.OwnedBy(user.GetUserId()).FirstOrDefaultAsync(e => e.Id == id);
            if (ev is null) return Results.NotFound();
            if (ev.Status == EventStatus.Archived)
                return Results.Problem("El evento está archivado y ya no se puede editar.", statusCode: 409);

            Apply(ev, req);
            await db.SaveChangesAsync();
            return Results.Ok(await ToDetailAsync(db, ev));
        });

        events.MapDelete("/{id:guid}", async (Guid id, ClaimsPrincipal user, AppDbContext db) =>
        {
            var ev = await db.Events.OwnedBy(user.GetUserId()).FirstOrDefaultAsync(e => e.Id == id);
            if (ev is null) return Results.NotFound();
            // Un evento pagado no se borra desde el panel (hay pagos asociados).
            if (ev.Status != EventStatus.Draft)
                return Results.Problem("Solo se pueden eliminar eventos en borrador.", statusCode: 409);

            db.Events.Remove(ev);
            await db.SaveChangesAsync();
            return Results.NoContent();
        });

        return api;
    }

    private static IResult? Validate(SaveEventRequest req)
    {
        if (req.RsvpDeadline is { } deadline && deadline > req.StartsAt)
            return Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["rsvpDeadline"] = ["La fecha límite de confirmación debe ser antes del evento."],
            });
        return null;
    }

    private static void Apply(Event ev, SaveEventRequest req)
    {
        ev.Title = req.Title.Trim();
        ev.Type = req.Type;
        // Postgres (timestamptz) guarda en UTC; el front muestra en la hora local del usuario.
        ev.StartsAt = req.StartsAt.ToUniversalTime();
        ev.VenueName = Clean(req.VenueName);
        ev.VenueAddress = Clean(req.VenueAddress);
        ev.MapsUrl = Clean(req.MapsUrl);
        ev.RsvpDeadline = req.RsvpDeadline?.ToUniversalTime();
    }

    private static string? Clean(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();

    private static async Task<EventDetailDto> ToDetailAsync(AppDbContext db, Event ev)
    {
        var byStatus = await db.Invitations.Where(i => i.EventId == ev.Id)
            .GroupBy(i => i.RsvpStatus)
            .Select(g => new { Status = g.Key, Count = g.Count(), Passes = g.Sum(i => i.Passes), Confirmed = g.Sum(i => i.ConfirmedPasses) })
            .ToListAsync();

        int CountOf(RsvpStatus s) => byStatus.Where(x => x.Status == s).Sum(x => x.Count);
        var rsvp = new RsvpSummaryDto(
            CountOf(RsvpStatus.Confirmed), CountOf(RsvpStatus.Declined), CountOf(RsvpStatus.Pending),
            ConfirmedPasses: byStatus.Sum(x => x.Confirmed),
            PendingPasses: byStatus.Where(x => x.Status == RsvpStatus.Pending).Sum(x => x.Passes));

        return new EventDetailDto(
            ev.Id, ev.Title, ev.Type, ev.Status, ev.StartsAt, ev.VenueName, ev.VenueAddress,
            ev.MapsUrl, ev.RsvpDeadline, byStatus.Sum(x => x.Count), byStatus.Sum(x => x.Passes),
            await db.PassLimitAsync(ev), rsvp);
    }
}
