using System.Text.Json;
using Invitations.Api.Data;
using Invitations.Api.Domain;
using Microsoft.EntityFrameworkCore;

namespace Invitations.Api.Features.Public;

/// <summary>Lo que ve un invitado al abrir su link. No requiere sesión: el token es la credencial.</summary>
public static class PublicInvitationEndpoints
{
    public const string RateLimitPolicy = "public";

    public record PublicEventDto(
        string Title, EventType Type, DateTimeOffset StartsAt, string? VenueName, string? VenueAddress,
        string? MapsUrl, DateTimeOffset? RsvpDeadline, string TemplateKey, JsonElement TemplateConfig);

    public record PublicInvitationDto(
        string DisplayName, int Passes, RsvpStatus RsvpStatus, int ConfirmedPasses,
        // true mientras el evento no está pagado: el front muestra un aviso de vista previa.
        bool IsPreview,
        PublicEventDto Event);

    public static IEndpointRouteBuilder MapPublicInvitationEndpoints(this IEndpointRouteBuilder api)
    {
        api.MapGet("/public/invitations/{token}", async (string token, AppDbContext db) =>
        {
            if (token.Length is < 16 or > 64) return Results.NotFound();

            var inv = await db.Invitations.AsNoTracking()
                .Include(i => i.Event)
                .FirstOrDefaultAsync(i => i.Token == token);
            if (inv is null) return Results.NotFound();

            var ev = inv.Event;
            var template = Templates.TemplateEndpoints.ToDto(ev);
            return Results.Ok(new PublicInvitationDto(
                inv.DisplayName, inv.Passes, inv.RsvpStatus, inv.ConfirmedPasses,
                IsPreview: ev.Status == EventStatus.Draft,
                new PublicEventDto(
                    ev.Title, ev.Type, ev.StartsAt, ev.VenueName, ev.VenueAddress, ev.MapsUrl,
                    ev.RsvpDeadline, template.TemplateKey, template.Config)));
        })
        .WithTags("Public")
        // Limita intentos por IP para que no se puedan probar tokens a lo loco.
        .RequireRateLimiting(RateLimitPolicy);

        return api;
    }
}
