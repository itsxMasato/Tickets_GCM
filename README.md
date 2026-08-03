<!-- Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. -->

# Sistema de Tickets GCM

Sistema interno de tickets con flujo por áreas: **supervisor de campo → SAC → administrador de área → jefe inmediato**. Diseñado como "sala de control" para operación seria, con cuatro roles estrictamente delimitados y un historial tipo chat como sistema de registro.

## Roles

| Rol | ¿Qué hace? |
|---|---|
| `supervisor_campo` | Genera tickets desde el campo. Solo ve los propios. |
| `sac` | Servicio al cliente. Ve todo, asigna/reasigna, exporta reportes, gestiona usuarios/categorías. |
| `admin_area` | Recibe el ticket de su área, lo trabaja (en proceso / solucionado). NO puede cerrar. |
| `jefe_inmediato` | Ve los de su área, cierra, reabre. Único con autoridad de cierre (junto con SAC). |

## Estados

`recibido → asignado → en_proceso → solucionado → cerrado` (con bifurcación a `reabierto` desde `solucionado` o `cerrado`).

## Stack

- **Node.js ≥ 18** + **pnpm**
- **Backend**: Express 5 + Socket.IO 4
- **Auth**: express-session + connect-sqlite3 (store de sesiones en `data/sessions.db`) + bcrypt contra `users` en SQL Server
- **Persistencia**: **SQL Server**, vía TypeORM (`src/orm/`)
  - Todos los servicios (`auth`, `tickets`, `categories`, `notifications`, `audit`, `stats`, `role-labels`, `roles`, `attachments`, `companies`, `memberships`) leen y escriben contra SQL Server.
  - `src/db/schema.mssql.sql` — DDL de SQL Server (13 tablas, ver el propio archivo para las decisiones de diseño).
  - `src/orm/` — TypeORM, EntitySchema por tabla y `DataSource` con inicialización perezosa (fallback a SQLite local solo para desarrollo/smoke tests, vía `DISABLE_MSSQL=true`).
- **Uploads**: multer, directorio `uploads/`
- **Frontend**: Vite 5 + Tailwind 3 + JS (módulos ES, hash router)
- **Exportes**: SheetJS y jsPDF vía CDN

## Instalación

```bash
pnpm install
cp .env.example .env
# Completar las variables MSSQL_* (ver src/orm/env.js y src/db/schema.mssql.sql)
pnpm dev:all
```

Abrir `http://localhost:5173` (Vite, con proxy al backend en `:3000`).

### Variables de entorno relevantes

```bash
PORT=3000
SESSION_SECRET=<largo-y-aleatorio>
DB_PATH=./data/tickets.db          # SQLite local, solo para el fallback de src/orm/ en dev (DISABLE_MSSQL=true)
UPLOAD_DIR=./uploads
MAX_UPLOAD_MB=10

# SQL Server (obligatorio para arrancar — src/server.js sale si el ORM no conecta,
# salvo que DISABLE_MSSQL=true active el fallback SQLite de desarrollo)
MSSQL_HOST=
MSSQL_PORT=1433
MSSQL_DATABASE=
MSSQL_USER=
MSSQL_PASSWORD=
MSSQL_ENCRYPT=false
MSSQL_TRUST_CERT=true
ORM_SYNCHRONIZE=false
ORM_LOGGING=false
DISABLE_MSSQL=false
```

## Seguridad

No se documentan credenciales ni usuarios por defecto en este repositorio. Cualquier acceso inicial debe gestionarse mediante variables de entorno seguras y usuarios creados por el administrador del sistema.

## API

| Prefijo | Endpoints | Notas |
|---|---|---|
| `POST /api/auth/login` | username + password → sesión | bcrypt contra `users` en SQL Server |
| `POST /api/auth/logout` | destruye sesión | |
| `GET  /api/auth/me` | usuario actual | requireAuth |
| `GET/POST/PATCH /api/users` | CRUD de usuarios | solo SAC |
| `GET/POST/PATCH /api/categories` | CRUD de categorías | solo SAC |
| `GET/POST/PATCH /api/tickets` | listado (filtrado por rol), creación, edición | |
| `GET/POST /api/tickets/:id/*` | detalle, asignación, cambio de estado, comentarios, adjuntos, historial | |
| `GET/PATCH /api/notifications` | inbox + marcar leído | |
| `GET /api/stats/{dashboard,me,audit,...}` | KPIs y bitácora de auditoría | |
| `GET/PATCH /api/roles` | permisos por rol (en vivo) | solo SAC |
| `GET/PATCH /api/role-labels` | etiquetas legibles por rol | |

Códigos de error uniformes `{ error: { code, message } }`: 400 `VALIDATION_ERROR`, 401 `UNAUTHORIZED`, 403 `FORBIDDEN`, 404 `NOT_FOUND`, 409 `CONFLICT` (username duplicado).

## Scripts

- `pnpm dev:server` — Nodemon del backend.
- `pnpm dev:css` — Tailwind en watch (`client/styles.css` → `public/css/styles.css`).
- `pnpm dev:client` — Vite dev server con proxy al backend.
- `pnpm dev:all` — Los tres en paralelo (concurrently).
- `pnpm build` — Build de CSS + frontend (`public/dist/`).
- `pnpm start` — Producción (asume `build` previo).
- `pnpm orm:smoke` — Smoke test de la conexión TypeORM/SQL Server (las 13 entidades).
- `pnpm smoke:multitenant` — Prueba funcional del modelo multiempresa contra la capa ORM.
- `pnpm test` — Corre la suite de tests (`node --test`).

## Estructura

```
src/                          Backend Express + Socket.IO + ORM
  server.js, app.js           Entry points
  config/                     Resolución de .env
  routes/                     auth, users, categories, tickets, notifications, stats, roles, role-labels,
                              companies, calendar
  services/                   Lógica de negocio (auth, tickets, categories, notifications, attachments,
                              roles, role-labels, audit, stats, companies, memberships, calendar) —
                              todos sobre el ORM (SQL Server)
  middleware/                 requireAuth, requireRole, upload (multer), errorHandler
  sockets/                    Setup de Socket.IO con sessionMiddleware compartida
  utils/                      validators, password, ids, scope, ticket-access, time
  db/                         Schema SQLite legado + schema.mssql.sql (DDL de SQL Server)
  orm/                        Capa TypeORM/SQL Server (EntitySchema por tabla, DataSource con
                              fallback a SQLite en dev, repositories, enums compartidos)

client/                       Frontend Vite
  views/                      login, dashboard, tickets-list, ticket-new, ticket-detail,
                              users, categories, notifications, reports, audit, roles
  components/                 chat, chat-composer, modal, sidebar, topbar, layout,
                              attachments, attachments-dropzone, back-button, badge,
                              empty-state, export-button, ticket-card, login
  utils/                      api, socket, socket-manager, format, dom, icons, toast,
                              role-labels, permissions, exports, realtime, ids,
                              users-cache, avatar
  auth-reverify.js            Reverificación de contraseña (reautenticación para acciones sensibles)
  index.html, main.js, router.js, store.js, styles.css

public/                       Assets estáticos servidos por Express
  css/styles.css              Output de Tailwind
  dist/                       Build de Vite (generado)
  img/, videos/, uploads/     Recursos

scripts/                      Utilidades de mantenimiento
  orm-smoke.js                Smoke test SQL Server
  audit-roles-responsive.js   Auditoría de UI
  create-user.js, set-user-role.js, set-platform-admin.js
                              Helpers de admin (ORM)

docs/
  module-roles.md             Documentación del módulo /roles
  MULTITENANT.md               Modelo multiempresa

data/                         SQLite (sesiones + schema de referencia)
uploads/                      Adjuntos subidos
```

## Realtime

Socket.IO comparte el `sessionMiddleware` de Express. Salas disponibles:

- `tickets` — broadcast global (todos los conectados).
- `sac` — solo SAC y admin de área.
- `user:<id>` — usuario puntual.

Eventos emitidos: `ticket:created/updated/assigned/status_changed/commented`, `attachment:added`, `notification:new`, `user:created/updated/deactivated`, `role:permissions_updated`, `role:label_updated`, `category:created/updated`.

## Documentación adicional

- `docs/module-roles.md` — modelo, permisos y arquitectura de `/roles`.
- `docs/MULTITENANT.md` — modelo multiempresa.
- `DESIGN_SYSTEM.md`, `DESIGN.md`, `PRODUCT.md`, `RESPONSIVE_RULES.md`, `UX_GUIDELINES.md`, `USER_FLOWS.md`, `COMPONENT_LIBRARY.md`, `LOGIN_DESIGN.md`, `TECHNICAL_INFO.md` — diseño de producto y sistema visual.
