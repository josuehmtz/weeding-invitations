using Invitations.Api.Domain;
using Microsoft.AspNetCore.Identity;

namespace Invitations.Api.Features.Auth;

public static class AuthEndpoints
{
    public static IEndpointRouteBuilder MapAuthEndpoints(this IEndpointRouteBuilder api)
    {
        var auth = api.MapGroup("/auth").WithTags("Auth");

        // register, login, manage/info, etc. vienen de Identity.
        auth.MapIdentityApi<AppUser>();

        // Identity no incluye logout para cookies.
        auth.MapPost("/logout", async (SignInManager<AppUser> signIn) =>
        {
            await signIn.SignOutAsync();
            return Results.NoContent();
        }).RequireAuthorization();

        return api;
    }
}
