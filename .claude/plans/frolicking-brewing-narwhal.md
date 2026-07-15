# Plan — Ticket detail (campos completos) + Diagnóstico campanita

## Contexto

**Bug 1 — Campos que faltan al asignado.** Cuando un usuario (jefe_inmediato / admin_area) recibe un ticket asignado, abre la vista de detalle y no ve toda la información que el creador llenó en el formulario. La `description` larga (8-5000 caracteres) sólo aparece como primer mensaje del chat `components/chat.js:51-75`, enterrada bajo adjuntos y comentarios posteriores. Los archivos subidos en la creación no se listan en la sidebar (la sidebar sólo lee metadatos del ticket, no `ticket.attachments` que ya viene en el payload). El status card usa solo badges, sin valor textual legible.

**Bug 2 — La campanita no muestra notificaciones.** La lista no-leída del dropdown llega vacía sin feedback. Diagnóstico necesario antes de cualquier cambio de UI (acordado con el usuario: mantener el filtro "solo no-leídas", así que el problema es de fondo: o no se crean, o no se leen, o el endpoint falla silenciosamente).

Decisión acordada:
- **Bug 1:** Mostrar descripción completa destacada, adjuntos en sidebar, código + prioridad con texto.
- **Bug 2:** Sólo diagnosticar — no cambiar UI. Logging de servidor + cliente para encontrar la causa.

---

## Bug 1 — Vista de detalle del ticket

### Archivos a modificar

**`client/views/ticket-detail.js`** — único archivo a tocar.

#### Cambio A — Card de descripción destacada (arriba del chat)

Insertar un nuevo card entre el header summary (línea 113) y el chat (línea 124):

```js
// Card "Descripción" — visible para TODOS los roles con acceso al ticket.
// La description se llena al crear y NO se muestra en ningún otro lado
// de forma prominente (sólo como primer mensaje del chat, enterrado).
const descCard = h('div.card', {}, [
  h('h3.text-sm.font-semibold.text-slate-700.mb-2', {}, 'Descripción del reporte'),
  h('p.text-sm.text-slate-800.whitespace-pre-wrap.leading-relaxed', {}, ticket.description || '—'),
]);
// Colocación: en `center` antes del chat actual
center.appendChild(descCard);
```

`whitespace-pre-wrap` mantiene saltos de línea que el creador haya escrito. Sin límite de longitud (la `description` ya está capada a 5000 en backend + cliente).

#### Cambio B — Sección de adjuntos en la sidebar

`renderSidebarInfo(ticket)` (línea 186) actualmente no incluye adjuntos. `ticket.attachments` ya viene populado desde `firestoreData.getTicketDetail` (línea 565: filtra `attachments` por `ticket_id` y los decora con `user_name`).

Modificar `renderSidebarInfo` para añadir, al final (después de la fila "Cerrado"):

```js
// Adjuntos subidos al crear o durante el ciclo de vida
if (ticket.attachments?.length > 0) {
  // Separador con título
  info.appendChild(h('h4.text-xs.font-semibold.text-slate-700.mt-3.mb-2.uppercase.tracking-wider', {}, 'Adjuntos'));
  const list = h('ul.flex.flex-col.gap-1\\.5', {});
  for (const att of ticket.attachments) {
    list.appendChild(h('li', {}, attachmentRow(att, ticket.id)));
  }
  info.appendChild(list);
}
```

Helper `attachmentRow(att, ticketId)` local — reusa el patrón de `client/components/attachments.js:32-63` (ya tenemos `attachmentThumb` y `api.tickets.downloadUrl`). Para mantener la sidebar compacta, en lugar del thumb grande, usar una fila compacta con icono + nombre + tamaño (igual al estilo "no-imagen" de `attachmentThumb` líneas 50-62).

**Reutilizar:** `attachmentThumb(att, ticketId)` de `client/components/attachments.js:32` — pero para la sidebar compacta preferir el variant de archivo (líneas 50-62). Lo extraigo a un helper local o importo `attachmentThumb` y acepto su tamaño.

Decisión: importar `attachmentThumb` directamente. La sidebar ya tiene ancho generoso en `lg:` (columna `lg:col-span-1` del grid); mostrar el thumb de imagen completo (32×32) o el row de archivo según `isImage(att.mime_type)` da contexto visual inmediato y no cuesta ancho.

```js
import { attachmentThumb } from '../components/attachments.js';
// ...
list.appendChild(h('li', {}, attachmentThumb(att, ticket.id)));
```

**Reutilizar:** `isImage` y `fileSize` ya exportados en `client/utils/format.js:38,71` y usados dentro de `attachmentThumb`.

#### Cambio C — Status card legible (código + prioridad en texto)

Líneas 99-111: el card "Estado" muestra badges pero ningún valor textual. Añadir una línea con código + prioridad legibles:

```js
h('div.mt-3.text-sm', {}, [
  h('div.flex.items-baseline.gap-2', {}, [
    h('span.text-xs.text-slate-500', {}, 'Código'),
    h('span.font-mono.text-sm.font-semibold.text-slate-900', {}, ticket.code),
  ]),
  h('div.flex.items-baseline.gap-2.mt-1', {}, [
    h('span.text-xs.text-slate-500', {}, 'Prioridad'),
    h('span.text-sm.font-semibold.text-slate-900', {}, PRIORITY_LABEL[ticket.priority] || ticket.priority),
  ]),
]),
```

`PRIORITY_LABEL` ya está importado (línea 10).

`STATUS_LABEL` ya existe (línea 10) y `STATUS_LABEL[ticket.status]` se calcula en `decorate()` del servicio pero **no se envía al cliente** — el campo `status_label` se calcula server-side pero el `decorate` de `ticket-detail` no lo lee. Sin embargo el badge `statusBadge(ticket.status)` ya muestra la etiqueta. Para evitar redundancia, no añado otra fila de estado, solo código + prioridad.

### Orden de cambios en `client/views/ticket-detail.js`

1. Añadir `import { attachmentThumb }` al top (después de imports de línea 1-16).
2. En `renderTicketDetail`, dentro de `center`, prepender `descCard` antes del `chat` (línea 124).
3. Modificar `renderSidebarInfo(ticket)` para añadir bloque de adjuntos al final.
4. En el header summary card (líneas 99-111), añadir bloque código + prioridad textual.

### Reutilización

- `attachmentThumb` de `client/components/attachments.js:32` (ya usado en chat.js línea 116).
- `PRIORITY_LABEL` de `client/utils/format.js:56` (ya importado en línea 10).
- `STATUS_LABEL`, `AREA_LABEL`, `formatDateTime`, `relativeFromNow` ya importados (línea 10).
- Patrón de card de `h('div.card', {}, [...])` consistente con el resto de la vista.

### Verificación Bug 1

End-to-end manual:
1. Login como `supervisor_campo` (rol que crea tickets).
2. Crear ticket con descripción larga (≥30 chars), 2 adjuntos, prioridad "Alta".
3. Logout, login como `sac` (rol que asigna), asignar el ticket a un `admin_area`.
4. Logout, login como `admin_area` asignado. Abrir el ticket.
5. **Esperado:**
   - El card "Descripción del reporte" muestra el texto completo con saltos de línea.
   - La sidebar lista los 2 adjuntos con icono + nombre + link de descarga.
   - El status card muestra el código (ej. `TKT-00042`) y la palabra "Alta".
6. Probar también con un ticket sin adjuntos: la sección no debe renderizarse.
7. Probar desde `supervisor_campo` viendo un ticket ajeno: la description debe seguir visible (es info pública del ticket).

### Riesgos / consideraciones

- **Bot "Editar detalles"** (`openEditModal`, líneas 313-349) sigue editando `description`, así que el card refleja cambios en vivo sin trabajo extra.
- **Tickets muy viejos** sin `description` poblada por algún path de migración: el helper muestra `—` (línea del card de descripción).
- **Performance**: `ticket.attachments` ya viene en el payload; no añade fetch.

---

## Bug 2 — Diagnóstico campanita (sin cambio de UI)

Acordado: **no tocar la UI**, sólo encontrar por qué la lista no-leída llega vacía.

### Hipótesis a verificar (por orden de probabilidad)

1. **El socket `notification:new` no se conecta** en el cliente. Si el cliente sólo carga con `refreshBell()` al login y la campanita nunca recibe realtime, las notificaciones creadas después del login no se ven. Pero la campanita hace `loadList()` al abrir, así que DEBE llegar del endpoint HTTP aunque el socket falle.
2. **El endpoint `GET /api/notifications` falla silenciosamente.** El catch de `topbar.js:259-262` muestra el error como texto, pero el usuario podría no verlo. Hay que loguearlo en consola del servidor.
3. **Filtro `unread: 'true'` + campo `read` con tipo mixto.** Backend escribe `read: 0` (firestoreData.js:373), filtra con `!row.read` (línea 386). En Firestore el campo es `integer`. `!0 = true`, `!1 = false`. Si por algún path de migración quedó como `boolean`, podría romper.
4. **El store `notifications` se llena en `refreshBell()`** (main.js:99-105) pero el dropdown NO lee del store — lee directo del endpoint. Si `refreshBell` funciona pero el dropdown vacío, el problema está en el endpoint o en el render.
5. **Auth/cookie**: el endpoint requiere `requireAuth`. Si la cookie de sesión se pierde, el endpoint devuelve 401 y el catch del topbar pinta el error pero el panel se queda en estado raro.

### Pasos de diagnóstico (sin código nuevo, sólo logs)

**A. Servidor — añadir log temporal en el endpoint `GET /api/notifications`:**

En `src/routes/notifications.routes.js:7-16`, loguear:
- `req.user.id`
- `req.query` (`limit`, `unread`)
- Resultado: `list.length` y los primeros 2 items (id, type, read, created_at)

**B. Cliente — abrir la campanita y mirar la consola del navegador:**

- Si `loadList` lanza excepción: la excepción se imprime en consola vía `e.message`.
- El `fetch` errors aparecen en la pestaña Network.
- Verificar que el GET `/api/notifications?unread=true&limit=10` devuelve 200 y JSON con la lista esperada.

**C. Si el endpoint devuelve lista vacía pero la campanita muestra badge `>0`:**

- Disparar el `notification:new` por socket al hacer `refreshBell`. El badge puede ser stale.
- Forzar `api.notifications.unreadCount()` aislado en consola del navegador y comparar con la lista.

**D. Crear un ticket de prueba con un usuario receptor de notificaciones y verificar:**

- En `tickets.service.js:84-93` se crean notificaciones a SAC users en `createTicket`.
- Si el usuario logueado es SAC, DEBE ver las notificaciones de tickets creados.

### Output esperado del diagnóstico

Un informe breve con:
- ¿El endpoint devuelve datos? Sí / No / Cuántos
- ¿El campo `read` es `0`/`1` o `true`/`false`? (Firestore puede diferir del esquema TypeORM)
- ¿El socket `notification:new` llega? (mirar en consola: `onSocket('notification:new', ...)`)
- ¿Hay error 401/403/500 en Network?

### Acción post-diagnóstico

Según lo encontrado, una de:
- **Fix mínimo en cliente**: leer del store si ya está cargado (evita re-fetch redundante).
- **Fix en endpoint**: usar `where('user_id', '==', userId).where('read', '==', false)` en Firestore en vez de full-scan + filter.
- **Fix de tipo**: normalizar `read` en `normalizeNotification` para que siempre sea `0`/`1`.
- **Fix de socket**: si no llega, revisar `setup()` en `src/sockets/index.js:7-31` y la cadena de `join('user:{id}')`.

**El fix concreto se propondrá en una segunda iteración** una vez sepamos la causa. No se incluye en este plan porque requiere evidencia del diagnóstico.

### Verificación Bug 2 (post-fix)

- Login como `sac`. Verificar badge con count correcto.
- Disparar acción que cree notificación (crear ticket, asignar, comentar).
- **Esperado:** badge incrementa, campanita al abrir muestra el item nuevo, marcar como leída baja el badge.

---

## Resumen de cambios

| Archivo | Tipo | Cambio |
|---|---|---|
| `client/views/ticket-detail.js` | Editar | Card descripción completa + adjuntos en sidebar + código/prioridad textual en status card |
| `src/routes/notifications.routes.js` | Log temporal | Console.log de request y response para diagnosticar campanita |
| `client/components/topbar.js` | Log temporal | `console.error` en el catch de `loadList` para visibilidad |

(Los logs temporales del Bug 2 se removerán después del diagnóstico.)

## Orden de ejecución

1. Implementar Bug 1 (cambios en `ticket-detail.js`).
2. Probar manualmente con un ticket recién creado.
3. Activar logs temporales del Bug 2 y abrir la campanita.
4. Reportar hallazgos al usuario; acordar fix del Bug 2 en un plan posterior.
