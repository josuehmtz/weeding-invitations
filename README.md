# Invitaciones digitales con QR

Plataforma para generar invitaciones de eventos (bodas, XV años, etc.) con confirmación de asistencia,
plano de mesas y acceso con QR para las hostess el día del evento. Mercado: México (MXN).

## Estructura

```
├── frontend/            React 19 + TypeScript + Vite (Netlify)
│   └── src/
│       ├── api/         Cliente HTTP hacia /api
│       └── pages/       Inicio, login, panel, invitación pública (/i/:token), escáner (/staff)
├── backend/             .NET 10 (LTS) Web API + EF Core + PostgreSQL
│   └── Invitations.Api/
│       ├── Domain/      Entidades: Event, Invitation, Guest, EventTable, CheckIn, StaffAccess, Plan, Order
│       ├── Data/        AppDbContext + migraciones
│       └── Features/    Endpoints por funcionalidad
├── docker-compose.yml   Postgres local para desarrollo
└── netlify.toml         Build del front + proxy /api → backend
```

## Requisitos (todos gratuitos)

- .NET SDK 10 (fijado en `backend/global.json`)
- Node.js LTS
- Docker Desktop (solo para el Postgres local)

## Desarrollo local

La base de datos de desarrollo vive en Neon (rama `dev`). La cadena de conexión se guarda con
user-secrets (fuera del repo) y tiene prioridad sobre `appsettings.Development.json`:

```powershell
dotnet user-secrets set "ConnectionStrings:Default" "<cadena .NET de Neon>" --project backend/Invitations.Api
```

Alternativa sin Neon: `docker compose up -d` levanta un Postgres local que coincide con `appsettings.Development.json`.

```powershell
dotnet run --project backend/Invitations.Api          # API en http://localhost:5080 (aplica migraciones)
cd frontend; npm install; npm run dev                 # Front en http://localhost:5173 (proxy /api → 5080)
```

Nueva migración tras cambiar entidades:

```powershell
cd backend
dotnet tool restore
dotnet ef migrations add NombreDelCambio --project Invitations.Api --output-dir Data/Migrations
```

## Despliegue (planes gratuitos)

| Pieza | Servicio |
|---|---|
| Frontend | Netlify — `netlify.toml` ya configurado |
| API | Google Cloud Run o Render (free) — `backend/Dockerfile` |
| Base de datos | Neon (Postgres free) |
| Archivos | Cloudflare R2 (cuando se necesiten) |

1. Crear base en Neon y poner su cadena de conexión en la variable `ConnectionStrings__Default` del backend.
2. Correr migraciones contra Neon: `dotnet ef database update --connection "<cadena Neon>"`.
3. Desplegar `backend/` como contenedor y reemplazar `API_URL` en `netlify.toml` por su URL.

## Decisiones de producto

- Cobro único por evento, en paquetes por número total de **pases** (personas); upgrade pagando la diferencia.
- 1 invitación = 1 link/QR con N pases. El QR solo contiene un token aleatorio.
- El invitado ve su QR después de confirmar asistencia; solo los confirmados entran al plano de mesas.
- Plantillas fijas personalizables (configuración JSON guardada en `jsonb`).
- Hostess entran con PIN del evento; el escáner funcionará sin conexión (PWA).
