namespace Invitations.Api.Domain;

public enum EventType
{
    Wedding,
    Quinceanera,
    Other,
}

public enum EventStatus
{
    /// <summary>El cliente está armando su invitación; aún no paga.</summary>
    Draft,
    /// <summary>Pagado y publicado: los links de invitación están activos.</summary>
    Published,
    /// <summary>El evento ya pasó; solo lectura.</summary>
    Archived,
}

public enum RsvpStatus
{
    Pending,
    Confirmed,
    Declined,
}

public enum OrderStatus
{
    Pending,
    Paid,
    Failed,
    Refunded,
}

public enum TableShape
{
    Round,
    Rectangle,
    Square,
}
