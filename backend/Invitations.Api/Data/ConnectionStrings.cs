using Npgsql;

namespace Invitations.Api.Data;

public static class ConnectionStrings
{
    /// <summary>
    /// Acepta tanto el formato de Npgsql (Host=...;Database=...) como el URI
    /// postgresql://usuario:clave@host:puerto/base?sslmode=require que dan Neon y Render.
    /// </summary>
    public static string Normalize(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
            throw new InvalidOperationException("Falta la cadena de conexión 'ConnectionStrings:Default'.");

        if (!value.StartsWith("postgres://", StringComparison.OrdinalIgnoreCase) &&
            !value.StartsWith("postgresql://", StringComparison.OrdinalIgnoreCase))
            return value;

        var uri = new Uri(value);
        var userInfo = uri.UserInfo.Split(':', 2);
        var b = new NpgsqlConnectionStringBuilder
        {
            Host = uri.Host,
            Port = uri.IsDefaultPort || uri.Port <= 0 ? 5432 : uri.Port,
            Database = Uri.UnescapeDataString(uri.AbsolutePath.TrimStart('/')),
            Username = Uri.UnescapeDataString(userInfo[0]),
            Password = userInfo.Length > 1 ? Uri.UnescapeDataString(userInfo[1]) : null,
        };

        var query = System.Web.HttpUtility.ParseQueryString(uri.Query);
        if (query["sslmode"] is { } ssl && Enum.TryParse<SslMode>(ssl.Replace("-", ""), true, out var mode))
            b.SslMode = mode;
        if (query["channel_binding"] is { } cb && Enum.TryParse<ChannelBinding>(cb, true, out var binding))
            b.ChannelBinding = binding;

        return b.ConnectionString;
    }
}
