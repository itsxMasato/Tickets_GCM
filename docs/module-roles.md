<!-- Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. -->

# Módulo `/roles` — Roles y permisos

> Vista administrativa (solo SAC) para editar los permisos de cada rol. Los cambios aplican en vivo a toda la sesión GCM.

## 1. Propósito y audiencia

- **Quién entra aquí:** usuarios con `role: 'sac'`. El guard de frontend en `client/main.js` lo aplica como `SAC_ONLY`; el backend lo refuerza con `requireRole('sac')` en `src/routes/roles.routes.js`.
- **Qué se hace aquí:** activar o desactivar 6 capacidades operativas (PERMISSION_KEYS) por cada uno de los 4 roles del sistema (`sac`, `jefe_inmediato`, `admin_area`, `supervisor_campo`).
- **Por qué existe:** porque el sistema funciona como sala de control distribuida (NORTH_STAR) y el SAC debe poder ajustar autoridad sin redeploy. La autoridad por rol se documenta en `client/utils/format.js → ROLE_LABEL` y se usa en sidebar y tickets.
- **Qué NO hace:** no crea nuevos roles (los 4 son fijos y se enumeran en `validators.ROLES`), no toca usuarios individuales (eso es `/users`), no audita operaciones de tickets (eso es `/audit`). Sí puede **eliminar** roles y permisos existentes (ver §5) — la creación queda fuera por contrato, la eliminación sí está cubierta.

## 2. Modelo de datos

### Roles (4, fijos)

| Clave | Etiqueta | Posición en UI | Descripción operativa |
|---|---|---|---|
| `sac` | SAC | orden de autoridad descendente — quien origina | Administra el sistema, configura permisos y es el último eslabón antes del cliente. |
| `admin_area` | Admin de área | intermedio | Ejecuta y resuelve los tickets asignados a su área. |
| `jefe_inmediato` | Jefe inmediato | alto — quien cierra tickets | Cierra y reabre tickets. Tiene la última palabra sobre los casos del área. |
| `supervisor_campo` | Supervisor de campo | base — quien origina en campo | Levanta tickets en campo sobre lo que ve en operación. |

> El orden de card (de arriba a abajo) es `jefe_inmediato → admin_area → supervisor_campo → sac` (ver `ROLE_ORDER` en `client/views/roles.js:12`). Esta ordenación coincide con la cadena operativa de un ticket (campo → área → cierre) y se eligió pensando en la autoridad descendente — la card de abajo es quien origina, la de arriba es quien cierra.

### Permisos (6, fijos)

| Clave | Etiqueta legible | Descripción operativa | Crítico* |
|---|---|---|:-:|
| `manageUsers` | Gestionar usuarios | Crear, editar y desactivar cuentas; asignar rol y área. | ✓ |
| `manageCategories` | Gestionar categorías | Crear, renombrar y desactivar categorías de ticket. | — |
| `viewReports` | Ver informes | Acceder a reportes y exportaciones del sistema. | — |
| `viewAllTickets` | Ver todos los tickets | Ver tickets de todas las áreas, no sólo los propios. | — |
| `createTicket` | Crear tickets | Aperturar tickets a nombre de cualquier usuario o área. | ✓ |
| `assign` | Asignar tickets | Asignar tickets a responsables y reasignar entre áreas. | ✓ |

*Crítico = badge Rojo Camarón (`bg-accent/10 text-accent`) junto a la etiqueta y dot Rojo Camarón en el panel de cambios pendientes, para que el SAC no se los pierda. `CRITICAL_PERMS = { manageUsers, assign, createTicket }`.

Defaults viven en `src/services/roles.service.js → DEFAULTS`. Se aplican si el documento `role_permissions/<role>` no existe en Firestore.

### Persistencia

- **Storage:** Firestore, colección `role_permissions`, un documento por rol (`{role}.ts` con los 6 booleanos normalizados).
- **Lectura:** `GET /api/roles` devuelve `{ roles: { [role]: perms } }`. Si un rol no tiene documento, el backend aplica `DEFAULTS[role]`. La normalización (`normalizePermissions`) garantiza exactamente las 6 claves booleanas.
- **Escritura:** `PATCH /api/roles/:role` con `{ perms: { ...6 booleanos } }`. Se usa `set(..., { merge: true })`. Si hay cambios respecto al snapshot, escribe audit + emite socket a todos los SAC.

## 3. Arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│  client/views/roles.js                                      │
│  ───────────────────────────────────────────────────────    │
│  • renderRoles()  → root (header / kpis / list / pending)   │
│  • loadAll()      → api.roles.list() + api.users.list()     │
│  • current (server-truth) · pending (editable)              │
│  • isDirty() / pendingChanges() / totalAffected()           │
│  • save()  → PATCH por cada rol modificado (anti-borrado)   │
│  • discard() / refresh()                                    │
│  • realtime: window 'gcm:realtime'  → role:permissions_upd  │
│  • atajos: Ctrl/Cmd+S guarda, Esc descarta                  │
└─────────────────────────────────────────────────────────────┘
                │  api.roles.{list,update}
                ▼
┌─────────────────────────────────────────────────────────────┐
│  src/routes/roles.routes.js (requireAuth + requireRole sac) │
│  src/services/roles.service.js                              │
│  ───────────────────────────────────────────────────────    │
│  • list() / get(role) / update(role, body, user)            │
│  • diff vs old → auditService.logAsync (action_type         │
│    'role_permissions_updated')                              │
│  • emit('role:permissions_updated', { role, permissions,    │
│    previous, updatedBy, at }, { role: 'sac', broadcast })   │
└─────────────────────────────────────────────────────────────┘
                │
                ▼
            Firestore `role_permissions/<role>`
```

## 4. Estructura de la vista

```
root.flex.flex-col.gap-4
├── [opcional] conflictBanner  (amber, sólo si realtime entra con cambios pendientes)
├── header
│   ├── h1 "Roles y permisos" + subtítulo
│   └── btn Recargar (refresh)
├── kpiStrip  grid grid-cols-2 lg:grid-cols-4
│   └── 4 cards: nombre del rol + count + % + mini-barra de 6 puntos
├── main  grid grid-cols-1 lg:grid-cols-[1fr_360px]
│   ├── listCard  (stack vertical de role cards)
│   └── pendingCard (sticky top:16px en desktop, panel de cambios)
└── footer  última modificación (proxy honesto: loadedAt)
```

### KPI strip
- Una card por rol con: `ROLE_LABEL[role]`, `count` total, `% del sistema`, mini-barra `PERMISSION_KEYS.map(...)` con punto brand-ocean si activo / slate-200 si no, más `n/6 permisos`.

### Lista de roles (reemplaza la antigua matriz-tabla)
- Una `card` por rol, en `ROLE_ORDER`.
- Cabecera de la card: `ROLE_LABEL` + badge `N usuarios` + badge `n/6 permisos` + `ROLE_DESCRIPTIONS[role]` (un renglón, tinta slate-500).
- Cuerpo: lista vertical de los 6 permisos. Cada fila es:
  - `PERMISSION_LABELS[perm]` (font-medium, brand-ink) + badge `Crítico` si aplica + badge `Se va a activar / Se va a desactivar` (amber-100) si cambió.
  - `PERMISSION_DESCRIPTIONS[perm]` (text-xs, slate-500) — qué habilita el permiso en lenguaje operativo.
  - Toggle a la derecha (`role="switch"`, idéntico al de la matriz antigua).
- Filas modificadas reciben `bg-amber-50` y un ring amber en el toggle.
- Decisión: el switch visual sigue siendo 36×20px, pero con `before:absolute before:-inset-x-2` para hit-area ≥ 44px (WCAG 2.5.5).

### Panel de cambios pendientes (`pendingCard`)
- Cabecera con `Sin guardar` (amber) / `Sincronizado` (emerald), `N cambios · M personas afectadas`.
- Lista agrupada por rol, en el mismo orden que las cards, con:
  - Punto de color: verde si activa, Rojo Camarón si desactiva un crítico, slate si desactiva uno normal.
  - Etiqueta legible: "Activar / Desactivar · <perm>".
  - Sub-línea: `Afecta a N personas` o `Aplica al definir; aún no hay usuarios con este rol.`.
- Acciones: `Descartar` (ghost, disabled si no dirty) y `Guardar cambios` (acento si dirty, primary si no, spinner si guardando).
- Errores en vivo: cualquier `failed` de `Promise.allSettled` se muestra como `errEl` (red-50 + red-200) al final del panel, sin perder el diff.

## 5. Contratos

### Front → Back

```http
GET    /api/roles               → 200 { roles: { sac, jefe_inmediato, admin_area, supervisor_campo } }
GET    /api/roles/:role         → 200 { role, permissions }
PATCH  /api/roles/:role         → 200 { role, permissions }
       body: { perms: { manageUsers, manageCategories, viewReports,
                        viewAllTickets, createTicket, assign } }   // los 6, siempre
DELETE /api/roles/:role         → 204
       body: { reassignTo: 'admin_area' }   // requerido si el rol tiene usuarios
DELETE /api/roles/permissions/:key → 204
       body: { replacement: 'createTicket' } // requerido si el permiso está activo en algún rol
```

El body del PATCH es siempre completo (los 6 permisos), no un diff. Esto es deliberado: un PATCH parcial podría borrar permisos no enviados en un cliente buggy. La normalización backend garantiza booleanos.

**Reglas de los DELETE** (centralizadas en `src/services/roles.service.js → deleteRole / deletePermission`):
- `DELETE /api/roles/:role`: `role === 'sac'` → 403 `ROLE_PROTECTED` (inamovible). Si hay usuarios con ese rol y no llega `reassignTo` (o es inválido) → 409 `REASSIGN_REQUIRED`. Reasigna usuarios con `firestoreData.updateUser` en paralelo, luego borra `role_permissions/<role>`. Audit: `role_deleted`.
- `DELETE /api/roles/permissions/:key`: si el permiso está en `DEFAULTS[role] === true` y el rol nunca se customizó → 409 `PERMISSION_IN_USE_BY_DEFAULT`. Si está activo en algún rol y no llega `replacement` → 409 `REPLACEMENT_REQUIRED`. Si el permiso es crítico (`manageUsers`, `assign`, `createTicket`), `replacement` debe estar activo en **todos** los roles donde estaba el permiso original → 409 `CRITICAL_PERMISSION_REQUIRES_FULL_COVERAGE` si falta alguno. Aplica el cambio con `batch.set(ref, { [key]: false, [replacement]: true }, { merge: true })`. Audit: `permission_deleted`.
- Ambos emiten realtime: `role:deleted` y `permission:deleted` a `{ role: 'sac', broadcast: true }`.

### Back → Front (realtime)

Socket event `role:permissions_updated`:
```js
{
  role: 'sac',
  permissions: { manageUsers: true, ... },
  previous: { ... },
  updatedBy: { id, full_name, role },
  at: '2026-07-10T...',
}
```
- Destinatarios: `role: 'sac', broadcast: true` (todos los SAC conectados).
- En frontend se reenvía por `gcm:realtime` y `renderRoles` decide:
  - Sin cambios pendientes → adopta en silencio + toast `Permisos actualizados por <nombre>`.
  - Con cambios pendientes → banner ámbar con botones `Descartar` / `Recargar`.

### Errores comunes
- 401 / 403 → guard de frontend (toast + redirect). El backend aplica `requireRole('sac')`.
- 5xx al guardar → `errEl` visible + toast `No se pudieron guardar todos los cambios`. El diff local se preserva (no se hace rollback silencioso).

## 6. Decisiones de diseño

- **Lista por rol con descripciones, no matriz-tabla.** Antes era una grilla 4×6 con celdas togglables: compacto, pero el nombre del permiso era lo único que se veía, sin contexto sobre qué habilitaba. La lista vertical con descripción operativa por permiso reduce el "¿esto qué hace?" que era el mayor tropiezo en pruebas. La matriz perdía vertical space y obligaba a sticky-left en mobile; la lista scrollea natural.
- **Panel lateral sticky, no tabs.** En desktop el panel sticky (360px) muestra el diff en tiempo real mientras el usuario mueve toggles; en mobile colapsa bajo la lista (grid 1 col). Mismo patrón que la antigua matriz.
- **Optimistic UI ligero, no "guardar al toggle".** La acción destructiva (escribir en Firestore + broadcast + audit) se concentra en `Guardar cambios`. Los toggles amarillos y el fondo `bg-amber-50` en la fila marcan el delta visual.
- **Anti-borrado por PATCH completo.** Cada PATCH envía los 6 permisos del estado pendiente, no sólo los cambiados. Si un cliente tuviera un bug que omite una clave, el backend no la borra gracias a `normalizePermissions` + `set(..., { merge: true })`.
- **Cambios paralelos → banner, no overwrite.** Si otro SAC guarda mientras yo edito, mi diff no se pisa: aparece un banner ámbar con `Descartar` o `Recargar`. Decisión consciente: forzar al usuario a decidir.
- **Ctrl/Cmd+S guarda, Esc descarta.** Atajos típicos de formularios densos. Esc sólo dispara si NO hay modal abierto y NO estamos dentro de un input/textarea (no se lo quitamos al usuario mientras edita).
- **Mini-barra en KPIs en vez de número absoluto de permisos.** 6 puntitos brand-ocean/slate-200 comunican densidad de un vistazo; el texto `n/6 permisos` da el valor exacto.
- **Críticos en Rojo Camarón.** `manageUsers`, `assign`, `createTicket` son los permisos que, al desactivarse, rompen una capacidad operativa real (no se pueden crear ni asignar tickets, ni gestionar el equipo). La etiqueta `Crítico` aparece junto al nombre del permiso y el dot es Rojo Camarón en el panel de pendientes, para que el SAC no se los pierda en un diff grande.
- **Realtime silencioso cuando no hay diff.** Adoptar cambios en silencio + toast de 3s es mejor que interrumpir; el toast deja rastro.
- **Eliminación de roles/permisos con wizard de 2 pasos.** Paso 1 muestra los afectados (usuarios con el rol / roles con el permiso) en una tabla compacta y obliga a elegir un destino. Paso 2 muestra el resumen y pide confirmación. El backend es la autoridad: devuelve 4xx con mensaje y el wizard lo refleja como toast de error (sin perder el modal). El botón de confirmación se deshabilita durante la llamada y se rehabilita si falla — no se cierra el wizard en error. Si el rol no tiene usuarios, paso 1 se salta (no hay reasignación que hacer).

## 7. Responsive & mobile

- **Breakpoint principal:** `lg` (≥1024px). Bajo eso, `main` pasa a 1 columna; el panel queda debajo de la lista y pierde `sticky` (deja de tener sentido).
- **KPIs:** `grid-cols-2 lg:grid-cols-4`. En mobile, 2×2.
- **Lista vertical:** no requiere `overflow-x-auto` (es la ventaja principal sobre la antigua matriz). Cada card scrollea natural.
- **Filas de permiso:** flex row con label + descripción a la izquierda y toggle a la derecha. En mobile estrecho, las descripciones pueden envolver a 2 líneas — el toggle se queda alineado arriba-derecha por `items-center` del flex.
- **Conflict banner:** `flex items-start gap-3` y los botones a la derecha; en mobile se apilan si no caben (gap-2).
- **Sin gestos de swipe ni drawer.** Decisión: el panel de cambios es un componente vertical bajo la lista en mobile, no un bottom-sheet. Es coherente con el resto del app (no usamos bottom-sheets en GCM).
- **Texto y contraste:** mismos tokens que el resto (`text-slate-500` para body, `text-slate-700` para labels, focus ring `/60` para switches). Cumple WCAG AA (ver memoria `session-2026-06-22-a11y-and-mobile-fixes`).

## 8. Estados vacíos y de error

| Estado | Qué ve el usuario |
|---|---|
| Cargando | Spinner + "Cargando roles y permisos…" |
| Error de carga | `emptyState({ title: 'No se pudieron cargar los permisos', icon: alert })` |
| Recargando con error | `emptyState` análogo |
| Sin cambios pendientes | `empty-state-compact`: "No hay cambios por aplicar…" |
| Cambios pendientes con 0 usuarios | "Aplica al definir; aún no hay usuarios con este rol." |
| Guardado parcial | `errEl` rojo en el panel + toast de error + diff preservado |

## 9. Métricas y observabilidad

- **Audit:** cada cambio real (diff JSON no trivial) crea un registro con `action_type: 'role_permissions_updated'`, `target_type: 'role'`, `target_code: <role>`, `old_value`, `new_value` y una descripción humana `Actualizó permisos del rol "X": <perm>: sí/no → sí/no, ...`.
- **Realtime:** `role:permissions_updated` se emite a todos los SAC. Latencia objetivo: < 1s.
- **Sin métricas de cliente explícitas.** Si en el futuro queremos medir "tiempo entre toggle y guardar" o "tasa de descarte", se añadiría un evento de analytics al `save()` y al `discard()`.

## 10. Riesgos y deuda

- **Defaults sólo en backend.** Si el cliente lee antes de que el backend responda (no aplica aquí porque `loadAll` espera), no hay riesgo. Pero si en el futuro se hace un render optimista, hay que mover `DEFAULTS` a `client/utils/format.js` o similar.
- **Footer usa `loadedAt` como proxy** de "última modificación" porque Firestore no expone `updatedAt` al cliente. El backend sí lo registra en audit; futuro: leer el último `audit.role_permissions_updated` para mostrar fecha real.
- **Crear un rol o un permiso nuevos sigue fuera de alcance.** Los 4 roles y los 6 permisos son fijos; el wizard de 2 pasos cubre la eliminación pero no la creación. Si se quisiera añadir un rol, hay que tocar `validators.ROLES` (backend), `ROLE_LABEL`/`ROLE_ORDER`/`ROLE_DESCRIPTIONS` (cliente) y `DEFAULTS` (backend). La creación queda como evolución explícita, no como feature oculta.
- **Sin re-intento en error parcial.** Si 2 de 4 PATCH fallan, mostramos el error y preservamos el diff. No hay auto-retry; el usuario decide cuándo reintentar.
- **No hay vista de "historial de cambios por rol".** El audit registra todo (`/audit`), pero `/roles` no enlaza. Mejora futura: link "Ver historial" en cada card.
- **Descripciones son autoritativas del front.** `PERMISSION_DESCRIPTIONS` y `ROLE_DESCRIPTIONS` viven en el cliente. Si el backend agrega un permiso o renombra un rol, hay que mantenerlas en sync. Mejora futura: que el backend devuelva `description` por permiso/rol y el cliente las use si están.

## 11. Cómo extender

- **Añadir un permiso:** añadir la clave en `PERMISSION_KEYS` (cliente y backend), etiqueta en `PERMISSION_LABELS`, descripción en `PERMISSION_DESCRIPTIONS`, default por rol en `DEFAULTS`, y el backend lo aplicará al primer `list()` si el doc no existe. Aparece automáticamente en KPI (mini-barra y count), card, y panel de pendientes.
- **Añadir un rol:** actualizar `validators.ROLES` (backend), `ROLE_LABEL` (cliente), `ROLE_ORDER` (cliente), `ROLE_DESCRIPTIONS` (cliente), `DEFAULTS` (backend). El guard de frontend `SAC_ONLY` y `requireRole('sac')` no cambian.
- **Cambiar la autoridad visual de un permiso crítico:** editar `CRITICAL_PERMS` y la leyenda del badge si aplica.
- **Reordenar la lista:** mover la clave en `ROLE_ORDER`. La cadena operativa (campo → área → cierre) se mantiene si no se mezcla.
