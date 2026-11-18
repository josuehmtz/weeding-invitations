namespace Invitations.Api.Domain;

/// <summary>Reglas de la confirmación de asistencia.</summary>
public static class RsvpRules
{
    public const int MaxMessageLength = 500;
    public const int MaxNameLength = 120;

    /// <summary>Motivo por el que el invitado ya no puede responder, o null si sí puede.</summary>
    public static string? BlockedReason(Event ev, DateTimeOffset now)
    {
        if (ev.Status == EventStatus.Archived) return "Este evento ya terminó.";
        if (ev.StartsAt <= now) return "El evento ya comenzó; ya no es posible confirmar.";
        if (ev.RsvpDeadline is { } deadline && deadline < now)
            return "La fecha límite para confirmar ya pasó. Comunícate directamente con los anfitriones.";
        return null;
    }

    /// <summary>Valida la respuesta contra los pases de la invitación.</summary>
    public static string? Validate(Invitation inv, bool attending, int confirmedPasses, IReadOnlyList<string>? names)
    {
        if (!attending) return null;
        if (confirmedPasses < 1 || confirmedPasses > inv.Passes)
            return $"Puedes confirmar de 1 a {inv.Passes} {(inv.Passes == 1 ? "lugar" : "lugares")}.";
        if (names is not null && names.Count > confirmedPasses)
            return "Hay más nombres que lugares confirmados.";
        if (names?.Any(n => n.Length > MaxNameLength) == true)
            return $"Cada nombre puede tener hasta {MaxNameLength} caracteres.";
        return null;
    }

    /// <summary>Aplica la respuesta: estado, pases confirmados y lista de personas (para el plano de mesas).</summary>
    public static void Apply(Invitation inv, bool attending, int confirmedPasses, IReadOnlyList<string>? names,
        string? message, DateTimeOffset now)
    {
        inv.RsvpStatus = attending ? RsvpStatus.Confirmed : RsvpStatus.Declined;
        inv.ConfirmedPasses = attending ? confirmedPasses : 0;
        inv.RespondedAt = now;
        var text = message?.Trim();
        inv.Message = string.IsNullOrEmpty(text) ? null : text[..Math.Min(text.Length, MaxMessageLength)];
        SyncGuests(inv, inv.ConfirmedPasses, names ?? [], now);
    }

    /// <summary>
    /// Ajusta las personas al número confirmado conservando las existentes (y su mesa asignada).
    /// Un nombre vacío conserva el anterior; si es una persona nueva, usa el nombre de la invitación.
    /// </summary>
    public static void SyncGuests(Invitation inv, int count, IReadOnlyList<string> names, DateTimeOffset now)
    {
        // El orden de las personas es el de su Id (UUID v7 = orden de creación). Los nuevos usan
        // marcas de tiempo crecientes para quedar después de los existentes y en el orden escrito.
        var ordered = inv.Guests.OrderBy(g => g.Id).ToList();

        for (var i = count; i < ordered.Count; i++)
            inv.Guests.Remove(ordered[i]);

        for (var i = 0; i < count; i++)
        {
            // Nombre escrito > nombre que ya tenía > nombre por defecto.
            var name = i < names.Count && !string.IsNullOrWhiteSpace(names[i])
                ? names[i].Trim()
                : i < ordered.Count ? ordered[i].Name : DefaultName(inv.DisplayName, i);

            if (i < ordered.Count) ordered[i].Name = name;
            else inv.Guests.Add(new Guest
            {
                Id = Guid.CreateVersion7(now.AddMilliseconds(i)),
                InvitationId = inv.Id,
                Name = name,
            });
        }
    }

    public static string DefaultName(string displayName, int index) =>
        index == 0 ? displayName : $"{displayName} ({index + 1})";
}
