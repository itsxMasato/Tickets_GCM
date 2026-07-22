<!-- Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. -->

# Módulo `/companies` — Empresas, áreas y miembros

> Vista administrativa (solo platform admin) para gestionar el grupo empresarial. Crea empresas, les define áreas operativas y asigna miembros con rol + área. Es la cabecera de la jerarquía multi-tenant: una empresa agrupa sus áreas, y cada área recibe miembros con su rol.

## 1. Propósito y audiencia

- **Quién entra aquí:** usuarios con `isPlatformAdmin === true` (un solo platform admin en el sistema, identificado con `users.is_platform_admin = 1`). El guard de frontend en `client/main.js:258` lo aplica como `PLATFORM_ADMIN_ONLY`; el backend lo refuerza con `requirePlatformAdmin` en `src/routes/companies.routes.js:53`.
- **Qué se hace aquí:** crear, editar, listar y desactivar (soft-delete) **empresas**; gestionar sus **áreas operativas** (key + label + sort_order + active); y asignar **membresías** a usuarios (rol + área opcional + flag de default). Las tres entidades se editan en una sola vista para mantener la coherencia.
- **Por qué existe:** el sistema pasa de "una organización" a "un grupo empresarial con N empresas independientes que comparten plataforma". `/companies` es el panel de control del platform admin para dar de alta/baja empresas y poblar su equipo. Análogo a la consola de un holding: alta de subsidiarias, organigrama, asignación de personal.
- **Qué NO hace:** no crea usuarios (eso es `/users`), no asigna tickets (eso es `/tickets` con `company_id` derivado), no edita permisos por empresa (override por rol-empresa es Fase 7 → `role_permissions`). Sí desactiva: el soft-delete pone `active=0` y mantiene el historial (no hay `DELETE` físico de DB en multi-tenant).

## 2. Modelo de datos

### Empresa (`companies`)

Modelo físico en `src/orm/entities/company.entity.js:31-45`. Shape serializado (lo que la API devuelve) en `src/services/companies.service.js → _serialize` (línea 64).

| Campo | Tipo API | Origen | Notas |
|---|---|---|---|
| `id` | number | autoincrement | PK |
| `name` | string | requerido | max 200 chars |
| `slug` | string | opcional al crear, autogenerado | max 50, UNIQUE, `^[a-z0-9-]+$` |
| `logo_url` | string \| null | opcional | max 500, URL absoluta |
| `color` | string \| null | opcional | max 20, hex `#RRGGBB` o token `navy` |
| `active` | boolean | default `true` | soft-delete flag |
| `is_default` | boolean | default `false` | como mucho **una** empresa activa puede tener `is_default=true`; el resto se desmarca en transacción |
| `created_at` | timestamp | server | SYSUTCDATETIME |
| `updated_at` | timestamp | server | SYSUTCDATETIME |

### Área (`company_areas`)

Modelo en `src/orm/entities/company-area.entity.js`. Shape en `src/services/company-areas.service.js → _serialize`.

| Campo | Tipo API | Origen | Notas |
|---|---|---|---|
| `id` | number | autoincrement | PK |
| `company_id` | number | requerido | FK lógica a `companies.id` |
| `key` | string | opcional al crear, autogenerado del label | `^[a-z0-9_-]{1,50}$`, **inmutable tras creación** (rompería FK en tickets y membresías) |
| `label` | string | requerido | max 100, etiqueta visible |
| `sort_order` | number | default `0` | ordena la lista (ASC) |
| `active` | boolean | default `true` | soft-delete |

> **Default de seed:** `operaciones, logistica, mantenimiento, sistemas, otro` — ver `src/db/seed-multitenant.js:34-40`. Coincide con `validators.AREAS` (legacy) pero las áreas por empresa son ahora configurables, no hardcoded.

### Membresía (`user_company_memberships`)

Modelo en `src/orm/entities/user-company-membership.entity.js`. Shape en `src/services/memberships.service.js → _serialize` (línea 57).

| Campo | Tipo API | Origen | Notas |
|---|---|---|---|
| `id` | number | autoincrement | PK |
| `user_id` | number | requerido | FK a `users.id` |
| `company_id` | number | requerido | FK a `companies.id` |
| `role` | enum | requerido | uno de los 4 valores de `validators.ROLES` |
| `area_key` | string \| null | opcional | debe ser un `key` **activo** de la misma empresa (validado en `validateAreaKey`, `memberships.service.js:149`) |
| `is_default` | boolean | default `false` | como mucho **una** membresía activa por usuario puede tener `is_default=true`; el resto se desmarca en transacción |
| `active` | boolean | default `true` | soft-delete |
| `created_at` | timestamp | server | |
| `last_seen_at` | timestamp | server | actualizado en cada switch-company (Fase 4) |

**`role` (4 valores, `validators.ROLES`):**

| Clave | Etiqueta visible | Descripción operativa |
|---|---|---|
| `supervisor_campo` | Supervisor de campo | Levanta tickets en campo. Origen. |
| `sac` | Servicio al cliente (SAC) | Admite, categoriza y asigna tickets en su empresa. |
| `admin_area` | Administrador de área | Ejecuta y resuelve los tickets asignados a su área. |
| `jefe_inmediato` | Jefe inmediato | Cierra y reabre tickets. Última palabra. |

> Los labels los pinta el cliente con `getRoleLabel` (`client/utils/role-labels.js:59`) — la misma función que usan `/users`, `/dashboard`, `/roles`, `/ticket-detail`. Un único cache local sincronizado con el backend.

**Denormalización de listados** (para evitar un join extra en la UI):

- `listByUser` agrega `membership.company = { id, name, slug, color, logo_url }` (`memberships.service.js:103-115`).
- `listByCompany` agrega `membership.user = { id, username, full_name }` (`memberships.service.js:139-145`).

**Restricciones únicas:** `UNIQUE (user_id, company_id)` — un usuario no puede tener dos membresías en la misma empresa. Si necesita cambiar de rol/área, edita la existente; no crees una nueva.

## 3. Arquitectura

```
┌──────────────────────────────────────────────────────────────────────────┐
│ CLIENT  client/views/companies.js (renderCompanies, ~907 líneas)         │
│                                                                          │
│  • Grid 1→md:2→xl:3 de cards (drawGrid)                                  │
│  • Detail expandible con 3 tabs (drawDetail → renderTabs)                │
│    - Datos  |  Áreas  |  Miembros                                        │
│  • 3 modales: openCompanyModal, openAreaModal, openMembershipModal       │
│  • Realtime listener: gcm:realtime → company:* / area:* / membership:*   │
│  • _gcmCleanup desregistra el listener en route change                   │
└──────────────────────────────────────────────────────────────────────────┘
            │  fetch (api.companies.*)              ▲
            ▼                                      │ CustomEvent 'gcm:realtime'
┌──────────────────────────────────────────────────────────────────────────┐
│ HTTP  /api/companies  (src/routes/companies.routes.js)                   │
│       /api/company-areas  (src/routes/company-areas.routes.js)            │
│       /api/users/:id/memberships     (src/routes/memberships.routes.js)  │
│       /api/companies/:id/memberships (mismo router, prefijo distinto)    │
│                                                                          │
│  Middleware: requireAuth (siempre) + requirePlatformAdmin (mutaciones)    │
│  buildRequester(req) inyecta isPlatformAdmin desde req.session            │
└──────────────────────────────────────────────────────────────────────────┘
            │                                       ▲
            ▼                                       │ socket.io
┌──────────────────────────────────────────────────────────────────────────┐
│ SERVICES  src/services/companies.service.js       (285 líneas)            │
│           src/services/company-areas.service.js   (242 líneas)            │
│           src/services/memberships.service.js     (323 líneas)            │
│                                                                          │
│  • Validación de input (slug regex, role enum, área activa)               │
│  • Defensa en profundidad: isPlatformAdmin revalidado en cada mutación    │
│  • auditService.logAsync en cada cambio                                  │
│  • socket.emit → room 'sac' (todos los platform admin)                   │
│                → room 'company:{id}' (miembros activos de esa empresa)   │
│                → room 'user:{id}'        (membresías: el usuario afectado)│
└──────────────────────────────────────────────────────────────────────────┘
            │
            ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ ORM    TypeORM 1.0 + SQL Server (MSSQL) / SQLite (smoke)                 │
│        src/orm/entities/{company,company-area,user-company-membership}.js │
│        src/orm/transformers.js → bitBoolean() para columnas booleanas     │
└──────────────────────────────────────────────────────────────────────────┘
```

## 4. Estructura de la vista

```
root  <div.flex.flex-col.gap-4>
├── header  <div.flex.flex-wrap.items-start.justify-between.gap-3>
│   ├── <h1>Empresas</h1> + <p>subtítulo (canManage o no)
│   └── right group
│       ├── [btn Recargar]  (siempre, refresca toda la lista)
│       └── [btn Nueva empresa]  (solo canManage)  |  badge "Solo admin" (no canManage)
├── grid  <div.grid.grid-cols-1.md:grid-cols-2.xl:grid-cols-3.gap-3>
│   └── card[].button.card.p-4  (una por empresa)
│       ├── header row: colorDot + name + badges (Default | Inactiva)
│       ├── slug + logo URL (texto-slate-500)
│       └── footer: # áreas + # miembros (si selectedId === id)
└── detailContainer
    └── (si hay selectedId) panel <div.card>
        ├── renderTabs → 3 botones tablist (Datos | Áreas | Miembros)
        └── tab body
            ├── renderDataTab: datos + acciones (Editar / Marcar default / Desactivar)
            ├── renderAreasTab: lista áreas + btn Nueva área + edit/delete
            └── renderMembersTab: lista membresías + btn Agregar miembro + edit/delete
```

**Modales (fuera del render, funciones de módulo):**

| Función | Tamaño modal | Campos | Cierra con |
|---|---|---|---|
| `openCompanyModal(company, onSaved)` | `lg` | name*, slug, color, logo_url, active, is_default | Cancelar / Guardar / Esc |
| `openAreaModal(companyId, area, onSaved)` | `md` | key (inmutable si edita), label*, sort_order, active | Cancelar / Guardar / Esc |
| `openMembershipModal(companyId, onSaved, membership)` | `md` | user (fijo si edita), role*, area_key, is_default, active | Cancelar / Guardar / Esc |

**Patrón de validación (espejo de `/users`, `/roles`):** error visible bajo cada campo con `aria-invalid` + `aria-describedby`, primer foco inválido si hay varios, banner rojo agregado en el modal si la API devuelve 4xx con `data.error.message`.

**Patrón de load:** `loadCompanies` + `loadAreas(cid)` + `loadMembers(cid)` con caches `Map<companyId, areas|members>`. `ensureDetail(cid)` carga en paralelo solo lo que no está en cache.

## 5. Contratos

### Front → Back

#### Empresas (`src/routes/companies.routes.js`)

```http
GET    /api/companies                      → 200 { companies: Company[] }
       query: ?all=true    (incluye inactivas; default solo activas)
       auth: requireAuth                              (cualquier logueado, ve las suyas)

GET    /api/companies/:id                  → 200 { company }
                                              404 NOT_FOUND si no existe o no es miembro
       auth: requireAuth

POST   /api/companies                      → 201 { company }
       body: { name*, slug?, logo_url?, color?, active?, is_default? }
                                              403 FORBIDDEN si no es platform admin
                                              409 CONFLICT si slug ya existe
       auth: requireAuth + requirePlatformAdmin

PATCH  /api/companies/:id                  → 200 { company }
       body: subset de { name, slug, logo_url, color, active, is_default }
                                              403, 404, 409 (slug duplicado)
       auth: requireAuth + requirePlatformAdmin

DELETE /api/companies/:id                  → 200 { company }   (soft-delete: active=0)
                                              403, 404
                                              409 "No se puede desactivar la última empresa activa"
       auth: requireAuth + requirePlatformAdmin
```

#### Áreas (`src/routes/company-areas.routes.js`)

```http
GET    /api/company-areas?companyId=X      → 200 { areas: Area[] }
       query: ?all=true
                                              403 si no es platform admin ni miembro activo
       auth: requireAuth

POST   /api/company-areas                  → 201 { area }
       body: { companyId*, key?, label*, sort_order?, active? }
                                              403, 404 (company), 400 (key regex), 409 (key duplicada)
       auth: requireAuth + requirePlatformAdmin

PATCH  /api/company-areas/:id              → 200 { area }
       body: subset de { label, sort_order, active }   (NO se puede renombrar `key`)
                                              403, 404
       auth: requireAuth + requirePlatformAdmin

DELETE /api/company-areas/:id              → 200 { area }   (soft-delete: active=0)
                                              403, 404
                                              409 "tiene N ticket(s) activo(s)"
                                              409 "N usuario(s) la están usando"
       auth: requireAuth + requirePlatformAdmin
```

#### Membresías (`src/routes/memberships.routes.js` — dos prefijos)

```http
GET    /api/companies/:companyId/memberships?all=true
                                            → 200 { memberships: Membership[] con user denormalizado }
       auth: requireAuth                              (miembro activo o platform admin)

GET    /api/users/:userId/memberships       → 200 { memberships: Membership[] con company denormalizado }
                                              403 si no es self ni platform admin
       auth: requireAuth

POST   /api/users/:userId/memberships       → 201 { membership }
       body: { company_id*, role*, area_key?, is_default?, active? }
                                              403, 400 (rol/área inválida), 404 (user/company),
                                              409 "El usuario ya tiene una membresía en ..."
       auth: requireAuth + requirePlatformAdmin

PATCH  /api/users/:userId/memberships/:id   → 200 { membership }
       body: subset de { role, area_key, is_default, active }  (NO se puede cambiar user_id)
                                              403, 404, 400, 409
                                              409 "No se puede eliminar la última membresía activa del usuario"
       auth: requireAuth + requirePlatformAdmin

DELETE /api/users/:userId/memberships/:id   → 200 { membership }   (soft-delete)
                                              403, 404, 409 ("última membresía")
       auth: requireAuth + requirePlatformAdmin
```

### Back → Front (realtime)

`client/main.js:176-184` reenvía los siguientes eventos al `CustomEvent('gcm:realtime')`. El listener en `companies.js:138-155` decide qué invalidar:

```js
// company:* → recarga lista entera (es barato: 1 GET)
{ event: 'company:created' | 'company:updated' | 'company:deleted',
  company: { id, ... } }

// area:* y membership:* → no traen companyId en el payload todavía;
// limpiamos los caches de detalle y redibujamos lo visible.
{ event: 'area:created' | 'area:updated' | 'area:deleted',
  area: { id, company_id, ... } }

{ event: 'membership:created' | 'membership:updated' | 'membership:deleted',
  membership: { id, user_id, company_id, ... } }
```

Destinatarios en backend (`src/services/*.service.js → emitX`):
- `company:*` → room `sac` (todos los platform admin) + `company:{id}` (miembros activos).
- `area:*`    → room `sac` + `company:{company_id}`.
- `membership:*` → room `sac` + `company:{company_id}` + `user:{user_id}`.

### Errores comunes (mapeo código → copy de UI)

| Status | Cuándo | Copy en modal/banner |
|---|---|---|
| 403 | platform admin no presente (defensa en profundidad) | `Solo el administrador de plataforma puede …` |
| 404 | id inexistente o cross-tenant | `Empresa/Área/Membresía no encontrada.` |
| 409 | slug duplicado, key duplicada, área con tickets activos, última empresa/membresía | mensaje literal del backend (`data.error.message`) |
| 4xx otros | payload inválido, role enum, regex | mensaje literal del backend |
| 5xx | error de DB / inesperado | `No se pudo guardar. Intenta de nuevo.` + log en consola |

## 6. Decisiones de diseño

- **Grid de cards, no tabla.** Una empresa tiene atributos heterogéneos (logo, color, contadores de áreas/miembros, badges de estado); una tabla lo aplana mal. La card comunica visual: colorDot + nombre + badges + footer con KPIs.
- **Detail expandible, no ruta `/companies/:id` separada.** Mantener las 3 entidades (empresa + áreas + miembros) en la misma vista evita navegación adicional cuando se está poblando una empresa nueva. El panel de detalle vive bajo el grid (`drawDetail`).
- **Tabs en lugar de secciones apiladas.** Data / Áreas / Miembros son tres responsabilidades distintas; tabs dejan claro cuál se está editando y el header de la empresa queda siempre visible (anchor de contexto).
- **Modales separados, no uno solo por empresa.** El modal de empresa es 1 entity; el de área necesita conocer `companyId`; el de membresía necesita tanto `companyId` como `usersCache` y `areasByCompany`. Mezclarlos obligaría a un wizard 3-pasos con state machine; tres modales independientes son más simples y cada uno valida su propio scope.
- **`key` de área inmutable tras creación.** El `key` es la FK lógica de tickets (`tickets.area_key` actual) y de membresías. Renombrarlo después rompe joins implícitos. El input se renderiza con `disabled` en modo edición; el usuario debe desactivar y crear una nueva si necesita renombrar.
- **`area_key` de membresía validado contra áreas activas.** En `validateAreaKey` (`memberships.service.js:149-156`) se rechaza si el área no existe o está inactiva. Esto evita referencias huérfanas al desactivar un área.
- **`user_id` de membresía inmutable.** Cambiar de usuario es conceptualmente "borrar la membresía de uno + crear la de otro" para que el audit quede coherente. El select se renderiza con `disabled` en edición.
- **`is_default` único por usuario.** El backend desmarca los demás en transacción (`memberships.service.js:188-190` create, `:258-260` update). El cliente no necesita limpiar el flag en otras filas; la respuesta del backend ya viene consistente.
- **Realtime "de Miguel out".** Cualquier cambio que otro platform admin o el mismo Miguel en otra pestaña dispara `company:*`/`area:*`/`membership:*`; el listener recarga. Coste: 1 GET extra. Beneficio: el panel nunca queda stale.
- **Vista de plataforma, no impersonation.** El platform admin ve todas las empresas en una sola pantalla, agregadas. **No** impersona a un usuario de la empresa — para eso está el company-switcher (Fase 9 / componente futuro `client/components/company-switcher.js`).
- **No-regresión de labels de rol.** El select de membresía renderiza el label humano (`getRoleLabel`) igual que `/users`, `/dashboard`, `/roles`. Bug original detectado y corregido en 2026-07-21: import inexistente `../utils/role-labels-client.js` → import correcto desde `permissions.js` (ROLES) y `role-labels.js` (getRoleLabel).
- **`color` como token opcional.** El layout hace fallback a `navy` del brand del grupo si `color` es NULL o no es hex válido (`colorDot` en `companies.js:50-56`). Decisión: el color es una **pista visual** (sidebar, badges), no un tema CSS — no se renderiza inline en producción, solo en preview y brand contextual (Fase 5).

## 7. Responsive & mobile

- **Grid:** `grid-cols-1 md:grid-cols-2 xl:grid-cols-3`. En mobile, una card por fila; en tablet, dos; en desktop ancho, tres. Las cards tienen `text-left` y altura natural (no fixed height).
- **Detail panel:** full-width bajo el grid en todos los breakpoints. Los tabs son flex-wrap; cada tab es `flex-1` en mobile para hit-area ≥ 44px.
- **Modales:** `size: 'md'` o `'lg'` según campos; el `openModal` los centra con `max-w-*` y scroll interno si el contenido excede. Inputs a `w-full` por defecto.
- **Sidebar:** el link `/companies` solo aparece si `canManageCompanies(user)` (`sidebar.js:126`), así que un platform admin en mobile ve la entrada; un jefe inmediato no.
- **Touch:** los botones de acción en cada card y cada fila del detail tienen padding generoso (`px-3 py-2` mínimo) para hit-area ≥ 44px WCAG 2.5.5. Los toggles de "Activa" / "Por defecto" en modales son checkbox nativos, sin patrón custom de switch.
- **Texto y contraste:** tokens globales del proyecto (`text-slate-500` para body, `text-slate-700` para labels, focus ring `/60` para inputs). Cumple WCAG AA.

## 8. Estados vacíos y de error

| Estado | Qué ve el usuario |
|---|---|
| Cargando inicial | `renderLoading('Cargando empresas…')` — spinner + texto, `role="status"` `aria-live="polite"` |
| Cargando detalle (área+miembros) | Spinner en el `detailContainer` mientras `ensureDetail` corre |
| Sin empresas (y canManage) | `emptyState` con icono `inbox`, título "Aún no hay empresas registradas", mensaje "Crea la primera empresa del grupo…", CTA `+ Nueva empresa` |
| Sin empresas (y !canManage) | `emptyState` con mensaje "Pídele al administrador de plataforma que te agregue como miembro de una empresa." (sin CTA) |
| Error de carga | `emptyState({ icon: 'inbox', title: 'No se pudieron cargar las empresas', message: e.message })` |
| Empresa sin áreas | Tab "Áreas" con mensaje contextual y CTA `+ Nueva área` (solo si canManage) |
| Empresa sin miembros | Tab "Miembros" análogo |
| Conflicto al guardar (409) | `banner` rojo dentro del modal con `e.message` literal; el modal no se cierra, el usuario decide cómo ajustar |
| Validación cliente | `setFieldError` bajo el input, `aria-invalid`, primer foco inválido |
| Realtime reload silencioso | `reloadAll()` re-pinta; sin toast (sería ruido en cambios cross-tab normales) |

## 9. Métricas y observabilidad

- **Audit:** cada mutación registra en `audit_log` con:
  - `target_type = 'company' | 'company_area' | 'user_company_membership'`
  - `target_id = <id>` + `target_code = <slug|key|label|username>`
  - `actor_id` = platform admin (único que puede mutar)
  - `old_value` / `new_value` JSON con el diff
  - `description` humano (`Creó empresa "GCM Norte"`, `Desactivó área "logistica"`, `Cambió rol de juan@sac a admin_area`)
- **Realtime:** latencia objetivo < 1s. El listener es `addEventListener('gcm:realtime', onRealtime)` y se desregistra en `_gcmCleanup` (cleanup hook usado por `mount()` en `client/main.js:67-83`).
- **Sin métricas de cliente explícitas.** Si en el futuro se quiere medir "tiempo medio de creación de empresa" o "tasa de error por validación cliente vs servidor", se añadiría un `analytics.emit` en `openCompanyModal.onclick` y en el `catch (e)` de la API.
- **Visible en `/audit`:** la vista de auditoría (existente) ya cubre estos eventos con filtros por `target_type`.

## 10. Riesgos y deuda

- **`node --check` no es probe válido para este archivo.** El proyecto es ESM via Vite; `node --check` falla con `Cannot use import statement outside a module` aunque el archivo esté bien. Probe real: `pnpm run build:client` (vite build) o abrir `/companies` en el dev server y mirar la consola. (Idéntico a `roles.js`, `users.js`, etc.)
- **`buildRequester` duplicado en 3 routers.** `src/routes/companies.routes.js:26`, `src/routes/company-areas.routes.js:24`, `src/routes/memberships.routes.js` (varios). Plan: centralizar en `requireAuth` durante Fase 3 (ver `docs/MULTITENANT.md` §11). Por ahora es copy-paste consciente.
- **Inconsistencia de doc con entity:** `docs/MULTITENANT.md` §3.1 describe `company_areas` con un campo `name`, pero la entity y el service usan `key` + `label`. Decisión correcta del código; la fix del doc queda para Fase 11 ("Limpieza final").
- **Realtime payload no trae `companyId` en `area:*` / `membership:*`.** El listener actual limpia todos los caches de detalle y redibuja. Aceptable ahora (pocos datos) pero ineficiente con N empresas: futuro improvement es incluir `company_id` en el payload y refrescar solo el detail de esa empresa.
- **Sin vista de "historial de cambios por empresa".** El audit registra todo (`/audit`), pero `/companies` no tiene link "Ver historial" en cada card. Mejora futura: anclar a `/audit?target_type=company&target_id=X`.
- **Switch-company y company-switcher son Fase 4 + 9.** El platform admin hoy **ve** todas las empresas, pero no puede impersonar a un usuario de una empresa específica (no está en el alcance de esta vista). Company-switcher vive en `client/components/company-switcher.js` y se monta en el topbar (Fase 5).
- **Multi-membresía + is_default no se gestiona desde esta vista.** El flag `is_default` se setea al crear/editar una membresía, pero no hay un "set this as default" rápido sobre la lista. El usuario debe abrir el modal. Aceptable.
- **`color` no se aplica al brand contextual todavía.** Está persistido y se renderiza como dot, pero el sidebar/topbar siguen con los tokens del grupo. Fase 5: sidebar y topbar leen `company.color` y aplican `style="--brand: <color>"` cuando hay `activeCompany`.

## 11. Cómo extender

### Agregar un campo a `Company`

1. **Entity:** nueva columna en `src/orm/entities/company.entity.js`. Si es boolean, usar `type: 'integer'` + `transformer: bitBoolean()` (ver memoria `session-2026-07-21-smoke-multitenant`).
2. **Service:** agregar a `_serialize` (`src/services/companies.service.js:64-77`) y al whitelist de `create`/`update` (lines 138-238).
3. **Validador:** si tiene constraints (max length, regex), agregar a `src/utils/validators.js`.
4. **API:** si el GET debe filtrar por él, agregarlo a `companies.service.js:list` (línea 101).
5. **Cliente:** agregar input al `openCompanyModal` (línea 663) + campo al render de `renderDataTab` (línea 317).
6. **Doc:** actualizar §2 (modelo) y §5 (contratos) de este archivo.

### Agregar un campo a `CompanyArea`

Mismo flujo. Si el campo es inmutable como `key`, marcar el input `disabled` en `openAreaModal` (línea 740) y omitirlo del whitelist de `update` (`company-areas.service.js:140-171`).

### Agregar un valor de `role`

1. **Backend:** agregar a `ROLE_VALUES` en `src/orm/enums.js:24-30` y `validators.ROLES` en `src/utils/validators.js:5`.
2. **Cliente:** agregar a `ROLES` en `client/utils/permissions.js:7` y a `DEFAULT_ROLE_LABEL` en `client/utils/role-labels.js:14-19`.
3. **Doc:** actualizar tabla de `role` en §2.
4. **Permisos:** si el nuevo rol necesita permisos distintos, ver `/roles` (`docs/module-roles.md`).
5. **Cuidado:** agregar un rol rompe el contrato histórico de 4 roles; Fase 7 (permisos por empresa) puede ser mejor lugar para este cambio.

### Agregar un override de permiso por empresa (Fase 7)

Esta vista **no** lo cubre todavía. La entidad `role_permissions` ya existe (Fase 1) y el `validators` la consulta cuando esté Fase 7 lista. Mientras tanto, los permisos son globales y se editan en `/roles` (`docs/module-roles.md`).

---

Si los tokens se acaban antes de cerrar Fase 9 completa, este doc + el view + la memoria `[[session-2026-07-21-multitenant-fase-0-1]]` son la fuente de verdad para retomar.

— Miguel Flores, autor del sistema.
