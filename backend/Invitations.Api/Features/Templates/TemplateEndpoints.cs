using System.Security.Claims;
using System.Text.Json;
using Invitations.Api.Data;
using Invitations.Api.Domain;
using Invitations.Api.Features.Common;
using Microsoft.EntityFrameworkCore;

namespace Invitations.Api.Features.Templates;

public static class TemplateEndpoints
{
    public record TemplateDto(string TemplateKey, JsonElement Config);

    public record SaveTemplateRequest(string TemplateKey, JsonElement Config);

    public static IEndpointRouteBuilder MapTemplateEndpoints(this IEndpointRouteBuilder api)
    {
        var group = api.MapGroup("/events/{eventId:guid}/template")
            .WithTags("Templates")
            .RequireAuthorization();

        group.MapGet("/", async (Guid eventId, ClaimsPrincipal user, AppDbContext db) =>
        {
            var ev = await db.Events.OwnedBy(user.GetUserId()).FirstOrDefaultAsync(e => e.Id == eventId);
            return ev is null ? Results.NotFound() : Results.Ok(ToDto(ev));
        });

        group.MapPut("/", async (Guid eventId, SaveTemplateRequest req, ClaimsPrincipal user, AppDbContext db) =>
        {
            var ev = await db.Events.OwnedBy(user.GetUserId()).FirstOrDefaultAsync(e => e.Id == eventId);
            if (ev is null) return Results.NotFound();
            if (ev.Status == EventStatus.Archived)
                return Results.Problem("El evento está archivado y ya no se puede editar.", statusCode: 409);

            if (Domain.Templates.Validate(req.TemplateKey, req.Config) is { } error)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["template"] = [error] });

            ev.TemplateKey = req.TemplateKey;
            ev.TemplateConfig = req.Config.GetRawText();
            await db.SaveChangesAsync();
            return Results.Ok(ToDto(ev));
        });

        return api;
    }

    public static TemplateDto ToDto(Event ev) => new(
        string.IsNullOrEmpty(ev.TemplateKey) ? Domain.Templates.DefaultFor(ev.Type) : ev.TemplateKey,
        Domain.Templates.Parse(ev.TemplateConfig));
}
