using System.Text.Json;

namespace Invitations.Api.Domain;

/// <summary>
/// Plantillas disponibles. El diseño vive en el front (componentes React);
/// el backend solo valida la clave y guarda la personalización como JSON.
/// </summary>
public static class Templates
{
    public static readonly IReadOnlySet<string> Keys = new HashSet<string> { "clasica", "jardin", "moderna" };

    /// <summary>Tamaño máximo de la configuración (textos, colores, secciones). Evita abusos del jsonb.</summary>
    public const int MaxConfigBytes = 32 * 1024;

    public static string DefaultFor(EventType type) => type switch
    {
        EventType.Wedding => "clasica",
        EventType.Quinceanera => "jardin",
        _ => "moderna",
    };

    /// <summary>Devuelve un error legible o null si la configuración es válida.</summary>
    public static string? Validate(string key, JsonElement config)
    {
        if (!Keys.Contains(key)) return $"La plantilla '{key}' no existe.";
        if (config.ValueKind != JsonValueKind.Object) return "La configuración debe ser un objeto JSON.";
        if (config.GetRawText().Length > MaxConfigBytes) return "La configuración es demasiado grande.";
        return null;
    }

    /// <summary>jsonb guardado como texto → JsonElement para devolverlo como objeto, no como string.</summary>
    public static JsonElement Parse(string json) =>
        JsonDocument.Parse(string.IsNullOrWhiteSpace(json) ? "{}" : json).RootElement.Clone();
}
