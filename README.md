# Sistema de Tickets GCM

Sistema de tickets interno con flujo por áreas: **supervisor de campo → SAC → administrador de área → jefe inmediato**.

## Roles

| Rol | ¿Qué hace? |
|---|---|
| `supervisor_campo` | Genera tickets desde el campo. Solo ve los propios. |
| `sac` | Servicio al cliente. Ve todo, asigna/reasigna, reabre, exporta reportes. |
| `admin_area` | Recibe el ticket de su área, lo trabaja (en proceso / solucionado). NO puede cerrar. |
| `jefe_inmediato` | Ve los del área, cierra, reabre. Único que puede cerrar. |

## Estados

`recibido → asignado → en_proceso → solucionado → cerrado` (con bifurcación a `reabierto` desde `solucionado` o `cerrado`).

## Stack

- Node.js + pnpm
- Express + Socket.IO
- better-sqlite3
- express-session + connect-sqlite3
- bcrypt, multer, uuid
- **Frontend**: Vite + Tailwind CSS + JS (módulos ES, hash router)
- SheetJS (CDN) y jsPDF (CDN) para exportes

## Instalación

```bash
pnpm install
cp .env.example .env
pnpm db:migrate
pnpm dev:all
```

Abrir `http://localhost:5173` (Vite, con proxy al backend en `:3000`).

## Usuarios seed

| Usuario | Contraseña | Rol | Área |
|---|---|---|---|
| sac  | sac123  | sac              | — |
| jope | jefe123 | jefe_inmediato   | operaciones |
| jlog | jefe123 | jefe_inmediato   | logistica |
| jman | jefe123 | jefe_inmediato   | mantenimiento |
| aope | area123 | admin_area       | operaciones |
| alog | area123 | admin_area       | logistica |
| aman | area123 | admin_area       | mantenimiento |
| sup1 | sup123  | supervisor_campo | operaciones |
| sup2 | sup123  | supervisor_campo | logistica |

## Scripts

- `pnpm dev:server` — Nodemon del backend.
- `pnpm dev:css` — Tailwind en watch.
- `pnpm dev:client` — Vite dev server con proxy al backend.
- `pnpm dev:all` — Los tres en paralelo (concurrently).
- `pnpm build:client` — Compila el frontend a `public/dist/`.
- `pnpm build:css` — Compila Tailwind.
- `pnpm start` — Producción (asume `pnpm build:client` y `pnpm build:css` previos).
- `pnpm db:migrate` — Crear/actualizar BD y aplicar seed si está vacía.

## Estructura

```
src/                  Backend Express + Socket.IO
  routes/             Rutas REST
  services/           Lógica de negocio
  middleware/         Auth, roles, uploads, errores
  db/                 SQLite (schema, migrate, seed)
  utils/              Validadores, tiempo, password
  sockets/            Setup de Socket.IO
client/               Frontend Vite
  views/              Vistas (login, dashboard, tickets, detalle…)
  components/         Componentes UI (chat, modal, sidebar, topbar…)
  utils/              helpers (formato, dom, permisos, toast)
  index.html, main.js, router.js, api.js, store.js, socket.js
public/               Backend assets estáticos (css/styles.css, dist/ del frontend)
```
