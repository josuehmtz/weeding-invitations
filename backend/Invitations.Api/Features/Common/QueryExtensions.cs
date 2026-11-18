using Invitations.Api.Data;
using Invitations.Api.Domain;
using Microsoft.EntityFrameworkCore;

namespace Invitations.Api.Features.Common;

public static class QueryExtensions
{
    /// <summary>Solo los eventos del usuario: evita que un cliente vea o edite eventos ajenos.</summary>
    public static IQueryable<Event> OwnedBy(this IQueryable<Event> events, Guid userId) =>
        events.Where(e => e.OwnerId == userId);

    public static async Task<int> PassLimitAsync(this AppDbContext db, Event ev)
    {
        if (ev.MaxPasses > 0) return ev.MaxPasses;
        var largest = await db.Plans.Where(p => p.IsActive).MaxAsync(p => (int?)p.MaxPasses) ?? 0;
        return PassRules.EffectiveLimit(ev.MaxPasses, largest);
    }
}
