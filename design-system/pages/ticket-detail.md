# Ticket Detail — Overrides

Reglas que sobrescriben al Master SOLO para la vista de detalle de un ticket.

## Layout

- **Grid:** `lg:grid-cols-3` con `chat lg:col-span-2` + sidebar de info y acciones.
- **Móvil (< lg):** chat primero, sidebar debajo, full-width ambos.
- **Altura de chat-box:** `max-h-[60vh] overflow-y-auto`. En pantallas ≥ md usar `max-h-[calc(100vh-260px)]` para llenar mejor el viewport.

## Header

- Línea 1: breadcrumb "← Tickets" + código monoespaciado.
- Título: `text-2xl md:text-3xl font-bold text-brand-ink`, max 2 líneas con line-clamp.
- Acciones: **PDF** (secondary) + **Recargar** (ghost icon). En móvil, sólo iconos.

## Tarjeta resumen (reemplaza al bloque "Resumen" actual)

- Una sola `.card` con grid interno 2×N, no dos tarjetas separadas.
- Cada fila: label `text-xs uppercase tracking-wider text-slate-500` + valor `text-sm font-semibold text-brand-ink`.
- Badges (estado, prioridad, área, categoría) en una fila debajo del grid, con dot de color.

## Chat

- **Burbujas:** usar `chat-bubble` con clase condicional `chat-bubble-me` cuando `c.user_id === currentUser.id`. Si NO hay match, **todas las burbujas a la izquierda** (no fingir que el SAC "es yo").
- **Avatar:** circular, 32px, a la izquierda siempre (excepto mensajes propios: avatar a la derecha). Initials sobre color de fondo determinístico por `user_id`.
- **Eventos del timeline** (creado, asignado, reasignado, cambio de estado): línea centrada con dot, label en pill blanca con sombra suave. **Sin emoji en el label** — usar SVG icon.
- **Adjuntos:**
  - Imagen → thumbnail 128×128 clickable, abre lightbox.
  - Archivo → fila con icono SVG por tipo (PDF, doc, sheet, zip, image), nombre + tamaño.
- **Fecha visible** al hacer hover/tap sobre la marca de tiempo (tooltip `formatDateTime`).

## Acciones

- Stack vertical en mobile, fila en desktop.
- Una sola CTA primaria visible a la vez (ej. "→ Solucionado" si `nextStates` lo permite). Las demás en `btn-secondary btn-sm`.
- Acción destructiva (cerrar) con `btn-danger` separada visualmente.
- Acciones deshabilitadas (sin permiso) **no se renderizan**, no se muestran en gris.

## Estados

- `status === 'cerrado'`: composer se reemplaza por mensaje "El ticket está cerrado. No se pueden enviar nuevos mensajes." + link "Reabrir" si el rol lo permite.
- `status === 'solucionado'` + rol `jefe_inmediato`: composer deshabilitado con texto "Pendiente de cierre por el jefe de área."

## Empty state del chat

- Icono SVG 48px (chat bubble), "Sin actividad aún", subtítulo "Sé el primero en comentar.", CTA `+ Nuevo comentario` si el composer está disabled.
