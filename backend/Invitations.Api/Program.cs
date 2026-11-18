using System.Text.Json.Serialization;
using Invitations.Api.Data;
using Invitations.Api.Domain;
using Invitations.Api.Features.Auth;
using Invitations.Api.Features.Events;
using Invitations.Api.Features.Invitations;
using Invitations.Api.Features.Plans;
using Invitations.Api.Features.Public;
using Invitations.Api.Features.Templates;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

// Cloud Run / Render indican el puerto con la variable PORT.
var port = Environment.GetEnvironmentVariable("PORT");
if (!string.IsNullOrEmpty(port))
    builder.WebHost.UseUrls($"http://0.0.0.0:{port}");

builder.Services.AddOpenApi();
builder.Services.AddProblemDetails();
// Valida automáticamente los atributos [Required], [Range], etc. de los requests (.NET 10).
builder.Services.AddValidation();
// Enums como texto en JSON ("Wedding" en vez de 0): más legible para el front.
builder.Services.ConfigureHttpJsonOptions(o =>
    o.SerializerOptions.Converters.Add(new JsonStringEnumConverter()));

// Límite de peticiones por IP para los endpoints públicos (links de invitación).
builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    o.AddPolicy(PublicInvitationEndpoints.RateLimitPolicy, ctx =>
        RateLimitPartition.GetFixedWindowLimiter(
            ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions { PermitLimit = 60, Window = TimeSpan.FromMinutes(1) }));
});

builder.Services.AddDbContext<AppDbContext>(o =>
    o.UseNpgsql(ConnectionStrings.Normalize(builder.Configuration.GetConnectionString("Default"))));

// Identity con cookie httpOnly. El front llama a /api/* a través del proxy de Netlify
// (o de Vite en desarrollo), así que la cookie es del mismo sitio.
builder.Services.AddAuthorization();
builder.Services
    .AddIdentityApiEndpoints<AppUser>(o =>
    {
        o.User.RequireUniqueEmail = true;
        o.Password.RequiredLength = 8;
        o.Password.RequireNonAlphanumeric = false;
    })
    .AddRoles<IdentityRole<Guid>>()
    .AddEntityFrameworkStores<AppDbContext>();

builder.Services.ConfigureApplicationCookie(o =>
{
    o.Cookie.Name = "inv_session";
    o.Cookie.HttpOnly = true;
    o.Cookie.SameSite = SameSiteMode.Lax;
    o.Cookie.SecurePolicy = CookieSecurePolicy.SameAsRequest;
    o.ExpireTimeSpan = TimeSpan.FromDays(14);
    o.SlidingExpiration = true;
});

// Detrás de proxies (Netlify, Cloud Run) para conocer el esquema/IP reales.
builder.Services.Configure<ForwardedHeadersOptions>(o =>
{
    o.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    o.KnownIPNetworks.Clear();
    o.KnownProxies.Clear();
});

var app = builder.Build();

app.UseForwardedHeaders();
// Errores no controlados y 404/401 vacíos se devuelven como ProblemDetails (JSON estándar).
app.UseExceptionHandler(new ExceptionHandlerOptions
{
    // JSON mal formado o tipos inválidos son error del cliente (400), no del servidor (500).
    StatusCodeSelector = ex => ex is BadHttpRequestException bad ? bad.StatusCode : StatusCodes.Status500InternalServerError,
});
app.UseStatusCodePages();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();

    // En desarrollo aplicamos migraciones al iniciar. En producción se corren a mano
    // (dotnet ef database update) para controlar cuándo cambia el esquema.
    using var scope = app.Services.CreateScope();
    scope.ServiceProvider.GetRequiredService<AppDbContext>().Database.Migrate();
}

app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();

var api = app.MapGroup("/api");
api.MapGet("/health", () => Results.Ok(new { status = "ok" }));
api.MapAuthEndpoints();
api.MapPlanEndpoints();
api.MapEventEndpoints();
api.MapInvitationEndpoints();
api.MapTemplateEndpoints();
api.MapPublicInvitationEndpoints();

app.Run();
