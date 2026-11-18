using Invitations.Api.Domain;

namespace Invitations.Tests;

public class PaymentRulesTests
{
    private static readonly Plan Basico = new() { Id = 1, Code = "basico", Name = "Básico", MaxPasses = 100, PriceMxn = 499 };
    private static readonly Plan Estandar = new() { Id = 2, Code = "estandar", Name = "Estándar", MaxPasses = 250, PriceMxn = 899 };
    private static readonly Plan Premium = new() { Id = 3, Code = "premium", Name = "Premium", MaxPasses = 500, PriceMxn = 1499 };
    private static readonly DateTimeOffset Now = new(2026, 11, 18, 12, 0, 0, TimeSpan.Zero);

    [Fact]
    public void Draft_can_buy_any_plan_that_fits_its_guests()
    {
        Assert.Null(PaymentRules.CannotBuyReason(Basico, null, 80, EventStatus.Draft));
        Assert.Contains("máximo 100", PaymentRules.CannotBuyReason(Basico, null, 120, EventStatus.Draft));
        Assert.Null(PaymentRules.CannotBuyReason(Estandar, null, 120, EventStatus.Draft));
    }

    [Fact]
    public void Paid_event_can_only_upgrade()
    {
        Assert.Contains("Ya tienes", PaymentRules.CannotBuyReason(Estandar, Estandar, 10, EventStatus.Published));
        Assert.Contains("más grande", PaymentRules.CannotBuyReason(Basico, Estandar, 10, EventStatus.Published));
        Assert.Null(PaymentRules.CannotBuyReason(Premium, Estandar, 10, EventStatus.Published));
    }

    [Fact]
    public void Archived_event_cannot_buy() =>
        Assert.NotNull(PaymentRules.CannotBuyReason(Premium, null, 0, EventStatus.Archived));

    [Fact]
    public void Inactive_plan_cannot_be_bought() =>
        Assert.NotNull(PaymentRules.CannotBuyReason(new Plan { Id = 9, MaxPasses = 1000, IsActive = false }, null, 0, EventStatus.Draft));

    [Fact]
    public void Upgrade_charges_only_the_difference()
    {
        Assert.Equal(899m, PaymentRules.AmountToPay(Estandar, null));
        Assert.Equal(600m, PaymentRules.AmountToPay(Premium, Estandar));
    }

    [Theory]
    [InlineData(499, 49900)]
    [InlineData(899.5, 89950)]
    [InlineData(0.005, 1)]
    public void Converts_pesos_to_centavos(decimal mxn, long centavos) =>
        Assert.Equal(centavos, PaymentRules.ToCentavos(mxn));

    [Fact]
    public void MarkPaid_publishes_event_and_applies_plan_once()
    {
        var ev = new Event { Status = EventStatus.Draft };
        var order = new Order { Status = OrderStatus.Pending };

        Assert.True(PaymentRules.MarkPaid(order, ev, Estandar, Now));
        Assert.Equal(OrderStatus.Paid, order.Status);
        Assert.Equal(Now, order.PaidAt);
        Assert.Equal(EventStatus.Published, ev.Status);
        Assert.Equal(250, ev.MaxPasses);
        Assert.Equal(Estandar.Id, ev.PlanId);

        // Webhook repetido: no vuelve a aplicar ni cambia la fecha de pago.
        Assert.False(PaymentRules.MarkPaid(order, ev, Estandar, Now.AddMinutes(5)));
        Assert.Equal(Now, order.PaidAt);
    }

    [Fact]
    public void Late_payment_of_smaller_plan_never_downgrades()
    {
        var ev = new Event { Status = EventStatus.Published, PlanId = Premium.Id, MaxPasses = 500 };
        PaymentRules.MarkPaid(new Order(), ev, Basico, Now);
        Assert.Equal(500, ev.MaxPasses);
        Assert.Equal(Premium.Id, ev.PlanId);
    }

    [Fact]
    public void MarkFailed_only_affects_pending_orders()
    {
        var paid = new Order { Status = OrderStatus.Paid };
        PaymentRules.MarkFailed(paid);
        Assert.Equal(OrderStatus.Paid, paid.Status);

        var pending = new Order { Status = OrderStatus.Pending };
        PaymentRules.MarkFailed(pending);
        Assert.Equal(OrderStatus.Failed, pending.Status);
    }

    [Fact]
    public void Draft_events_cannot_receive_rsvp() =>
        Assert.Contains("vista previa", RsvpRules.BlockedReason(
            new Event { Status = EventStatus.Draft, StartsAt = Now.AddDays(30) }, Now));
}
