<!-- Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. -->

# User Flows — GCM Tickets

> Los flujos de trabajo del producto. Cada flujo documenta: actores, trigger, pasos, estados intermedios, resultado, errores recuperables, y los eventos realtime que se disparan.
>
> **Convención:**
> - Los **actores** son los 4 roles del producto: `supervisor_campo`, `sac`, `admin_area`, `jefe_inmediato`.
> - Los **estados** del ticket siguen el modelo: `recibido → asignado → en_proceso → solucionado → cerrado`, con bifurcación a `reabierto` desde `solucionado` o `cerrado`.
> - Los **eventos realtime** (Socket.io) son disparados por el backend; el cliente los escucha vía `gcm:realtime`.

**Contexto arquitectónico (ver `DESIGN.md` y `README.md`):**
- Frontend SPA vanilla JS + Vite + Tailwind. Hash router (`#/path`).
- Backend Express 5 + SQLite + Socket.io. Auth via sesiones cookie.
- 4 roles con visibilidad estricta (ver `client/utils/permissions.js`).

---

## Índice de flujos

### Por rol
1. [Login](#1-login-todos-los-roles)
2. [Supervisor — Crear ticket](#2-supervisor--crear-ticket)
3. [Supervisor — Ver mis tickets](#3-supervisor--ver-mis-tickets)
4. [SAC — Triage y asignación](#4-sac--triage-y-asignación)
5. [SAC — Reasignación (caso "vacaciones")](#5-sac--reasignación-caso-vacaciones)
6. [SAC — Crear ticket en nombre de](#6-sac--crear-ticket-en-nombre-de)
7. [Admin de área — Ejecutar ticket](#7-admin-de-área--ejecutar-ticket)
8. [Jefe inmediato — Cerrar ticket](#8-jefe-inmediato--cerrar-ticket)
9. [Jefe inmediato — Reabrir ticket](#9-jefe-inmediato--reabrir-ticket)
10. [Jefe inmediato — Auditar área](#10-jefe-inmediato--auditar-área)
11. [Notificaciones (todos)](#11-notificaciones-todos)

### Transversales
12. [Comentarios y adjuntos en el chat](#12-comentarios-y-adjuntos-en-el-chat)
13. [Export a Excel / PDF](#13-export-a-excel--pdf)
14. [Búsqueda global](#14-búsqueda-global)
15. [Realtime: qué ve cada usuario en tiempo real](#15-realtime-qué-ve-cada-usuario-en-tiempo-real)

### De soporte
16. [Gestión de usuarios (SAC)](#16-gestión-de-usuarios-sac)
17. [Gestión de categorías (SAC)](#17-gestión-de-categorías-sac)
18. [Reportes y analytics (SAC + Jefe)](#18-reportes-y-analytics-sac--jefe)
19. [Logout / sesión expirada](#19-logout--sesión-expirada)
20. [Errores y recuperación](#20-errores-y-recuperación)

---

## Mapa de estados y transiciones

```
                  ┌──────────────┐
                  │  RECIBIDO    │  ← ticket recién creado
                  └──────┬───────┘
                         │  (SAC asigna)
                         ▼
                  ┌──────────────┐
                  │  ASIGNADO    │
                  └──────┬───────┘
                         │  (admin mueve a en_proceso)
                         ▼
                  ┌──────────────┐
                  │  EN_PROCESO  │
                  └──────┬───────┘
                         │  (admin marca como solucionado)
                         ▼
                  ┌──────────────┐
                  │ SOLUCIONADO  │
                  └──────┬───────┘
            ┌────────────┼────────────┐
            │  (jefe)    │  (jefe)    │  (admin puede mover
            ▼            ▼            │   a en_proceso)
       ┌─────────┐  ┌─────────┐       │
       │ CERRADO │  │REABIERTO│◄──────┘
       └────┬────┘  └────┬────┘
            │  (jefe)    │  (admin vuelve a en_proceso)
            └────────────┘
```

### Quién puede hacer qué

| De → A | supervisor | sac | admin_area | jefe_inmediato |
|---|---|---|---|---|
| recibido → asignado | ❌ | ✅ | ❌ | ❌ |
| recibido → cerrado | ❌ | ✅ | ❌ | ✅ (caso borde) |
| asignado → en_proceso | ❌ | ✅ | ✅ (si es el asignado) | ❌ |
| asignado → asignado (reasignar) | ❌ | ✅ | ❌ | ❌ |
| en_proceso → solucionado | ❌ | ✅ | ✅ (si es el asignado) | ❌ |
| en_proceso → asignado (reasignar) | ❌ | ✅ | ❌ | ❌ |
| solucionado → cerrado | ❌ | ✅ | ❌ | ✅ |
| solucionado → reabierto | ❌ | ✅ | ❌ | ✅ |
| solucionado → en_proceso (volver) | ❌ | ✅ | ✅ | ❌ |
| cerrado → reabierto | ❌ | ✅ | ❌ | ✅ |
| reabierto → en_proceso | ❌ | ✅ | ✅ (si es el asignado) | ❌ |
| reabierto → asignado (reasignar) | ❌ | ✅ | ❌ | ❌ |

**Regla operativa:** sólo `jefe_inmediato` puede **cerrar** un ticket. `admin_area` no puede cerrar bajo ninguna circunstancia — es por diseño, para forzar la revisión del jefe.

---

## 1. Login (todos los roles)

**Trigger:** usuario abre la app o la sesión expira.

**Actores:** cualquiera de los 4 roles.

### Pasos

1. **Carga de `/login`**
   - Se muestra el login card con video de fondo (`/videos/DJI_0495.MP4`).
   - Fallback: si el video no carga, se aplica el `[data-video-failed='true']` que da un fondo navy + radial-gradient ocean.
   - `prefers-reduced-transparency: reduce` → el glass card cae a un surface navy opaco (88% alpha).

2. **Usuario ingresa credenciales**
   - `username` o email + `password`.
   - "Recordarme" opcional (extiende sesión).
   - "Olvidé mi acceso" → link a `/recuperar` (placeholder hoy).

3. **Submit**
   - `api.auth.login({ username, password })` → POST `/api/auth/login`.
   - `aria-live="polite"` anuncia errores: "Usuario o contraseña incorrectos".
   - El botón se pone en estado "Ingresando…" mientras espera.

4. **Éxito**
   - `onLogin(user)` setea el state global y conecta Socket.io.
   - `go('/dashboard')` → navega al dashboard del rol.
   - El `wireRealtime()` se ejecuta una vez: registra listeners para `notification:new` y los forwards de ticket.

5. **Fallo de red / 5xx**
   - Toast de error: "No pudimos iniciar sesión. Verifica tu conexión e intenta de nuevo."
   - El formulario queda intacto para reintento.

### Resultado

Usuario autenticado, conectado al socket, redirigido a `/dashboard` con su vista de rol cargada.

### Eventos realtime disparados

- `connect` (Socket.io client → server, refresh unread count).

---

## 2. Supervisor — Crear ticket

**Trigger:** un supervisor de campo detecta un problema y necesita reportarlo. Frecuencia: alta. Contexto: a veces en mobile/tablet, conexión inestable.

**Actor:** `supervisor_campo`.

### Pasos

1. **Inicio del flujo**
   - Desde el dashboard del supervisor: click en `+ Nuevo ticket` (topbar, `btn-accent`) o desde `/tickets/new` directo.
   - También: desde la lista `/tickets`, botón `+ Nuevo ticket` arriba a la derecha.

2. **Carga del formulario**
   - GET `/api/categories` → lista de categorías.
   - El formulario renderiza: título, descripción, categoría, prioridad (default `media`).

3. **Llenar campos**
   - **Título** (max 200 chars, required).
   - **Descripción** (max 5000 chars, required). Aquí el supervisor describe con detalle el problema, contexto, lugar, hora.
   - **Categoría** (select, opcional).
   - **Prioridad** (default `media`, modificable).

4. **Submit**
   - `api.tickets.create({ title, description, category_id, priority })` → POST `/api/tickets`.
   - El botón "Crear ticket" se pone en estado "Creando…".
   - Validación cliente: si título o descripción están vacíos, no se envía.

5. **Éxito**
   - Toast: `Ticket ${code} creado.`
   - `go(/tickets/${id})` → navega al detalle del ticket recién creado.
   - El ticket entra al sistema con `status: 'recibido'`, sin asignar, sin responsable.

6. **Fallo de validación servidor**
   - Error inline en el formulario (e.g. "La categoría no existe").
   - El botón vuelve a "Crear ticket".

### Resultado

Ticket en estado `recibido`. Visible para: supervisor (creador), SAC (todos), jefe del área del supervisor (si fue clasificado en alguna área, que el supervisor normalmente no setea — el área se infiere de la categoría o queda `null` hasta asignación).

### Eventos realtime disparados

- `ticket:created` → broadcast a todos los SAC + jefe del área.
- `notification:new` para cada SAC.

### Permisos

- `canCreateTicket(user) = isSAC(user) || isSupervisor(user)` — el supervisor es uno de los dos roles que pueden crear.

---

## 3. Supervisor — Ver mis tickets

**Trigger:** el supervisor quiere ver el estado de los tickets que ha reportado.

**Actor:** `supervisor_campo`.

### Pasos

1. **Click en sidebar "Mis tickets"** o llegada al dashboard.
2. **Carga**: GET `/api/tickets?assigned_to={userId}&...` con paginación.
3. **Filtrar** (opcional): por estado, prioridad, área. Filtros persisten en query string.
4. **Click en una fila** → `/tickets/:id` → detalle del ticket.
5. **Realtime**: si otro actor comenta o cambia el estado, la fila se actualiza in-place (no re-mount).

### Visibilidad

El supervisor **sólo ve los tickets donde es `created_by`**. No ve tickets de su área asignados a otros. No ve tickets resueltos por su área pero creados por otros. Es su scope, punto.

### Resultado

Lista de sus tickets con badges de estado + prioridad. Click → detalle.

---

## 4. SAC — Triage y asignación

**Trigger:** un ticket nuevo entra al sistema (vía supervisor o vía SAC creándolo directamente).

**Actor:** `sac`.

### Pasos

1. **Notificación entrante**
   - Socket.io emite `notification:new` al SAC.
   - El bell badge del topbar incrementa (vía `state.unreadCount`).
   - Toast: "Nueva notificación: TCK-0042 — Bomba de achique no enciende".

2. **Apertura del ticket**
   - Click en la campana o en la notificación de la lista `/notifications`.
   - Navega a `/tickets/:id`.
   - El detalle muestra: estado actual `recibido`, sin asignar, sin chat aún (sólo el evento de creación).

3. **Decisión de triage**
   - El SAC evalúa: ¿qué área debe resolverlo? ¿qué persona específica?
   - Mira la categoría (si la tiene) y la descripción.

4. **Asignación**
   - Click en "Asignar / Reasignar" (card de acciones, sólo visible para SAC/jefe).
   - Modal: select de usuarios filtrado a `admin_area` + `jefe_inmediato` activos. Notas opcionales.
   - Submit: `api.tickets.assign(id, { to_user_id, notes })` → POST `/api/tickets/:id/assign`.
   - Toast: "Asignación actualizada."
   - El estado del ticket pasa de `recibido` a `asignado`.
   - En el chat del ticket aparece el evento: "Asignado a {Nombre} (por {SAC})".

5. **Notificación al asignado**
   - `notification:new` para el usuario asignado.
   - Si era un `recibido`, también para SAC que ya lo tenía en su inbox.

### Resultado

Ticket en estado `asignado`, con responsable. Sale de la cola de triage del SAC.

### Eventos realtime disparados

- `ticket:assigned` → broadcast.
- `notification:new` al nuevo asignado.
- `notification:new` (opcional) al SAC que asignó — feedback "sí, asigné".

### Casos borde

- **El SAC asigna a sí mismo** (no debería pasar, pero el sistema lo permite). El admin_area ya no aplica, pero el ticket queda con asignado inválido para ejecución.
- **El SAC reasigna** estando en estado `en_proceso` o `solucionado`: el sistema lo permite (es uno de los poderes del SAC), y queda como evento "Reasignado de A → B (por C)".

---

## 5. SAC — Reasignación (caso "vacaciones")

**Trigger:** el admin asignado se va de vacaciones, o el SAC detecta que el ticket está atascado en la persona equivocada.

**Actor:** `sac`.

### Pasos

1. **El SAC abre el ticket** desde `/tickets` (filtro por asignado anterior) o desde notificaciones.
2. **Click en "Asignar / Reasignar"**.
3. **Modal de reasignación**
   - El select de usuarios muestra todos los `admin_area` + `jefe_inmediato` activos, con su área visible.
   - El campo de notas se vuelve importante: "Juan se va de vacaciones hasta el 15/07 — reasignado a María".
4. **Submit** → `api.tickets.assign(id, { to_user_id, notes })`.
5. **Cambio de estado implícito**: si el ticket estaba en `asignado`, sigue en `asignado` (sólo cambia el responsable). Si estaba en `en_proceso`, también (el estado no se toca en reasignación).
6. **Notificación al nuevo asignado**.
7. **Notificación al anterior asignado** (opcional, hoy no se envía — pero es razonable que sí).

### Resultado

Nuevo responsable con contexto (notas) sobre por qué. El chat registra el movimiento con timestamp.

### Eventos realtime disparados

- `ticket:assigned` con `from_user_id` y `to_user_id`.
- `notification:new` al nuevo asignado.

### Visibilidad

La reasignación queda en el historial del ticket (evento en el chat). Cualquier actor que pueda ver el ticket ve la reasignación. No es privada.

---

## 6. SAC — Crear ticket en nombre de

**Trigger:** un supervisor llama por radio y reporta; el SAC levanta el ticket directamente.

**Actor:** `sac`.

### Pasos

1. **Igual que supervisor — Crear ticket**, pero el `created_by` es el SAC, no el supervisor.
2. **Inmediatamente después de crear**, el SAC normalmente asigna al área correspondiente (puede hacerlo en el mismo flujo: tras el `api.tickets.create`, abrir el modal de asignación desde la página de detalle).

### Permisos

`canCreateTicket(user) = isSAC(user) || isSupervisor(user)`.

### Resultado

Ticket en `recibido` (o `asignado` si el SAC asigna inmediatamente). El supervisor queda fuera del flujo de visibilidad a menos que sea asignado o agregado como watcher (funcionalidad no existente hoy).

---

## 7. Admin de área — Ejecutar ticket

**Trigger:** el admin recibe un ticket asignado y empieza a trabajar.

**Actor:** `admin_area`.

### Pasos

1. **Notificación**
   - `notification:new` al admin: "Ticket asignado: TCK-0042".
   - Bell badge + toast.

2. **Apertura del ticket**
   - Click → `/tickets/:id`.
   - Ve: estado `asignado`, prioridad, descripción, chat (probablemente vacío salvo el evento de creación y asignación).

3. **Iniciar trabajo**
   - Click en "Marcar como En proceso" (card de acciones).
   - Modal chico pide comentario opcional ("empezamos a revisar la bomba", "voy para el lugar").
   - Submit: `api.tickets.changeStatus(id, { status: 'en_proceso', comment })`.
   - Estado pasa a `en_proceso`. El comentario queda en el chat.

4. **Trabajo en curso**
   - El admin comenta en el chat con avances: "Necesito repuesto X", "Llamé al proveedor", etc.
   - Sube fotos: cámara o galería.
   - Si necesita escalar: click en "Asignar / Reasignar" (sólo visible para SAC/jefe — el admin **no puede reasignar**, debe pedir al SAC).

5. **Marcar como solucionado**
   - Click en "Marcar como Solucionado".
   - Modal pide comentario opcional ("se cambió el motor, queda funcionando", "se reemplazó la bomba").
   - Submit: `api.tickets.changeStatus(id, { status: 'solucionado', comment })`.
   - Estado pasa a `solucionado`.

6. **Notificación al jefe**
   - `notification:new` al jefe del área: "TCK-0042 está listo para cerrar".

### Resultado

Ticket en `solucionado`, esperando revisión del jefe. El admin no puede cerrarlo (regla del producto: cierre es exclusivo del jefe).

### Eventos realtime disparados

- `ticket:status_changed` en cada transición.
- `ticket:commented` por cada comentario.
- `attachment:added` por cada upload.
- `notification:new` al jefe del área cuando llega a `solucionado`.

### Permisos

- `nextStates(admin, ticket)`: si el ticket está asignado a este admin, puede mover `asignado → en_proceso`, `en_proceso → solucionado`, `reabierto → en_proceso`, `solucionado → en_proceso` (volver atrás).
- **No puede** cerrar, ni reasignar.

---

## 8. Jefe inmediato — Cerrar ticket

**Trigger:** un ticket llega a `solucionado` y el jefe lo revisa.

**Actor:** `jefe_inmediato`.

### Pasos

1. **Notificación**
   - `notification:new` al jefe: "TCK-0042 está listo para cerrar".
   - El jefe ve el ticket en su dashboard o en la lista de tickets del área (filtro: `status=solucionado`).

2. **Apertura y revisión**
   - Lee el chat completo: qué pasó, qué se hizo, qué se adjuntó.
   - Verifica que la solución sea adecuada (fotos, comentario del admin, etc.).

3. **Decisión: cerrar o reabrir**
   - **Si está OK**: click en "Marcar como Cerrado" (`btn-accent`, color crítico).
     - Modal de confirmación: "¿Cerrar TCK-0042? El equipo podrá reabrirlo después si es necesario."
     - Submit: `api.tickets.changeStatus(id, { status: 'cerrado' })`.
     - Estado pasa a `cerrado`.
     - El chat queda en modo "sólo lectura" (composer deshabilitado con copy explicativo).
     - `notification:new` al admin: "TCK-0042 fue cerrado por {jefe}".
   - **Si no está OK**: click en "Marcar como Reabierto" (ver flujo #9).

4. **Acción post-cierre**
   - El ticket sale de la cola de "tickets por cerrar" del jefe.
   - Permanece visible en `/tickets?status=cerrado` para auditoría.

### Resultado

Ticket cerrado. Chat en read-only. El ciclo se completó.

### Eventos realtime disparados

- `ticket:status_changed` con `status: 'cerrado'`.
- `notification:new` al creador (supervisor o SAC) y al asignado (admin).
- `notification:new` al SAC.

### Permisos

- `canAssign(user) = isSAC(user) || isJefe(user)` — el jefe puede asignar también (en caso de necesitar reorganizar su equipo).
- `nextStates(jefe, ticket)`: el jefe puede cerrar desde `solucionado` o `recibido`, y reabrir desde `solucionado` o `cerrado`.

---

## 9. Jefe inmediato — Reabrir ticket

**Trigger:** el jefe (o el supervisor) considera que un ticket cerrado/solucionado no está realmente resuelto. Caso típico: el problema volvió a aparecer dos semanas después.

**Actor:** `jefe_inmediato` (cierra y reabre) o `supervisor_campo` (sólo lo reporta — no tiene permisos para reabrir directamente, debe pedir al jefe).

### Pasos

1. **El jefe abre el ticket cerrado o solucionado** desde la lista con filtro `status=cerrado` o `status=solucionado`.

2. **Click en "Marcar como Reabierto"** (`btn-secondary`, no crítico).

3. **Modal de confirmación**
   - Título: "Reabrir ticket".
   - Body: "¿Reabrir TCK-0042? El ticket volverá a la cola del área como reabierto."
   - Comentario opcional recomendado: "volvió a fallar el viernes 13", "no se terminó el trabajo de cableado".

4. **Submit** → `api.tickets.changeStatus(id, { status: 'reabierto', comment })`.

5. **Estado pasa a `reabierto`**.

6. **Notificaciones**:
   - Al admin del área: "TCK-0042 fue reabierto por {jefe}. Comentario: {comentario}".
   - Al SAC (opcional).

7. **El admin retoma el trabajo**
   - El admin mueve el ticket a `en_proceso` (transición natural desde `reabierto`).
   - Ciclo se reinicia hasta que llegue de nuevo a `solucionado`.

### Resultado

Ticket en `reabierto`, asignado al último admin (no se desasigna automáticamente al reabrir). Chat recuperó el composer.

### Eventos realtime disparados

- `ticket:status_changed` con `status: 'reabierto'`.
- `notification:new` al admin.

---

## 10. Jefe inmediato — Auditar área

**Trigger:** el jefe quiere ver el estado general del área, tomar decisiones de carga, o detectar patrones.

**Actor:** `jefe_inmediato`.

### Pasos

1. **Dashboard del jefe**
   - 5 KPIs: Total área, Abiertos, Cerrados, Solucionados, Reabiertos.
   - "Carga por administrador" (lista con el conteo de tickets por cada admin del área).
   - Acceso rápido: "Tickets por cerrar" (navega a `/tickets?status=solucionado`).

2. **Drill-down**
   - Click en un admin de la lista de carga → filtra `/tickets?assigned_to={id}`.
   - Click en un KPI → filtra por ese estado.

3. **Reportes**
   - Sidebar: "Reportes" → `/reports`.
   - Filtros: estado, prioridad, área, rango de fechas.
   - Export a Excel.

4. **Decisiones**
   - Si un admin tiene mucha carga → reasignar desde un ticket específico (puede asignar como jefe).
   - Si muchos reabiertos → revisar con el equipo el flujo de cierre.

### Resultado

Visibilidad del estado del área. Decisiones informadas. Carga balanceada.

---

## 11. Notificaciones (todos)

**Trigger:** cualquier evento del ciclo (`ticket:created`, `assigned`, `status_changed`, `commented`, `attachment:added`).

**Actor:** cualquiera, con scope por rol.

### Pasos

1. **El evento ocurre en el backend**.
   - Socket.io emite el evento específico a la room del usuario concernido.
   - Adicionalmente, se inserta una `notification` en la tabla `notifications`.

2. **El cliente recibe `notification:new`**
   - `state.unreadCount` se actualiza.
   - El bell badge del topbar incrementa.
   - Toast breve: "Nueva notificación: TCK-0042 cambió a En proceso" (3.5s).

3. **El usuario abre notificaciones**
   - Click en el bell → `/notifications`.
   - Tab "Todas" / "No leídas" (filterBar con bg-brand + text-white en la activa).
   - Lista de cards con badge de tipo (color por `type`), timestamp relativo, body.

4. **El usuario hace click en una notificación**
   - Se marca como leída (`api.notifications.markRead({ ids: [n.id] })`).
   - Si tiene `ticket_id`, navega al detalle del ticket.
   - Si no, recarga la lista (caso de notificaciones administrativas).

5. **"Marcar todas como leídas"**
   - `api.notifications.markRead({ all: true })`.
   - `state.unreadCount = 0`.
   - Toast: "Notificaciones marcadas como leídas".

### Resultado

Usuario al día. No se acumula ruido en la campana. Inbox manejable.

### Reglas

- **Counter de campana se actualiza por realtime**, no por polling.
- **`unreadCount` se mantiene fresco en el estado global** (store.js).
- **Al reconectar el socket**, `refreshBell()` re-pide el count — por si se perdió algún evento offline.

---

## 12. Comentarios y adjuntos en el chat

**Trigger:** cualquier actor con permiso quiere dejar contexto, evidencia o una pregunta en el ticket.

**Actor:** quien tenga `canSeeTicket(user, ticket)` y el ticket no esté `cerrado`.

### Pasos — Comentario de texto

1. **El usuario abre el ticket** y ve el composer al final del chat (si tiene permisos y no está cerrado).
2. **Escribe** en el textarea. Counter `0/4000` se actualiza en vivo.
3. **Enter** envía. **Shift+Enter** nueva línea.
4. **Submit**: `api.tickets.comment(ticketId, { comment: text })` → POST `/api/tickets/:id/comments`.
5. **Éxito**:
   - `onSent` callback dispara `reload()` en `ticket-detail.js`.
   - El nuevo comentario aparece en el chat con avatar, nombre, rol, timestamp relativo, bubble alineado según "mío" u "otro".
   - Toast no (sería ruido; el comentario aparece en pantalla).

### Pasos — Adjuntar archivo

1. **Opción A**: click en "Adjuntar" (botón con icono de paperclip en el composer).
2. **Opción B**: drag & drop sobre el composer. La zona muestra ring ocean.
3. **Los archivos se acumulan en una preview** encima del textarea, con nombre, tamaño, y botón "×" para quitar.
4. **Send** dispara el upload por archivo:
   - `api.tickets.upload(ticketId, FormData)` → POST `/api/tickets/:id/attachments`.
   - Spinner en el botón "Enviar" mientras sube.
   - Si un archivo falla, toast específico: "Error al subir foto.jpg: archivo demasiado grande". El resto sigue.
5. **Éxito**:
   - El attachment aparece en el chat como "Juan adjuntó foto.jpg" con thumbnail (imagen 128×128) o icono + nombre (otros archivos).
   - `onSent` → `reload()`.

### Reglas

- **Ticket cerrado = composer deshabilitado** con copy: "El ticket está cerrado. No se pueden enviar nuevos mensajes."
- **Sin permisos** = composer no se renderiza, copy: "No tienes permisos para comentar."
- **El ticket debe estar en un estado donde el chat sea válido.** Hoy: todos excepto `cerrado`.

### Eventos realtime disparados

- `ticket:commented` por cada comentario.
- `attachment:added` por cada archivo.
- `notification:new` a todos los concernidos (creador, asignado, SAC, jefe del área).

---

## 13. Export a Excel / PDF

**Trigger:** el usuario quiere llevarse los datos fuera del sistema para análisis o auditoría.

**Actores:** SAC (siempre), Jefe inmediato (en `/reports`).

### Export a Excel

**Path:** `client/utils/exports.js` + `exportButton`.

1. **Click en "Exportar Excel"** (en `/tickets` o `/reports`).
2. **El botón se pone en estado "Exportando…"** (label cambia, disabled).
3. **Backend fetch**: `fetchAllForExport(filters)` itera la API `/api/tickets` con paginación hasta traer todos los registros que cumplen los filtros (con safety de 50 páginas).
4. **Carga de SheetJS desde CDN** (`https://cdn.jsdelivr.net/npm/xlsx@0.18.5/...`).
5. **`exportToExcel(rows, filename)`**:
   - Construye un AOA (array of arrays) con headers en español y filas con datos humanizados (status, priority, area con labels, fechas con `formatDateTime`).
   - Genera el workbook y dispara download via `XLSX.writeFile()`.
6. **Toast**: "Exportadas N filas a Excel."

### Export a PDF (ticket individual)

**Path:** `client/utils/exports.js` + `exportButton` (kind: 'secondary', format: 'pdf').

1. **Desde `/tickets/:id`**: click en "Exportar" (toolbar del header).
2. **`exportTicketToPDF(ticket)`**:
   - Carga jsPDF + jspdf-autotable desde CDN.
   - Genera PDF A4 con:
     - Cabecera: "GCM · Sistema de Tickets" + timestamp.
     - Título del ticket (código + título).
     - Tabla de info (estado, prioridad, categoría, área, creado por, asignado a, fechas).
     - Descripción completa (con wrap).
     - Línea de tiempo (todos los eventos del ticket).
3. **Download**: `doc.save(`${ticket.code}.pdf`)`.

### Casos borde

- **Filtros sin resultados**: toast "No hay tickets para exportar con los filtros actuales." No se hace download.
- **CDN inaccesible**: error en el loadScript → toast genérico. No se rompe la app.

---

## 14. Búsqueda global

**Trigger:** el usuario quiere encontrar un ticket por código, título o palabra clave en la descripción.

**Actor:** cualquiera autenticado.

### Pasos

1. **Atajo `/`** desde cualquier pantalla: el input del topbar se enfoca.
2. **El usuario escribe** la query.
3. **`Enter`** dispara `go('/tickets?q=${query}')`.
4. **`Esc`** limpia y desenfoca.
5. **La lista de tickets carga con el filtro `q`** aplicado.
   - El backend hace un LIKE sobre `code`, `title`, `description`.
   - La tabla muestra resultados.
6. **El usuario puede refinar** con los demás filtros (estado, prioridad, área) y re-aplicar.

### Limitaciones

- **No busca en comentarios ni adjuntos** (decisión de scope).
- **No hay resultados inline en el topbar** — siempre navega a `/tickets?q=...`.
- **Sin highlighting** del término en los resultados (futuro).

---

## 15. Realtime: qué ve cada usuario en tiempo real

**Mecánica:** el backend emite eventos Socket.io por ticket. El cliente los escucha y actualiza las vistas relevantes.

### Mapa de eventos → vistas afectadas

| Evento | Dashboard | Lista tickets | Detalle ticket | Notificaciones |
|---|---|---|---|---|
| `ticket:created` | append a primary list | prepend row | — | +1 unread, toast |
| `ticket:updated` | re-fetch primary list (in-place update) | row update | re-render header | — |
| `ticket:assigned` | update assigned_to | row update | re-render info card | +1 unread |
| `ticket:status_changed` | update badge | row update | re-render header + composer state | +1 unread |
| `ticket:commented` | append a activity feed | — | append bubble | +1 unread |
| `attachment:added` | append a activity feed | — | append thumb | +1 unread |
| `notification:new` | bell badge | bell badge | bell badge | bell badge + toast |

### Scope de visibilidad por evento

- **Tickets del área del jefe**: el jefe sólo recibe realtime de sus tickets (filtrado por `area`).
- **Tickets del admin**: el admin sólo recibe realtime de los tickets donde es asignado o creador.
- **Tickets del supervisor**: el supervisor sólo recibe realtime de los tickets que él creó.
- **Tickets del SAC**: SAC recibe realtime de TODO.

(Esto lo garantiza el backend al hacer `socket.to(userRoom)`.)

### Reconexión

- Al reconectar, `refreshBell()` re-pide el `unread-count` y las últimas 15 notificaciones.
- Las vistas abiertas se re-fetchean al primer evento recibido tras la reconexión.

---

## 16. Gestión de usuarios (SAC)

**Trigger:** alta/baja de personal, o rotación de roles/áreas.

**Actor:** `sac`.

### Pasos — Crear usuario

1. **Sidebar → Administración → Usuarios** (`/users`).
2. **Click en "+ Nuevo usuario"** (toolbar del header de la tabla).
3. **Modal**: username, full_name, role, area, password.
4. **Submit** → `api.users.create({...})`.
5. **Toast**: "Usuario creado."

### Pasos — Editar / Desactivar

1. **Click en "Editar"** en la fila → modal prellenado. Username no editable. Password opcional (dejar en blanco para no cambiar).
2. **Click en "Desactivar"** → modal de confirmación. El usuario pasa a `active: false`, no puede loguearse.

### Reglas

- **Username único**, validado por backend.
- **Password mínimo 4 caracteres** (cliente, validado también en backend).
- **Roles válidos**: `supervisor_campo`, `sac`, `admin_area`, `jefe_inmediato`.
- **Áreas válidas**: `operaciones`, `logistica`, `mantenimiento`, `sistemas`, `otro`.

### Visibilidad

Sólo SAC ve `/users`. El resto de los roles no tiene el link en su sidebar.

---

## 17. Gestión de categorías (SAC)

**Trigger:** alta de una nueva categoría de incidencia, o desactivación de una que ya no aplica.

**Actor:** `sac`.

### Pasos

1. **Sidebar → Administración → Categorías** (`/categories`).
2. **Click en "+ Nueva categoría"** → modal con un solo campo: nombre.
3. **Click en "Editar"** → modal prellenado.
4. **Click en "Desactivar"** → la categoría queda `active: false`. Los tickets existentes la siguen mostrando; no se puede asignar a tickets nuevos (futuro, hoy el select de crear ticket carga todas).

### Reglas

- **Sin cascada**: desactivar una categoría no afecta los tickets existentes.
- **Una sola categoría por ticket** (relación 1-N, no N-M).

---

## 18. Reportes y analytics (SAC + Jefe)

**Trigger:** el usuario quiere ver tendencias, exportar para Excel, o tomar decisiones basadas en datos agregados.

**Actores:** `sac`, `jefe_inmediato`.

### Pasos

1. **Sidebar → Operación → Reportes** (`/reports`).
2. **Filtros**: estado, prioridad, área, rango de fechas (from / to), búsqueda libre.
3. **Aplicar** → tabla + KPIs (Total, Abiertos, Cerrados, Reabiertos, Urgentes) + 2 charts (Por estado, Por prioridad).
4. **Exportar a Excel** → mismo flujo que en `/tickets`.

### Diferencia con `/tickets`

- `/reports` tiene los charts y los KPIs de totales filtrados.
- `/tickets` es la lista operativa con paginación y vista de cada ticket.

### Reglas

- **Permisos**: `canViewReports(user) = isSAC(user) || isJefe(user)`.
- **El jefe ve datos de su área solamente** (filtro de área aplicado en backend).

---

## 19. Logout / sesión expirada

### Logout manual

1. **Click en el avatar del topbar** → menú con "Cerrar sesión" (texto en `text-accent`).
2. **Submit** → `api.auth.logout()` → POST `/api/auth/logout`.
3. **`setState({ user: null, notifications: [], unreadCount: 0 })`** → limpia el store.
4. **`go('/login')`** → navega al login card.

### Sesión expirada (401)

1. **Cualquier request** devuelve 401.
2. **El cliente muestra toast** "Tu sesión expiró. Inicia sesión de nuevo." y redirige a `/login`.

### Visibilidad al volver

Al volver a loguearse, el router consulta `api.auth.me()` para re-hidratar la sesión. Si la cookie sigue válida, restaura la sesión sin pedir credenciales de nuevo (hasta que expire la cookie de sesión, 7 días por defecto según `login.js`).

---

## 20. Errores y recuperación

### Tipos de error y respuesta

| Tipo | Detección | UX | Recuperación |
|---|---|---|---|
| Validación cliente | Hooks en el form | Error inline al campo | El usuario corrige y reenvía. |
| Validación servidor | Response 400/409 | Error inline al campo o toast | Igual. |
| Sin permisos (403) | `nextStates` o `canSeeTicket` | La acción no se renderiza en la UI | N/A (el usuario no la ve). Si la intenta por URL: redirect a `/dashboard` o mensaje. |
| No encontrado (404) | `api.tickets.get(id)` con id inválido | Toast "Ticket no encontrado" + redirect a `/tickets`. | N/A. |
| Sesión expirada (401) | Cualquier API | Toast + redirect a `/login`. | Re-login. |
| Red / timeout | `fetch` falla | Toast "Sin conexión. Reintentaremos." | Auto-retry en próxima acción. |
| 5xx | Backend | Toast genérico "Algo falló. Intenta de nuevo." | Botón "Reintentar" si aplica. |
| Stack trace en consola | Bug | Solo dev lo ve | Reportar. |

### Reglas operacionales

- **Doble submit prevention**: cualquier botón de submit se deshabilita durante el request. El usuario no puede mandar el mismo formulario dos veces.
- **Optimistic update con rollback**: marcar notificación leída, asignar ticket, cambiar estado. Si el servidor rechaza, rollback + toast.
- **No retry infinito**: si una acción falla, el usuario decide si reintentar. No auto-retry en loop (consume batería y confunde).
- **Errores recuperables siempre tienen salida visible**: botón "Reintentar", link "Volver a inicio", o copy que indica qué hacer.

---

## Apéndice: matriz de visibilidad por rol

| Vista / acción | supervisor | sac | admin_area | jefe_inmediato |
|---|---|---|---|---|
| Dashboard del rol | ✅ | ✅ | ✅ | ✅ |
| Crear ticket | ✅ | ✅ | ❌ | ❌ |
| Ver lista de tickets | ✅ (sólo los suyos) | ✅ (todos) | ✅ (su cola) | ✅ (su área) |
| Ver detalle de ticket | ✅ (si es suyo) | ✅ | ✅ (si es suyo) | ✅ (si es de su área) |
| Comentar en ticket | ✅ (si no cerrado) | ✅ | ✅ | ✅ |
| Adjuntar archivo | ✅ (si no cerrado) | ✅ | ✅ | ✅ |
| Asignar / Reasignar | ❌ | ✅ | ❌ | ✅ |
| Cambiar estado | ❌ | ✅ (todos) | ✅ (algunos) | ✅ (cerrar, reabrir) |
| Cerrar ticket | ❌ | ✅ | ❌ | ✅ |
| Reabrir ticket | ❌ | ✅ | ❌ | ✅ |
| Editar metadatos (título, prioridad, cat) | ✅ (si está en `recibido` y es suyo) | ✅ | ❌ | ❌ |
| Export Excel/PDF | ❌ | ✅ | ❌ | ✅ (de su área) |
| Gestión de usuarios | ❌ | ✅ | ❌ | ❌ |
| Gestión de categorías | ❌ | ✅ | ❌ | ❌ |
| Ver reportes | ❌ | ✅ | ❌ | ✅ |
| Recibir notificaciones | ✅ (de sus tickets) | ✅ (de todo) | ✅ (de sus tickets) | ✅ (de su área) |

**Regla:** la tabla anterior es la **matriz de seguridad** del producto. Si una pantalla permite algo que no está en esta tabla, es un bug de UX o de permisos. Si la tabla contradice el brief o el código, hay que actualizar uno de los dos — pero no ambos a la vez.

---

## Resumen de eventos realtime

```
Servidor                              Cliente
────────                              ──────
                                      gcm:realtime emite
                                      { event, ...payload }
ticket:created       ─────────►        Dashboard append
                                      Tickets list prepend
                                      Notif +1 + toast
                                      Bell +1

ticket:updated       ─────────►        Row update in place
                                      (throttled en charts)

ticket:assigned      ─────────►        Row update
                                      Sidebar badge if me
                                      Notif +1

ticket:status_       ─────────►        Row update
changed                                 Header re-render
                                      Composer state change
                                      (disabled si cerrado)
                                      Notif +1

ticket:commented     ─────────►        Bubble append
                                      Activity feed append
                                      Notif +1

attachment:added     ─────────►        Thumb append
                                      Activity feed append
                                      Notif +1

notification:new     ─────────►        Bell counter
                                      Toast breve
                                      Lista recarga
```

**Cada evento llega a cada vista una sola vez.** El cliente deduplica y hace el trabajo de UI en el bloque que corresponde. Ver `UX_GUIDELINES §5` para el patrón de throttle y append-only.