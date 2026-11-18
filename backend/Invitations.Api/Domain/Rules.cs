using System.Security.Cryptography;

namespace Invitations.Api.Domain;

/// <summary>Reglas sobre el número de pases (personas) de un evento.</summary>
public static class PassRules
{
    /// <summary>
    /// Límite vigente: el del paquete pagado o, mientras el evento es borrador,
    /// el del paquete más grande (el cliente arma su lista y elige paquete al pagar).
    /// </summary>
    public static int EffectiveLimit(int eventMaxPasses, int largestPlanPasses) =>
        eventMaxPasses > 0 ? eventMaxPasses : largestPlanPasses;

    /// <summary>¿Cabe el cambio? <paramref name="previousPasses"/> es 0 al crear una invitación.</summary>
    public static bool Fits(int limit, int currentTotal, int previousPasses, int newPasses) =>
        currentTotal - previousPasses + newPasses <= limit;
}

public static class InvitationTokens
{
    /// <summary>128 bits aleatorios en Base64Url (22 caracteres): imposible de adivinar.</summary>
    public static string New() => Base64UrlEncode(RandomNumberGenerator.GetBytes(16));

    private static string Base64UrlEncode(byte[] bytes) =>
        Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
}
