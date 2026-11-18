# Imagen para Cloud Run / Render. Construir desde la carpeta backend/:
#   docker build -t invitations-api .
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY Invitations.Api/Invitations.Api.csproj Invitations.Api/
RUN dotnet restore Invitations.Api/Invitations.Api.csproj
COPY . .
RUN dotnet publish Invitations.Api/Invitations.Api.csproj -c Release -o /app --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
COPY --from=build /app .
# Cloud Run y Render inyectan la variable PORT; por defecto 8080.
ENV ASPNETCORE_HTTP_PORTS=8080
EXPOSE 8080
USER $APP_UID
ENTRYPOINT ["dotnet", "Invitations.Api.dll"]
