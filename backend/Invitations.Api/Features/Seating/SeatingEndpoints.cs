using System.Security.Claims;
using System.Text.Json;
using Invitations.Api.Data;
using Invitations.Api.Domain;
using Invitations.Api.Features.Common;
using Microsoft.EntityFrameworkCore;

namespace Invitations.Api.Features.Seating;

/// <summary>Plano del salón (mesas y elementos) y asignación de personas confirmadas a mesas.</summary>
public static class SeatingEndpoints
{
    public record TableDto(Guid Id, int Number, string? Label, TableShape Shape, int Capacity,
        double X, double Y, double Rotation, int Seated);

    public record SeatGuestDto(Guid Id, string Name, Guid InvitationId, string InvitationName, Guid? TableId);

    public record SeatingDto(SeatingLayout Layout, IReadOnlyList<TableDto> Tables, IReadOnlyList<SeatGuestDto> Guests,
        int PendingInvitations, int PendingPasses);

    public record SavePlanRequest(SeatingLayout Layout, IReadOnlyList<TableInput> Tables);

    public record Move(Guid GuestId, Guid? TableId);

    public record AssignRequest(IReadOnlyList<Move> Moves);

    public static IEndpointRouteBuilder MapSeatingEndpoints(this IEndpointRouteBuilder api)
    {
        var group = api.MapGroup("/events/{eventId:guid}/seating")
            .WithTags("Seating")
            .RequireAuthorization();

        group.MapGet("/", async (Guid eventId, ClaimsPrincipal user, AppDbContext db) =>
        {
            var ev = await db.Events.OwnedBy(user.GetUserId()).FirstOrDefaultAsync(e => e.Id == eventId);
            return ev is null ? Results.NotFound() : Results.Ok(await LoadAsync(db, ev));
        });

        group.MapPut("/plan", async (Guid eventId, SavePlanRequest req, ClaimsPrincipal user, AppDbContext db) =>
        {
            var ev = await db.Events.OwnedBy(user.GetUserId()).FirstOrDefaultAsync(e => e.Id == eventId);
            if (ev is null) return Results.NotFound();
            if (ev.Status == EventStatus.Archived) return Archived();

            if (SeatingRules.ValidateLayout(req.Layout) is { } layoutError) return Invalid(layoutError);

            var existing = await db.Tables.Where(t => t.EventId == eventId).ToListAsync();
            var seated = await db.Guests
                .Where(g => g.TableId != null && g.Invitation.EventId == eventId)
                .GroupBy(g => g.TableId!.Value)
                .ToDictionaryAsync(g => g.Key, g => g.Count());

            if (SeatingRules.ValidateTables(req.Tables, seated) is { } tableError) return Invalid(tableError);
            var existingById = existing.ToDictionary(t => t.Id);
            if (req.Tables.Any(t => t.Id is { } id && !existingById.ContainsKey(id)))
                return Invalid("Una de las mesas no pertenece a este evento.");

            await using var tx = await db.Database.BeginTransactionAsync();

            // Paso 1: quitar mesas eliminadas y mover números a valores temporales negativos,
            // para que intercambiar números (1 ↔ 2) no choque con el índice único.
            var keep = req.Tables.Where(t => t.Id is not null).Select(t => t.Id!.Value).ToHashSet();
            db.Tables.RemoveRange(existing.Where(t => !keep.Contains(t.Id)));
            foreach (var t in existing.Where(t => keep.Contains(t.Id)))
                t.Number = -t.Number;
            await db.SaveChangesAsync();

            // Paso 2: valores finales.
            foreach (var input in req.Tables)
            {
                var table = input.Id is { } id
                    ? existingById[id]
                    : db.Tables.Add(new EventTable { Id = Guid.CreateVersion7(), EventId = eventId }).Entity;
                table.Number = input.Number;
                table.Label = string.IsNullOrWhiteSpace(input.Label) ? null : input.Label.Trim();
                table.Shape = input.Shape;
                table.Capacity = input.Capacity;
                table.X = Math.Round(input.X, 1);
                table.Y = Math.Round(input.Y, 1);
                table.Rotation = Math.Round(input.Rotation % 360, 1);
            }
            ev.LayoutConfig = JsonSerializer.Serialize(req.Layout, JsonSerializerOptions.Web);
            await db.SaveChangesAsync();
            await tx.CommitAsync();

            return Results.Ok(await LoadAsync(db, ev));
        });

        group.MapPut("/assignments", async (Guid eventId, AssignRequest req, ClaimsPrincipal user, AppDbContext db) =>
        {
            var ev = await db.Events.OwnedBy(user.GetUserId()).FirstOrDefaultAsync(e => e.Id == eventId);
            if (ev is null) return Results.NotFound();
            if (ev.Status == EventStatus.Archived) return Archived();
            if (req.Moves.Count is 0 or > 500) return Invalid("Indica de 1 a 500 movimientos.");

            var guests = await db.Guests.Where(g => g.Invitation.EventId == eventId).ToListAsync();
            var tables = await db.Tables.Where(t => t.EventId == eventId)
                .ToDictionaryAsync(t => t.Id, t => (t.Number, t.Capacity));

            var (result, error) = SeatingRules.ApplyAssignments(
                guests.ToDictionary(g => g.Id, g => g.TableId),
                req.Moves.Select(m => (m.GuestId, m.TableId)).ToList(),
                tables);
            if (error is not null) return Results.Problem(error, statusCode: StatusCodes.Status409Conflict);

            foreach (var g in guests) g.TableId = result[g.Id];
            await db.SaveChangesAsync();
            return Results.Ok(await LoadAsync(db, ev));
        });

        return api;
    }

    private static IResult Invalid(string message) =>
        Results.ValidationProblem(new Dictionary<string, string[]> { ["seating"] = [message] });

    private static IResult Archived() =>
        Results.Problem("El evento está archivado y ya no se puede editar.", statusCode: StatusCodes.Status409Conflict);

    public static SeatingLayout ParseLayout(string json)
    {
        try
        {
            var layout = JsonSerializer.Deserialize<SeatingLayout>(json, JsonSerializerOptions.Web);
            return layout is null || layout.Width == 0 ? SeatingLayout.Default : layout with { Elements = layout.Elements ?? [] };
        }
        catch (JsonException)
        {
            return SeatingLayout.Default;
        }
    }

    private static async Task<SeatingDto> LoadAsync(AppDbContext db, Event ev)
    {
        var guests = await db.Guests.AsNoTracking()
            .Where(g => g.Invitation.EventId == ev.Id)
            .OrderBy(g => g.Invitation.DisplayName).ThenBy(g => g.Id)
            .Select(g => new SeatGuestDto(g.Id, g.Name, g.InvitationId, g.Invitation.DisplayName, g.TableId))
            .ToListAsync();

        var seated = guests.Where(g => g.TableId is not null).GroupBy(g => g.TableId!.Value)
            .ToDictionary(g => g.Key, g => g.Count());

        var tables = await db.Tables.AsNoTracking().Where(t => t.EventId == ev.Id).OrderBy(t => t.Number).ToListAsync();

        var pending = await db.Invitations.Where(i => i.EventId == ev.Id && i.RsvpStatus == RsvpStatus.Pending)
            .GroupBy(_ => 1)
            .Select(g => new { Count = g.Count(), Passes = g.Sum(i => i.Passes) })
            .FirstOrDefaultAsync();

        return new SeatingDto(
            ParseLayout(ev.LayoutConfig),
            tables.Select(t => new TableDto(t.Id, t.Number, t.Label, t.Shape, t.Capacity, t.X, t.Y, t.Rotation,
                seated.GetValueOrDefault(t.Id))).ToList(),
            guests,
            pending?.Count ?? 0,
            pending?.Passes ?? 0);
    }
}
