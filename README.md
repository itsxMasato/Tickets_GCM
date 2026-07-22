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
- **Auth**: express-session + connect-sqlite3 (store de sesiones en `data/sessions.db`) + bcrypt
- **Persistencia activa**: **Firestore** (vía `firebase-admin` server-side, `firebase` client-side)
  - Todos los servicios (`auth`, `tickets`, `categories`, `notifications`, `audit`, `stats`, `role-labels`, `roles`, `attachments`) leen y escriben contra Firestore.
- **Capa legada / en preparación** (convive, no se usa en runtime todavía):
  - `src/db/` — schema SQLite + seed (referencia; el código de servicios ya no la usa).
  - `src/orm/` — TypeORM + driver `mssql`, 8 EntitySchema y `DataSource` con inicialización perezosa. Diseñada para la migración SQLite/Firestore → SQL Server.
- **Uploads**: multer, directorio `uploads/`
- **Frontend**: Vite 5 + Tailwind 3 + JS (módulos ES, hash router)
- **Exportes**: SheetJS y jsPDF vía CDN

## Instalación

```bash
pnpm install
cp .env.example .env
# Completar variables de Firebase (ver docs/FIREBASE_SETUP.md) y, opcionalmente, MSSQL_*
pnpm db:migrate     # solo crea/asegura el schema SQLite de referencia
pnpm dev:all
```

Abrir `http://localhost:5173` (Vite, con proxy al backend en `:3000`).

### Variables de entorno relevantes

```bash
PORT=3000
SESSION_SECRET=<largo-y-aleatorio>
DB_PATH=./data/tickets.db          # SQLite (referencia)
UPLOAD_DIR=./uploads
MAX_UPLOAD_MB=10

# Firebase (obligatorio para arrancar — src/server.js sale si no inicializa)
FIREBASE_SERVICE_ACCOUNT_PATH=./keys/service-account.json
# o FIREBASE_SERVICE_ACCOUNT=<JSON string>

# SQL Server (opcional, solo si se va a usar la capa TypeORM)
MSSQL_HOST=
MSSQL_PORT=1433
MSSQL_DATABASE=
MSSQL_USER=
MSSQL_PASSWORD=
MSSQL_ENCRYPT=false
MSSQL_TRUST_CERT=true
ORM_SYNCHRONIZE=false
ORM_LOGGING=false
```

Detalle completo de setup Firebase en `docs/FIREBASE_SETUP.md`.

## Seguridad

No se documentan credenciales ni usuarios por defecto en este repositorio. Cualquier acceso inicial debe gestionarse mediante variables de entorno seguras y usuarios creados por el administrador del sistema.

## API

| Prefijo | Endpoints | Notas |
|---|---|---|
| `POST /api/auth/login` | username + password → sesión | bcrypt contra `users` en Firestore |
| `POST /api/auth/logout` | destruye sesión | |
| `GET  /api/auth/me` | usuario actual | requireAuth |
| `POST /api/auth/firebase` | intercambia ID token de Firebase por sesión local | |
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
- `pnpm db:migrate` — Aplica `src/db/schema.sql` + seed en SQLite de referencia.
- `pnpm orm:smoke` — Smoke test de la conexión TypeORM/SQL Server (las 8 entidades).
- `pnpm firebase-seed` — Script de seed contra Firestore.

## Estructura

```
src/                          Backend Express + Socket.IO + Firebase
  server.js, app.js           Entry points
  config/                     Resolución de .env
  firebaseAdmin.js            Inicialización firebase-admin (obligatoria al boot)
  firestore.js                Cliente Firestore
  firestoreData.js            Capa de acceso a datos (la única usada en runtime)
  routes/                     auth, users, categories, tickets, notifications, stats, roles, role-labels
  services/                   Lógica de negocio (auth, tickets, categories, notifications, attachments,
                              roles, role-labels, audit, stats) — todos sobre firestoreData
  middleware/                 requireAuth, requireRole, upload (multer), errorHandler
  sockets/                    Setup de Socket.IO con sessionMiddleware compartida
  utils/                      validators, password, time
  db/                         Schema SQLite + migrate + seed (referencia, sin uso en runtime)
  orm/                        Capa TypeORM/SQL Server (8 EntitySchema + DataSource perezosa,
                              repositories, enums compartidos) — preparada para migración futura

client/                       Frontend Vite
  views/                      login, dashboard, tickets-list, ticket-new, ticket-detail,
                              users, categories, notifications, reports, audit, roles
  components/                 chat, chat-composer, modal, sidebar, topbar, layout,
                              attachments, attachments-dropzone, back-button, badge,
                              empty-state, export-button, ticket-card, login
  utils/                      api, socket, socket-manager, format, dom, icons, toast,
                              role-labels, permissions, exports, realtime, ids,
                              users-cache, avatar
  firebase.js                 Inicialización cliente Firebase (Firestore + Auth)
  index.html, main.js, router.js, store.js, styles.css

public/                       Assets estáticos servidos por Express
  css/styles.css              Output de Tailwind
  dist/                       Build de Vite (generado)
  img/, videos/, uploads/     Recursos

scripts/                      Utilidades de mantenimiento
  orm-smoke.js                Smoke test SQL Server
  firebase-seed.js            Seed inicial de Firestore
  audit-roles-responsive.js   Auditoría de UI
  create-user.js, set-user-role.js
                              Helpers de admin

docs/
  FIREBASE_SETUP.md           Setup de credenciales Firebase
  module-roles.md             Documentación del módulo /roles

data/                         SQLite (sesiones + schema de referencia)
uploads/                      Adjuntos subidos
keys/                         Service account de Firebase (no versionado)
```

## Realtime

Socket.IO comparte el `sessionMiddleware` de Express. Salas disponibles:

- `tickets` — broadcast global (todos los conectados).
- `sac` — solo SAC y admin de área.
- `user:<id>` — usuario puntual.

Eventos emitidos: `ticket:created/updated/assigned/status_changed/commented`, `attachment:added`, `notification:new`, `user:created/updated/deactivated`, `role:permissions_updated`, `role:label_updated`, `category:created/updated`.

## Documentación adicional

- `docs/module-roles.md` — modelo, permisos y arquitectura de `/roles`.
- `docs/FIREBASE_SETUP.md` — setup de credenciales Firebase paso a paso.
- `DESIGN_SYSTEM.md`, `DESIGN.md`, `PRODUCT.md`, `RESPONSIVE_RULES.md`, `UX_GUIDELINES.md`, `USER_FLOWS.md`, `COMPONENT_LIBRARY.md`, `LOGIN_DESIGN.md`, `TECHNICAL_INFO.md` — diseño de producto y sistema visual.
