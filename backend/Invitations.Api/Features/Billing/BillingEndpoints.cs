using System.Security.Claims;
using Invitations.Api.Data;
using Invitations.Api.Domain;
using Invitations.Api.Features.Common;
using Microsoft.EntityFrameworkCore;
using Event = Invitations.Api.Domain.Event;
using StripeException = Stripe.StripeException;

namespace Invitations.Api.Features.Billing;

/// <summary>Compra y mejora de paquetes con Stripe Checkout (tarjeta y OXXO, en MXN).</summary>
public static class BillingEndpoints
{
    public record PlanOptionDto(string Code, string Name, int MaxPasses, decimal PriceMxn, decimal AmountToPay,
        bool Available, string? Reason);

    public record OrderDto(Guid Id, string PlanName, decimal AmountMxn, OrderStatus Status, DateTimeOffset CreatedAt,
        DateTimeOffset? PaidAt);

    public record BillingDto(EventStatus EventStatus, string? CurrentPlan, int MaxPasses, int TotalPasses,
        bool PaymentsEnabled, IReadOnlyList<PlanOptionDto> Options, IReadOnlyList<OrderDto> Orders);

    public record CheckoutRequestDto(string PlanCode);

    public record CheckoutResponseDto(string Url);

    public record SyncRequest(string SessionId);

    public static IEndpointRouteBuilder MapBillingEndpoints(this IEndpointRouteBuilder api)
    {
        var group = api.MapGroup("/events/{eventId:guid}").WithTags("Billing").RequireAuthorization();

        group.MapGet("/billing", async (Guid eventId, ClaimsPrincipal user, AppDbContext db, IPaymentGateway gateway) =>
        {
            var ev = await db.Events.OwnedBy(user.GetUserId()).Include(e => e.Plan).FirstOrDefaultAsync(e => e.Id == eventId);
            return ev is null ? Results.NotFound() : Results.Ok(await LoadAsync(db, ev, gateway));
        });

        group.MapPost("/checkout", async (Guid eventId, CheckoutRequestDto req, ClaimsPrincipal user, AppDbContext db,
            IPaymentGateway gateway, IConfiguration config, TimeProvider clock, ILoggerFactory logs) =>
        {
            if (!gateway.IsConfigured)
                return Results.Problem("Los pagos aún no están configurados.", statusCode: StatusCodes.Status503ServiceUnavailable);

            var ev = await db.Events.OwnedBy(user.GetUserId()).Include(e => e.Plan).FirstOrDefaultAsync(e => e.Id == eventId);
            if (ev is null) return Results.NotFound();

            var plan = await db.Plans.FirstOrDefaultAsync(p => p.Code == req.PlanCode);
            if (plan is null) return Results.NotFound();

            var totalPasses = await db.Invitations.Where(i => i.EventId == eventId).SumAsync(i => i.Passes);
            if (PaymentRules.CannotBuyReason(plan, ev.Plan, totalPasses, ev.Status) is { } reason)
                return Results.Problem(reason, statusCode: StatusCodes.Status409Conflict);

            var amount = PaymentRules.AmountToPay(plan, ev.Plan);
            if (amount <= 0)
                return Results.Problem("Este paquete no tiene costo adicional.", statusCode: StatusCodes.Status409Conflict);

            var publicUrl = config["App:PublicUrl"]?.TrimEnd('/')
                ?? throw new InvalidOperationException("Falta App:PublicUrl.");

            var order = new Order
            {
                Id = Guid.CreateVersion7(),
                EventId = ev.Id,
                PlanId = plan.Id,
                AmountMxn = amount,
                CreatedAt = clock.GetUtcNow(),
            };
            db.Orders.Add(order);

            try
            {
                var upgrade = ev.Plan is not null;
                var checkout = await gateway.CreateCheckoutAsync(new CheckoutRequest(
                    order.Id, ev.Id,
                    ProductName: upgrade ? $"Cambio a paquete {plan.Name} · {ev.Title}" : $"Paquete {plan.Name} · {ev.Title}",
                    Description: $"Invitaciones digitales para hasta {plan.MaxPasses} invitados",
                    PaymentRules.ToCentavos(amount),
                    user.Identity?.Name ?? "",
                    SuccessUrl: $"{publicUrl}/app/events/{ev.Id}?pago=exito&session_id={{CHECKOUT_SESSION_ID}}",
                    CancelUrl: $"{publicUrl}/app/events/{ev.Id}?pago=cancelado"));

                order.ProviderSessionId = checkout.SessionId;
                await db.SaveChangesAsync();
                return Results.Ok(new CheckoutResponseDto(checkout.Url));
            }
            catch (StripeException ex)
            {
                logs.CreateLogger("Billing").LogError(ex, "Stripe rechazó la creación del checkout");
                return Results.Problem("No pudimos iniciar el pago. Intenta de nuevo en unos minutos.", statusCode: StatusCodes.Status502BadGateway);
            }
        });

        // Al regresar de Stripe el front confirma el estado. Así el pago con tarjeta se refleja al instante
        // aunque el webhook tarde (o no esté configurado en desarrollo).
        group.MapPost("/checkout/sync", async (Guid eventId, SyncRequest req, ClaimsPrincipal user, AppDbContext db,
            IPaymentGateway gateway, TimeProvider clock) =>
        {
            var ev = await db.Events.OwnedBy(user.GetUserId()).FirstOrDefaultAsync(e => e.Id == eventId);
            if (ev is null) return Results.NotFound();
            if (!gateway.IsConfigured) return Results.Problem("Los pagos aún no están configurados.", statusCode: 503);

            var order = await db.Orders.FirstOrDefaultAsync(o => o.EventId == eventId && o.ProviderSessionId == req.SessionId);
            if (order is null) return Results.NotFound();

            var status = await gateway.GetCheckoutAsync(req.SessionId);
            await ApplyAsync(db, status, clock);

            await db.Entry(ev).Reference(e => e.Plan).LoadAsync();
            return Results.Ok(await LoadAsync(db, ev, gateway));
        });

        // Stripe avisa aquí de pagos completados (incluidos los de OXXO, que se pagan días después).
        api.MapPost("/stripe/webhook", async (HttpRequest request, AppDbContext db, IPaymentGateway gateway,
            TimeProvider clock, ILoggerFactory logs) =>
        {
            // Sin secreto no podemos verificar que el aviso venga de Stripe: se rechaza.
            if (!gateway.WebhooksConfigured)
            {
                logs.CreateLogger("Billing").LogWarning("Webhook de Stripe recibido pero falta Stripe:WebhookSecret");
                return Results.StatusCode(StatusCodes.Status503ServiceUnavailable);
            }

            var json = await new StreamReader(request.Body).ReadToEndAsync();
            CheckoutStatus? status;
            try
            {
                status = gateway.ParseWebhook(json, request.Headers["Stripe-Signature"].ToString());
            }
            catch (StripeException ex)
            {
                logs.CreateLogger("Billing").LogWarning(ex, "Webhook de Stripe con firma inválida");
                return Results.BadRequest();
            }

            if (status is not null) await ApplyAsync(db, status, clock);
            return Results.Ok();
        }).WithTags("Billing").AllowAnonymous();

        return api;
    }

    private static async Task ApplyAsync(AppDbContext db, CheckoutStatus status, TimeProvider clock)
    {
        var order = await db.Orders.Include(o => o.Event).Include(o => o.Plan)
            .FirstOrDefaultAsync(o => o.ProviderSessionId == status.SessionId || (status.OrderId != null && o.Id == status.OrderId));
        if (order is null) return;

        switch (status.State)
        {
            case CheckoutState.Paid:
                PaymentRules.MarkPaid(order, order.Event, order.Plan, clock.GetUtcNow());
                break;
            case CheckoutState.Failed:
                PaymentRules.MarkFailed(order);
                break;
        }
        await db.SaveChangesAsync();
    }

    private static async Task<BillingDto> LoadAsync(AppDbContext db, Event ev, IPaymentGateway gateway)
    {
        var plans = await db.Plans.Where(p => p.IsActive).OrderBy(p => p.MaxPasses).ToListAsync();
        var totalPasses = await db.Invitations.Where(i => i.EventId == ev.Id).SumAsync(i => i.Passes);
        var orders = await db.Orders.Where(o => o.EventId == ev.Id)
            .OrderByDescending(o => o.CreatedAt)
            .Select(o => new OrderDto(o.Id, o.Plan.Name, o.AmountMxn, o.Status, o.CreatedAt, o.PaidAt))
            .ToListAsync();

        var options = plans.Select(p =>
        {
            var reason = PaymentRules.CannotBuyReason(p, ev.Plan, totalPasses, ev.Status);
            return new PlanOptionDto(p.Code, p.Name, p.MaxPasses, p.PriceMxn, PaymentRules.AmountToPay(p, ev.Plan),
                reason is null, reason);
        }).ToList();

        return new BillingDto(ev.Status, ev.Plan?.Name, ev.MaxPasses, totalPasses, gateway.IsConfigured, options, orders);
    }
}
