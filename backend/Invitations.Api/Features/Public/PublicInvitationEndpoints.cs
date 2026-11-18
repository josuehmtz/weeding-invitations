using System.Text.Json;
using Invitations.Api.Data;
using Invitations.Api.Domain;
using Microsoft.EntityFrameworkCore;

namespace Invitations.Api.Features.Public;

/// <summary>Lo que ve y hace un invitado desde su link. No requiere sesión: el token es la credencial.</summary>
public static class PublicInvitationEndpoints
{
    public const string RateLimitPolicy = "public";

    public record PublicEventDto(
        string Title, EventType Type, DateTimeOffset StartsAt, string? VenueName, string? VenueAddress,
        string? MapsUrl, DateTimeOffset? RsvpDeadline, string TemplateKey, JsonElement TemplateConfig);

    public record PublicInvitationDto(
        string DisplayName, int Passes, RsvpStatus RsvpStatus, int ConfirmedPasses,
        IReadOnlyList<string> GuestNames, string? Message,
        // Motivo por el que ya no se puede responder (fecha límite, evento pasado), o null.
        string? RsvpClosedReason,
        // true mientras el evento no está pagado: el front muestra un aviso de vista previa.
        bool IsPreview,
        PublicEventDto Event);

    public record RsvpRequest(bool Attending, int ConfirmedPasses, IReadOnlyList<string>? GuestNames, string? Message);

    public static IEndpointRouteBuilder MapPublicInvitationEndpoints(this IEndpointRouteBuilder api)
    {
        var group = api.MapGroup("/public/invitations/{token}")
            .WithTags("Public")
            // Limita intentos por IP para que no se puedan probar tokens a lo loco.
            .RequireRateLimiting(RateLimitPolicy);

        group.MapGet("/", async (string token, AppDbContext db, TimeProvider clock) =>
        {
            var inv = await FindAsync(db, token, tracking: false);
            return inv is null ? Results.NotFound() : Results.Ok(ToDto(inv, clock.GetUtcNow()));
        });

        group.MapPost("/rsvp", async (string token, RsvpRequest req, AppDbContext db, TimeProvider clock) =>
        {
            var inv = await FindAsync(db, token, tracking: true);
            if (inv is null) return Results.NotFound();

            var now = clock.GetUtcNow();
            if (RsvpRules.BlockedReason(inv.Event, now) is { } closed)
                return Results.Problem(closed, statusCode: StatusCodes.Status409Conflict);
            if (RsvpRules.Validate(inv, req.Attending, req.ConfirmedPasses, req.GuestNames) is { } invalid)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["rsvp"] = [invalid] });

            RsvpRules.Apply(inv, req.Attending, req.ConfirmedPasses, req.GuestNames, req.Message, now);
            await db.SaveChangesAsync();
            return Results.Ok(ToDto(inv, now));
        });

        return api;
    }

    private static async Task<Invitation?> FindAsync(AppDbContext db, string token, bool tracking)
    {
        if (token.Length is < 16 or > 64) return null;
        var query = db.Invitations.Include(i => i.Event).Include(i => i.Guests).AsQueryable();
        if (!tracking) query = query.AsNoTracking();
        return await query.FirstOrDefaultAsync(i => i.Token == token);
    }

    private static PublicInvitationDto ToDto(Invitation inv, DateTimeOffset now)
    {
        var ev = inv.Event;
        var template = Templates.TemplateEndpoints.ToDto(ev);
        return new PublicInvitationDto(
            inv.DisplayName, inv.Passes, inv.RsvpStatus, inv.ConfirmedPasses,
            inv.Guests.OrderBy(g => g.Id).Select(g => g.Name).ToList(),
            inv.Message,
            RsvpRules.BlockedReason(ev, now),
            IsPreview: ev.Status == EventStatus.Draft,
            new PublicEventDto(
                ev.Title, ev.Type, ev.StartsAt, ev.VenueName, ev.VenueAddress, ev.MapsUrl,
                ev.RsvpDeadline, template.TemplateKey, template.Config));
    }
}
