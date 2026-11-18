using System.Security.Cryptography;

namespace Invitations.Api.Domain;

/// <summary>Reglas del acceso de hostess: PIN, expiración y bloqueo por intentos fallidos.</summary>
public static class StaffRules
{
    public const int MaxFailedAttempts = 5;
    public static readonly TimeSpan LockoutDuration = TimeSpan.FromMinutes(15);
    /// <summary>El acceso sigue vigente hasta un día después del inicio del evento.</summary>
    public static readonly TimeSpan ValidAfterEventStart = TimeSpan.FromDays(1);

    /// <summary>PIN de 6 dígitos con generador criptográfico.</summary>
    public static string NewPin() => RandomNumberGenerator.GetInt32(0, 1_000_000).ToString("D6");

    public static DateTimeOffset ExpirationFor(Event ev) => ev.StartsAt + ValidAfterEventStart;

    public enum LoginBlock { None, Expired, Locked }

    public static LoginBlock CheckCanLogin(StaffAccess access, DateTimeOffset now)
    {
        if (access.ExpiresAt <= now) return LoginBlock.Expired;
        if (access.LockedUntil is { } until && until > now) return LoginBlock.Locked;
        return LoginBlock.None;
    }

    public static void RegisterFailure(StaffAccess access, DateTimeOffset now)
    {
        // Si el bloqueo anterior ya terminó, se empieza a contar de nuevo.
        if (access.LockedUntil is { } until && until <= now)
        {
            access.FailedAttempts = 0;
            access.LockedUntil = null;
        }

        access.FailedAttempts++;
        if (access.FailedAttempts >= MaxFailedAttempts)
            access.LockedUntil = now + LockoutDuration;
    }

    public static void RegisterSuccess(StaffAccess access)
    {
        access.FailedAttempts = 0;
        access.LockedUntil = null;
    }
}

/// <summary>Reglas de registro de entrada en la puerta.</summary>
public static class CheckInRules
{
    public static int CheckedIn(Invitation inv) => inv.CheckIns.Sum(c => c.Count);

    /// <summary>Lugares que todavía pueden entrar: nunca más que los pases de la invitación.</summary>
    public static int Remaining(Invitation inv) => Math.Max(0, inv.Passes - CheckedIn(inv));

    /// <summary>Error legible o null si se puede registrar la entrada.</summary>
    public static string? Validate(Invitation inv, int count)
    {
        if (count < 1) return "Indica cuántas personas están entrando.";
        var remaining = Remaining(inv);
        if (remaining == 0) return $"Ya entraron los {inv.Passes} lugares de esta invitación.";
        if (count > remaining)
            return remaining == 1
                ? "Solo queda 1 lugar disponible en esta invitación."
                : $"Solo quedan {remaining} lugares disponibles en esta invitación.";
        return null;
    }

    /// <summary>Avisos para la hostess (no bloquean): no confirmó, declinó o trae más de los confirmados.</summary>
    public static IReadOnlyList<string> Warnings(Invitation inv)
    {
        var warnings = new List<string>();
        switch (inv.RsvpStatus)
        {
            case RsvpStatus.Pending:
                warnings.Add("Esta invitación no confirmó asistencia.");
                break;
            case RsvpStatus.Declined:
                warnings.Add("Esta invitación respondió que no asistiría.");
                break;
            case RsvpStatus.Confirmed when CheckedIn(inv) >= inv.ConfirmedPasses:
                warnings.Add($"Ya entraron los {inv.ConfirmedPasses} lugares confirmados.");
                break;
        }
        return warnings;
    }

    /// <summary>Extrae el token del contenido del QR (el link /i/{token}) o acepta el token solo.</summary>
    public static string? TokenFromQr(string? content)
    {
        if (string.IsNullOrWhiteSpace(content)) return null;
        var text = content.Trim();
        if (Uri.TryCreate(text, UriKind.Absolute, out var uri))
        {
            var segments = uri.AbsolutePath.Trim('/').Split('/');
            return segments.Length == 2 && segments[0] == "i" ? segments[1] : null;
        }
        return text.Length is >= 16 and <= 64 && text.All(c => char.IsAsciiLetterOrDigit(c) || c is '-' or '_') ? text : null;
    }
}
