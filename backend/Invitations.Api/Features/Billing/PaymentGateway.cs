using Stripe;
using Stripe.Checkout;

namespace Invitations.Api.Features.Billing;

public class StripeOptions
{
    private string? _secretKey;
    private string? _webhookSecret;

    // Trim: los secretos pegados en consola (Secret Manager) a veces traen un salto de línea al final.

    /// <summary>Llave secreta (sk_test_... en pruebas). Se guarda con user-secrets o variable de entorno, nunca en el repo.</summary>
    public string? SecretKey { get => _secretKey; set => _secretKey = value?.Trim(); }
    /// <summary>Secreto de firma del webhook (whsec_...).</summary>
    public string? WebhookSecret { get => _webhookSecret; set => _webhookSecret = value?.Trim(); }
}

public record CheckoutRequest(
    Guid OrderId, Guid EventId, string ProductName, string Description, long AmountCentavos,
    string CustomerEmail, string SuccessUrl, string CancelUrl);

public record CheckoutCreated(string SessionId, string Url);

public enum CheckoutState { Pending, Paid, Failed }

public record CheckoutStatus(string SessionId, Guid? OrderId, CheckoutState State);

/// <summary>Proveedor de pagos. La interfaz permite cambiar de proveedor (p. ej. Mercado Pago) o simularlo en pruebas.</summary>
public interface IPaymentGateway
{
    bool IsConfigured { get; }
    /// <summary>Hay secreto para verificar la firma de los webhooks.</summary>
    bool WebhooksConfigured { get; }
    Task<CheckoutCreated> CreateCheckoutAsync(CheckoutRequest request, CancellationToken ct = default);
    Task<CheckoutStatus> GetCheckoutAsync(string sessionId, CancellationToken ct = default);
    /// <summary>Valida la firma del webhook y lo traduce. Null si el evento no nos interesa.</summary>
    CheckoutStatus? ParseWebhook(string json, string signatureHeader);
}

public class StripePaymentGateway(Microsoft.Extensions.Options.IOptions<StripeOptions> options) : IPaymentGateway
{
    private readonly StripeOptions _options = options.Value;
    private StripeClient Client => new(_options.SecretKey);

    public bool IsConfigured => !string.IsNullOrWhiteSpace(_options.SecretKey);
    public bool WebhooksConfigured => !string.IsNullOrWhiteSpace(_options.WebhookSecret);

    public async Task<CheckoutCreated> CreateCheckoutAsync(CheckoutRequest r, CancellationToken ct = default)
    {
        var metadata = new Dictionary<string, string>
        {
            ["orderId"] = r.OrderId.ToString(),
            ["eventId"] = r.EventId.ToString(),
        };
        var session = await new SessionService(Client).CreateAsync(new SessionCreateOptions
        {
            Mode = "payment",
            Currency = "mxn",
            Locale = "es-419",
            CustomerEmail = r.CustomerEmail,
            ClientReferenceId = r.OrderId.ToString(),
            Metadata = metadata,
            PaymentIntentData = new SessionPaymentIntentDataOptions { Metadata = metadata },
            // Sin PaymentMethodTypes: Stripe ofrece los métodos activados en el Dashboard (tarjeta, OXXO...).
            LineItems =
            [
                new SessionLineItemOptions
                {
                    Quantity = 1,
                    PriceData = new SessionLineItemPriceDataOptions
                    {
                        Currency = "mxn",
                        UnitAmount = r.AmountCentavos,
                        ProductData = new SessionLineItemPriceDataProductDataOptions
                        {
                            Name = r.ProductName,
                            Description = r.Description,
                        },
                    },
                },
            ],
            SuccessUrl = r.SuccessUrl,
            CancelUrl = r.CancelUrl,
        }, cancellationToken: ct);

        return new CheckoutCreated(session.Id, session.Url);
    }

    public async Task<CheckoutStatus> GetCheckoutAsync(string sessionId, CancellationToken ct = default) =>
        ToStatus(await new SessionService(Client).GetAsync(sessionId, cancellationToken: ct));

    public CheckoutStatus? ParseWebhook(string json, string signatureHeader)
    {
        if (string.IsNullOrWhiteSpace(_options.WebhookSecret))
            throw new InvalidOperationException("Falta Stripe:WebhookSecret.");

        // Lanza StripeException si la firma no es válida (alguien intentando falsificar un pago).
        var stripeEvent = EventUtility.ConstructEvent(json, signatureHeader, _options.WebhookSecret,
            throwOnApiVersionMismatch: false);

        if (stripeEvent.Data.Object is not Session session) return null;
        return stripeEvent.Type switch
        {
            "checkout.session.completed" or "checkout.session.async_payment_succeeded" => ToStatus(session),
            "checkout.session.async_payment_failed" or "checkout.session.expired" =>
                ToStatus(session) with { State = CheckoutState.Failed },
            _ => null,
        };
    }

    private static CheckoutStatus ToStatus(Session s)
    {
        // "paid" = cobrado. Con OXXO la sesión se completa como "unpaid" hasta que el cliente paga en tienda.
        var state = s.PaymentStatus is "paid" or "no_payment_required" ? CheckoutState.Paid
            : s.Status == "expired" ? CheckoutState.Failed
            : CheckoutState.Pending;
        Guid? orderId = s.Metadata is not null && s.Metadata.TryGetValue("orderId", out var id) && Guid.TryParse(id, out var g) ? g : null;
        return new CheckoutStatus(s.Id, orderId, state);
    }
}
