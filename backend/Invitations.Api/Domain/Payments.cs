namespace Invitations.Api.Domain;

/// <summary>Reglas de cobro: qué paquete se puede comprar, cuánto cuesta y qué pasa al pagarse.</summary>
public static class PaymentRules
{
    /// <summary>
    /// Motivo por el que no se puede comprar el paquete, o null si sí se puede.
    /// <paramref name="current"/> es el paquete ya pagado (null si el evento es borrador).
    /// </summary>
    public static string? CannotBuyReason(Plan target, Plan? current, int totalPasses, EventStatus status)
    {
        if (status == EventStatus.Archived) return "El evento está archivado.";
        if (!target.IsActive) return "Este paquete ya no está disponible.";
        if (target.MaxPasses < totalPasses)
            return $"Tienes {totalPasses} invitados registrados y este paquete es para máximo {target.MaxPasses}.";
        if (current is not null && target.MaxPasses <= current.MaxPasses)
            return current.Id == target.Id ? "Ya tienes este paquete." : "Solo puedes cambiar a un paquete más grande.";
        return null;
    }

    /// <summary>Precio a cobrar: completo la primera vez, o la diferencia al subir de paquete.</summary>
    public static decimal AmountToPay(Plan target, Plan? current) =>
        Math.Max(0, target.PriceMxn - (current?.PriceMxn ?? 0));

    /// <summary>Stripe cobra en centavos.</summary>
    public static long ToCentavos(decimal mxn) => (long)Math.Round(mxn * 100, MidpointRounding.AwayFromZero);

    /// <summary>
    /// Marca la orden como pagada y aplica el paquete al evento. Es idempotente: Stripe puede avisar
    /// del mismo pago varias veces (webhook + regreso del cliente) y solo se aplica una vez.
    /// Devuelve false si la orden ya estaba pagada.
    /// </summary>
    public static bool MarkPaid(Order order, Event ev, Plan plan, DateTimeOffset now)
    {
        if (order.Status == OrderStatus.Paid) return false;

        order.Status = OrderStatus.Paid;
        order.PaidAt = now;

        // Nunca bajar de paquete aunque se procesen pagos fuera de orden.
        if (ev.MaxPasses < plan.MaxPasses)
        {
            ev.PlanId = plan.Id;
            ev.MaxPasses = plan.MaxPasses;
        }
        if (ev.Status == EventStatus.Draft) ev.Status = EventStatus.Published;
        return true;
    }

    public static void MarkFailed(Order order)
    {
        if (order.Status == OrderStatus.Pending) order.Status = OrderStatus.Failed;
    }
}
