using System.Security.Claims;

namespace Invitations.Api.Features.Common;

public static class UserExtensions
{
    /// <summary>Id del usuario autenticado (claim NameIdentifier que pone Identity).</summary>
    public static Guid GetUserId(this ClaimsPrincipal user) =>
        Guid.Parse(user.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? throw new InvalidOperationException("Usuario no autenticado."));
}
