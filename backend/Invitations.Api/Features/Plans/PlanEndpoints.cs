using Invitations.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace Invitations.Api.Features.Plans;

public static class PlanEndpoints
{
    public record PlanDto(string Code, string Name, int MaxPasses, decimal PriceMxn);

    public static IEndpointRouteBuilder MapPlanEndpoints(this IEndpointRouteBuilder api)
    {
        api.MapGet("/plans", async (AppDbContext db) =>
            await db.Plans
                .Where(p => p.IsActive)
                .OrderBy(p => p.MaxPasses)
                .Select(p => new PlanDto(p.Code, p.Name, p.MaxPasses, p.PriceMxn))
                .ToListAsync())
            .WithTags("Plans");

        return api;
    }
}
