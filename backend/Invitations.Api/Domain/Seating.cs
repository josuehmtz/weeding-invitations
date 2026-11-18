namespace Invitations.Api.Domain;

/// <summary>Plano del salón: tamaño y elementos fijos (pista, escenario...). Se guarda como jsonb en el evento.</summary>
public record SeatingLayout(int Width, int Height, IReadOnlyList<LayoutElement> Elements)
{
    public static readonly SeatingLayout Default = new(1000, 700, []);
}

public record LayoutElement(string Id, string Kind, string Label, double X, double Y, double Width, double Height, double Rotation);

/// <summary>Mesa tal como la envía el editor del plano. Sin Id = mesa nueva.</summary>
public record TableInput(Guid? Id, int Number, string? Label, TableShape Shape, int Capacity, double X, double Y, double Rotation);

public static class SeatingRules
{
    public const int MaxTables = 200;
    public const int MaxCapacity = 30;
    public const int MaxElements = 50;
    public static readonly IReadOnlySet<string> ElementKinds =
        new HashSet<string> { "dancefloor", "stage", "entrance", "bar", "other" };

    public static string? ValidateLayout(SeatingLayout layout)
    {
        if (layout.Width is < 200 or > 5000 || layout.Height is < 200 or > 5000)
            return "El tamaño del salón debe estar entre 200 y 5000.";
        if (layout.Elements.Count > MaxElements) return $"Máximo {MaxElements} elementos en el plano.";
        foreach (var e in layout.Elements)
        {
            if (!ElementKinds.Contains(e.Kind)) return $"Elemento desconocido: {e.Kind}.";
            if (e.Label.Length > 40) return "El nombre de un elemento puede tener hasta 40 caracteres.";
            if (e.Width is <= 0 or > 5000 || e.Height is <= 0 or > 5000) return "Un elemento tiene un tamaño inválido.";
        }
        return null;
    }

    /// <summary>
    /// Valida el conjunto completo de mesas. <paramref name="assignedPerTable"/> son las personas ya
    /// sentadas en cada mesa existente: no se puede bajar la capacidad por debajo de eso.
    /// </summary>
    public static string? ValidateTables(IReadOnlyList<TableInput> tables, IReadOnlyDictionary<Guid, int> assignedPerTable)
    {
        if (tables.Count > MaxTables) return $"Máximo {MaxTables} mesas por evento.";

        var duplicated = tables.GroupBy(t => t.Number).FirstOrDefault(g => g.Count() > 1);
        if (duplicated is not null) return $"Hay dos mesas con el número {duplicated.Key}.";

        foreach (var t in tables)
        {
            if (t.Number is < 1 or > 999) return "El número de mesa debe estar entre 1 y 999.";
            if (t.Capacity is < 1 or > MaxCapacity) return $"La mesa {t.Number} debe tener de 1 a {MaxCapacity} lugares.";
            if (t.Label?.Length > 40) return $"El nombre de la mesa {t.Number} puede tener hasta 40 caracteres.";
            if (t.Id is { } id && assignedPerTable.TryGetValue(id, out var seated) && seated > t.Capacity)
                return $"La mesa {t.Number} tiene {seated} invitados sentados; no puedes bajar su capacidad a {t.Capacity}.";
        }
        return null;
    }

    /// <summary>
    /// Aplica movimientos de personas entre mesas y valida que ninguna mesa se pase de su capacidad.
    /// <paramref name="current"/>: mesa actual de cada persona del evento. Devuelve el nuevo estado o un error.
    /// </summary>
    public static (Dictionary<Guid, Guid?> Result, string? Error) ApplyAssignments(
        IReadOnlyDictionary<Guid, Guid?> current,
        IReadOnlyList<(Guid GuestId, Guid? TableId)> moves,
        IReadOnlyDictionary<Guid, (int Number, int Capacity)> tables)
    {
        var result = new Dictionary<Guid, Guid?>(current);
        foreach (var (guestId, tableId) in moves)
        {
            if (!result.ContainsKey(guestId)) return (result, "Una de las personas no pertenece a este evento.");
            if (tableId is { } t && !tables.ContainsKey(t)) return (result, "Una de las mesas no pertenece a este evento.");
            result[guestId] = tableId;
        }

        var over = result.Values
            .Where(t => t is not null)
            .GroupBy(t => t!.Value)
            .Select(g => (Table: tables[g.Key], Seated: g.Count()))
            .FirstOrDefault(x => x.Seated > x.Table.Capacity);
        if (over.Seated > 0)
            return (result, $"La mesa {over.Table.Number} solo tiene {over.Table.Capacity} lugares.");

        return (result, null);
    }
}
