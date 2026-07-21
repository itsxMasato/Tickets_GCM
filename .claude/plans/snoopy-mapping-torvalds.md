<!-- Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. -->

# Plan: bug "No tiene permisos" al abrir ticket asignado a admin_area

## Context

**Síntoma reportado por el cliente:** Eli (rol `admin_area`) ve en su lista el ticket que SAC le asignó, pero al hacer click y entrar al detalle recibe el error "No tiene permisos para realizar esta acción." (403 FORBIDDEN). La asignación figura bien en la lista, así que el problema NO está en `assignTicket` — está en el guard de visibilidad de `getTicket`.

**Causa raíz (confirmada con el inventario):** mismatch `Number` vs `String` en comparaciones de id. El sistema modela todos los ids como `integer` (ver `src/orm/entities/user.entity.js:30` y `src/orm/entities/ticket.entity.js:32,40-42`). Pero el flujo de login deja `req.user.id` como **string** porque `auth.service.login()` no normaliza:

- `firestoreData.getUserByIdentifier()` (`src/firestoreData.js:214`) devuelve el doc crudo de Firestore, donde `snap.id` es string.
- `sanitize()` (`src/services/auth.service.js:67-76`) copia `id: user.id` tal cual.
- `req.session.userId = user.id` (`src/routes/auth.routes.js:13,57`).
- `req.user = { id: req.session.userId, ... }` (`src/middleware/requireAuth.js:7-13`).

Mientras tanto, los tickets pasan por `normalizeTicket()` (`src/firestoreData.js:87-112`) que aplica `toId()` → `Number`. Resultado: `ticket.assigned_to === user.id` se evalúa como `7 === "7"` → `false`. Eli nunca pasa el guard de `canView` para `admin_area`, aunque sea el asignado legítimo.

**Escala del bug (inventario completo):** 16 lugares afectados entre server y cliente. No es un fix de una línea.

| Archivo | Líneas | Impacto |
|---|---|---|
| `src/services/tickets.service.js` | 24, 25, 29, 37, 60, 207, 219, 234, 245, 285, 286, 326, 327 | 13 comparaciones; 5 son guardas de permisos (causan 403), 8 son lógica de notificaciones/chat (causan comportamiento silenciosamente incorrecto) |
| `client/utils/permissions.js` | 19, 20, 27, 58 | 4 comparaciones espejo; aunque arreglemos el server, la UI seguirá ocultando botones sin tocar esto |
| `client/components/chat.js` | 95 | `c.user_id === me.id` para alinear comentarios a la derecha |

**Objetivo:** arreglar el bug de Eli (server) y dejar el sistema sin bombas de tiempo latentes (cliente + notificaciones), con el mínimo de código nuevo y sin tocar el modelo de datos.

## Approach

**Principio:** arreglar la causa raíz, no parchear 16 comparaciones. Si normalizo `req.user.id` a `Number` en el middleware de auth, **las 13 comparaciones del server dejan de fallar sin tocarlas**, porque `Number === Number` es siempre correcto.

El cliente sigue necesitando el mismo helper porque ahí `user.id` también es string (mismo flujo de sesión) y `ticket.assigned_to` también es Number (mismo `normalizeTicket`). Para el cliente creo un helper `sameId(a, b)` porque ahí sí hay que tocar cada llamada (no hay middleware equivalente donde normalizar una sola vez).

**Por qué NO el approach de "crear `sameId` y aplicarlo en 16 sitios":**
- El bug se repite en cada comparación nueva que se agregue. No elimina la bomba, solo la mueve.
- El ORM ya define `id` como `integer`. La normalización en el middleware **alinea el código con el modelo**, no introduce una nueva capa defensiva.
- `req.session.userId` puede seguir siendo string (express-session no le importa el tipo); solo normalizamos a la salida del middleware.

**Por qué NO normalizar en `auth.service.login` (alternativa):**
- Si un admin_area está logueado y su sesión expira pero el id quedó en `req.session.userId` como string heredado, el bug reaparece. Normalizar en el middleware cubre también ese caso.
- Hay dos rutas de login (normal y Firebase) que setean `req.session.userId`. El middleware es un solo punto.

## Pasos

### 1. Fix de raíz en el middleware de auth (server)

**Archivo:** `src/middleware/requireAuth.js`

Cambio mínimo:
```js
// Antes (línea 7-13)
req.user = {
  id: req.session.userId,
  ...
};

// Después
req.user = {
  id: toId(req.session.userId),
  ...
};
```

Importar `toId` desde `src/firestoreData.js` (ya está exportado, ver `firestoreData.js:898`). Si el id es null/ausente, `toId` devuelve `null` igual que antes.

**Esto solo arregla el server.** No requiere cambios en `tickets.service.js` — las 13 comparaciones pasan a `Number === Number` y funcionan.

### 2. Helper `sameId` para el cliente

**Archivo nuevo:** `client/utils/ids.js` (espejo mínimo del `toId` del server, sin acoplamiento)

```js
// Comparación de ids tolerante a Number/String.
// Los ids del backend salen como Number (normalizeTicket aplica toId);
// el id de la sesión en el cliente puede llegar como String (mismo flujo
// de login que producía el bug del server). Esta función evita que un
// descuido de tipos oculte botones oculte mensajes en la UI.
export function sameId(a, b) {
  if (a == null || b == null) return false;
  if (typeof a === 'object' || typeof b === 'object') return false;
  // Number(Number(x)) === Number(Number(y)) absorbe "7" y 7, NaN incluido
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na === nb;
  return String(a) === String(b);
}
```

**Por qué no reusar `toId` del server directamente:** son procesos distintos y el cliente no debería importar código de Node. El helper del cliente es independiente.

### 3. Aplicar `sameId` en las 5 comparaciones del cliente

**Archivo:** `client/utils/permissions.js`

Reemplazar:
- Línea 19: `ticket.assigned_to === user.id || ticket.created_by === user.id` → `sameId(ticket.assigned_to, user.id) || sameId(ticket.created_by, user.id)`
- Línea 20: `ticket.created_by === user.id` → `sameId(ticket.created_by, user.id)`
- Línea 27: `ticket.created_by === user.id` → `sameId(ticket.created_by, user.id)`
- Línea 58: `ticket.assigned_to !== user.id` → `!sameId(ticket.assigned_to, user.id)`

**Archivo:** `client/components/chat.js`

- Línea 95: `me && c.user_id === me.id` → `me && sameId(c.user_id, me.id)`

Importar `sameId` en ambos archivos.

### 4. Verificación end-to-end

1. **Smoke test del fix de Eli** (el bug reportado):
   - Login como Eli (admin_area).
   - Confirmar que el ticket asignado por SAC ahora abre sin 403.
   - El header del ticket debe mostrar el nombre del asignado (Eli) y permitir comentar.

2. **Sanity check de los otros roles** (cubre el resto de las 13 comparaciones del server arregladas "gratis"):
   - Como supervisor_campo: crear un ticket, luego intentar abrirlo → debe ver (canView línea 29). Intentar editar metadata en estado `recibido` → debe poder (canEditMeta línea 37). En `en_proceso` → debe ser 403.
   - Como admin_area asignado a un ticket: cambiar estado `asignado` → `en_proceso` → debe poder (canChangeStatus línea 60).
   - Como jefe_inmediato: cambiar estado `solucionado` → `cerrado` → debe poder.
   - Como SAC: cualquier acción permitida.

3. **Verificar chat espejo del fix del cliente**:
   - Como Eli comentar en un ticket; verificar que su comentario sale alineado a la derecha ("mío"), y los comentarios de SAC/supervisor a la izquierda.
   - Abrir ticket-detail como Eli: deben verse los botones de cambio de estado a `en_proceso` y `solucionado` (canSeeTicket + nextStates).

4. **No regresiones de notificaciones** (cubierto por el fix de raíz):
   - Como admin_area cambiar estado a `solucionado` → el jefe inmediato del área debe recibir la notificación "Listo para cerrar" (antes fallaba por el mismo bug en línea 219).
   - Como jefe_inmediato cerrar un ticket → los SAC (excepto el que cierra) deben recibir notificación de cierre (antes línea 234 fallaba y el SAC que cerraba también se notificaba a sí mismo).

5. **Verificación de que el backend sigue arriba**:
   - `node --check src/middleware/requireAuth.js`
   - `node --check src/services/tickets.service.js` (no se modifica pero confirmar que sigue compilando tras el cambio de import).
   - Arrancar el server y hacer un `curl` con un token de Eli: `GET /api/tickets/{id-del-ticket-asignado}` debe devolver 200 con el ticket (antes 403).

## Archivos críticos a modificar

| Path | Tipo de cambio |
|---|---|
| `src/middleware/requireAuth.js` | 1 línea: `id: req.session.userId` → `id: toId(req.session.userId)` + import |
| `client/utils/ids.js` | **Nuevo** — helper `sameId` |
| `client/utils/permissions.js` | 4 comparaciones + import |
| `client/components/chat.js` | 1 comparación + import |

**NO se modifican** (el fix de raíz los cubre implícitamente):
- `src/services/tickets.service.js` (las 13 comparaciones pasan a `Number === Number` sin tocarlas)
- `src/services/auth.service.js` (no necesita normalizar; el middleware lo hace)
- `src/firestoreData.js` (`toId` ya está bien)

## Riesgos y mitigación

- **Sesiones existentes:** al部署 el fix, las sesiones abiertas de Eli y otros usuarios tienen `req.session.userId` como string. El middleware los va a normalizar a Number en cada request. Sin pasos extra. Si por algún motivo `toId` fallase, devuelve `null` y el guard de auth existente ya lo bloquea.
- **Tests de los servicios:** no hay suite de tests visible en el repo (revisado con grep en sesiones previas); la verificación es manual via curl + UI.
- **Caché del cliente:** el usuario debe recargar la página para que `sameId` se cargue; no hace falta invalidar caché del server porque el cambio es solo en runtime.
