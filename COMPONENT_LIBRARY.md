<!-- Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. -->

# Component Library — GCM Tickets

> Catálogo de componentes. Cada componente documenta: propósito, anatomía del DOM, props, variantes, estados, ejemplos de uso, código del codebase, accesibilidad.
>
> **Stack:** Vanilla JS + helper `h()` hiperscript (en `client/utils/dom.js`) + Tailwind 3.4 + clases component en `client/styles.css`. No React, no JSX.

**Convención de nombres:**
- **Componente público**: exportado desde `client/components/<nombre>.js` con `export function <Nombre>({ ...props })`.
- **Internal helper**: `function helperLocal()` dentro del mismo archivo, no exportado.
- **DOM tag**: siempre lowercase, kebab-case para variants, BEM-like cuando hay modificadores (`btn`, `btn-primary`, `btn-ghost`).
- **Icono**: siempre SVG inline vía `client/utils/icons.js` (`ICON.<name>` + `svg(h, name, cls)`).

---

## Índice

1. [Botones](#1-botones)
2. [Inputs](#2-inputs)
3. [Card](#3-card)
4. [KPI Card](#4-kpi-card)
5. [Status Badge](#5-status-badge)
6. [Priority Badge](#6-priority-badge)
7. [Avatar](#7-avatar)
8. [Sidebar](#8-sidebar)
9. [Topbar](#9-topbar)
10. [Modal](#10-modal)
11. [Toast](#11-toast)
12. [Empty State](#12-empty-state)
13. [Ticket Card](#13-ticket-card)
14. [Chat Bubble](#14-chat-bubble)
15. [Chat Event](#15-chat-event)
16. [Chat Composer](#16-chat-composer)
17. [Attachment Thumb](#17-attachment-thumb)
18. [Notification Card](#18-notification-card)
19. [Back Button](#19-back-button)
20. [Export Button](#20-export-button)
21. [Tabla](#21-tabla)
22. [Charts](#22-charts)
23. [Skeleton](#23-skeleton)
24. [Layout Shell](#24-layout-shell)

---

## 1. Botones

**Path:** definidos como clases en `client/styles.css` (`.btn`, `.btn-primary`, `.btn-accent`, `.btn-secondary`, `.btn-ghost`, `.btn-sm`, `.btn-icon`, `.btn-icon-sm`). No son componentes JS — son primitivas CSS aplicadas a `<button>` o `<a>`.

### Anatomía

```
<button class="btn btn-{variant} {size?}" disabled?>
  <svg class="w-4 h-4" .../>   <!-- opcional -->
  <span>Label</span>
</button>
```

### Variantes

| Variante | Background | Color texto | Border | Uso |
|---|---|---|---|---|
| `btn-primary` | `bg-brand` | white | none | Acción dominante de una superficie. |
| `btn-accent` | `bg-accent` | white | none | Acciones críticas (Crear, Cerrar, Reabrir). |
| `btn-secondary` | `bg-white` | `text-brand-ink` | `border-surface-border` | Workhorse. "Filtrar", "Limpiar", "Ver todos". |
| `btn-ghost` | transparent | `text-brand-ink/80` | none | Destructivo o en layouts apretados. |

### Tamaños

| Tamaño | Padding | Font-size | Uso |
|---|---|---|---|
| default | `px-3.5 py-2` | `text-sm` | Botones estándar. |
| `btn-sm` | `px-2.5 py-1` | `text-xs` | Inline en filas, cards apretados. |

### Estados

| Estado | Cambio |
|---|---|
| Default | (definido por variante) |
| Hover (primary) | `bg-brand-deep` |
| Hover (accent) | `bg-accent-hover` |
| Hover (secondary) | `bg-surface` |
| Hover (ghost) | `bg-surface` |
| Focus | ring 2px `brand-ocean` (primary/secondary), `accent` (accent), 1px offset |
| Disabled | `opacity-50 cursor-not-allowed` |
| Active (pressed) | inherente del hover |

### Icon buttons

```html
<button class="btn-icon" aria-label="Notificaciones">
  <svg class="w-5 h-5">...</svg>
</button>
```

`btn-icon`: 44×44 (touch target mínimo). `btn-icon-sm`: 36×36 (uso en filas densas).

### Reglas

- **Una acción primaria por superficie.** No dos `btn-primary` compitiendo.
- **Verbo imperativo.** "Crear ticket", "Cerrar", "Filtrar". Sin "Sí", sin "OK".
- **Label siempre visible.** El texto no se esconde detrás del icono, aunque el icono puede ir al lado.
- **Destructivos van con `ghost` o `accent`**, no con `primary`. El rojo camarón lleva la gravedad visual.
- **Min-height 36px (btn-sm) o 40px (default).** Touch target WCAG.

### Ejemplo

```js
import { h } from '../utils/dom.js';
import { ICON } from '../utils/icons.js';

h('button.btn.btn-primary.gap-1.5', { onclick: doCreate }, [
  svg(ICON.plus, 'w-4 h-4'),
  h('span', {}, 'Crear ticket'),
]);
```

---

## 2. Inputs

**Path:** definidos como `.input` y `.label` en `client/styles.css`.

### Variantes

- `input` (default): white, 1px `surface-border`, 8px radio, `shadow-soft`.
- `input[type="search"]`: hereda, autoflow con icono en `.topbar-search`.
- `input[type="date"]`: hereda, padding nativo.
- `textarea.input`: rows configurable, resize vertical.
- `select.input`: hereda, dropdown nativo.

### Estados

| Estado | Cambio |
|---|---|
| Default | white, border `surface-border`, text `text-brand-ink`. |
| Placeholder | `text-slate-500`. |
| Focus | border `brand-ocean`, ring 2px `brand-ocean/40`. |
| Error | border `red-300`, bg `red-50`, helper text `text-red-700`. |
| Disabled | `opacity-50 cursor-not-allowed`. |

### Anatomía

```html
<div>
  <label class="label" for="title">Título *</label>
  <input class="input" type="text" id="title" maxlength="200" required />
</div>
```

### Reglas

- **Label visible siempre** (no `placeholder-as-label` — falla WCAG).
- **`*` en label para campos requeridos.** No asterisco solo — el helper "Todos los campos marcados con * son obligatorios" una vez por formulario.
- **Helper text debajo del input**, no en title.
- **Error inline al campo**, no como banner arriba del form. Con `aria-live="polite"` y `aria-describedby`.
- **Maxlength visible en el contador** si aplica (textarea del chat: `0/4000` abajo a la izquierda).

### Variante search (topbar)

```html
<div class="topbar-search">
  <svg class="w-4 h-4 text-slate-400">...</svg>
  <input class="flex-1 bg-transparent border-0 outline-none text-sm"
         type="search"
         placeholder="Buscar tickets, usuarios… (presiona /)"
         aria-label="Buscar" />
  <kbd class="hidden md:inline-flex ...">/</kbd>
</div>
```

El contenedor `.topbar-search` cambia a `bg-white border-surface-border` en focus.

---

## 3. Card

**Path:** `.card` en `client/styles.css`.

### Anatomía

```html
<div class="card">
  <!-- contenido -->
</div>
```

### Tokens

- `bg-white`
- `border border-surface-border` (1px)
- `rounded-xl` (12px)
- `p-5` (20px)
- `shadow-card`

### Variantes

| Variante | Uso |
|---|---|
| `.card` | Default. Padding interno `p-5`. |
| `.card-tight` | Sin padding default. Útil para tablas o listas que controlan su propio padding. |
| `.card.bg-slate-50` | Sección de "resumen" o "info" (página detalle de ticket). Tinte sutil para jerarquía. |

### Reglas

- **Una acción primaria por card.** Si un card tiene 3 botones, no es un card — es un panel.
- **No stripe de color en el borde.** (Anti-pattern de DESIGN.md §6.)
- **Hover lift opcional** (`.kpi-card` lo usa) sólo si el card es interactivo. Si no, plano en reposo.

### Ejemplo

```js
h('div.card', {}, [
  h('h3.text-sm.font-semibold.text-brand-ink.mb-3', {}, 'Resumen del ticket'),
  // ... grid de campos
]);
```

---

## 4. KPI Card

**Path:** `.kpi-card`, `.kpi-label`, `.kpi-value`, `.kpi-hint` en `client/styles.css`. Helper `kpi(label, value, hint)` inline en `dashboard.js` y `reports.js`.

### Anatomía

```html
<div class="kpi-card">
  <div class="kpi-label">Tickets abiertos</div>
  <div class="kpi-value">42</div>
  <div class="kpi-hint">Monitoriza tu cola activa</div>
</div>
```

### Tokens

| Elemento | Estilo |
|---|---|
| Container | `.card` + `flex flex-col gap-1.5` + `hover:shadow-pop` |
| Label | `text-xs uppercase tracking-wider text-slate-500 font-medium` |
| Value | `text-2xl font-bold text-brand-ink` |
| Hint | `text-xs text-slate-400` |

### Reglas

- **Hint opcional.** Si no hay contexto adicional, omitir.
- **Hover lift** (`shadow-pop`) — implica interactividad, aunque la card puede no tener handler. Consistencia visual.
- **Tone semántico (futuro):** prioridad `urgente` con `text-accent` en el value, no en el label.

### Helper

```js
function kpi(label, value, hint = '') {
  return h('div.kpi-card', {}, [
    h('div.kpi-label', {}, label),
    h('div.kpi-value', {}, String(value)),
    hint ? h('div.kpi-hint', {}, hint) : null,
  ]);
}
```

---

## 5. Status Badge

**Path:** `.badge-<status>` en `client/styles.css`. Helper `statusBadge(status)` en `client/components/badge.js`.

### Estados

| Estado | Clase | Background | Texto | Dot |
|---|---|---|---|---|
| `recibido` | `.badge-recibido` | slate-100 | slate-800 | slate-500 |
| `asignado` | `.badge-asignado` | blue-100 | blue-900 | blue-600 |
| `en_proceso` | `.badge-en_proceso` | amber-100 | amber-900 | amber-600 |
| `solucionado` | `.badge-solucionado` | emerald-100 | emerald-900 | emerald-600 |
| `cerrado` | `.badge-cerrado` | slate-200 | slate-900 | slate-600 |
| `reabierto` | `.badge-reabierto` | orange-100 | orange-900 | orange-600 |

### Anatomía

```html
<span class="badge-recibido">
  <!-- dot via ::before -->
  Recibido
</span>
```

El dot se renderiza via `.badge-dot::before { content: ''; ... }` con el color por estado.

### Reglas

- **The Color-Blind Rule.** Dot + label + color. El label nunca falta.
- **No usar como botón.** Status badge es informativo. Si es interactivo, el card contenedor es el botón.
- **Width: `inline-flex`** — se ajusta al contenido.

### Helper

```js
import { statusBadge } from '../components/badge.js';
statusBadge('recibido');  // → <span class="badge-recibido">Recibido</span>
```

---

## 6. Priority Badge

**Path:** `.prio-<priority>` en `client/styles.css`. Helper `priorityBadge(priority)` en `client/components/badge.js`.

### Prioridades

| Prioridad | Clase | Dot color |
|---|---|---|
| `baja` | `.prio-baja` | slate-500 |
| `media` | `.prio-media` | blue-600 |
| `alta` | `.prio-alta` | amber-600 |
| `urgente` | `.prio-urgente` | red-600 (NO `accent` aquí — el dot semántico es la convención del sistema) |

### Reglas

- Mismas reglas que status badge: dot + label + color.
- El valor semántico de "urgente" no se mezcla con la marca (`accent`); se usa el `red-600` estándar para mantener consistencia con el sistema de badges de Tailwind. El rojo camarón (`accent`) se reserva para **botones de acción** y **dots de notificación no-leída**.

---

## 7. Avatar

**Path:** `.avatar` en `client/styles.css`. Helper `avatarColor(seed)` e `initials(name)` replicado en `topbar.js`, `sidebar.js`, `chat.js`, `notifications.js`.

### Anatomía

```html
<span class="avatar" style="background-color: #16ACE4">JP</span>
```

### Tokens

- 36×36 (`w-9 h-9`)
- `rounded-full`
- `flex items-center justify-center`
- `text-xs font-semibold text-white`

### Paleta determinística (10 colores)

```js
const colors = [
  '#2563eb', '#16a34a', '#f59e0b', '#ef4444', '#8b5cf6',
  '#0ea5e9', '#db2777', '#14b8a6', '#7c3aed', '#f97316',
];
```

Indexado por `user.id % 10`. Mismo usuario, mismo color, en todas las vistas.

### Variantes de tamaño

| Tamaño | Clases | Uso |
|---|---|---|
| `avatar` (default) | `w-9 h-9` | Topbar, sidebar, chat bubbles. |
| Compacto | `w-8 h-8` o `w-7 h-7` | Activity feed, listas densas. |
| Grande | `w-12 h-12` o `w-16 h-16` | Detalle de ticket (futuro). |

### Reglas

- **Initials: 2 letras** (primer letra de los 2 primeros words del full name). Fallback a "?" si no hay nombre.
- **`ring-2 ring-white`** cuando el avatar está sobre fondo oscuro (topbar), para separación.
- **`aria-hidden="true"`** si está al lado de texto legible (que es el patrón estándar).

---

## 8. Sidebar

**Path:** `client/components/sidebar.js`. CSS en `client/styles.css` (`.sidebar`, `.gcm-sidebar`, `.sidebar-link`, `.sidebar-section`, `.sidebar-brand`, `.sidebar-foot`).

### Anatomía

```html
<aside class="sidebar">
  <div class="sidebar-brand">
    <div class="w-10 h-10 rounded-lg bg-white ...">
      <img src="/img/Logo.png" alt="Logo GCM" />
    </div>
    <div>
      <div class="font-bold leading-tight">GCM Tickets</div>
      <div class="text-[11px] text-white/60">Servicio al cliente</div>
    </div>
  </div>

  <nav>
    <div class="mb-1">
      <div class="sidebar-section">Operación</div>
      <div class="flex flex-col gap-0.5 px-2">
        <button class="sidebar-link" aria-current="page">
          <svg class="sidebar-icon">...</svg>
          <span>Inicio</span>
          <span class="ml-auto w-1.5 h-1.5 rounded-full bg-brand-ocean"></span>
        </button>
        ...
      </div>
    </div>
    ...
  </nav>

  <div class="sidebar-foot">
    <!-- user card + logout -->
  </div>
</aside>
```

### Tokens

- Container: `w-64` (256px), `bg-brand` (navy), `flex flex-col`, `shadow-sidebar` (4px 0 24px -8px rgba(7,29,76,0.18)).
- Link: `px-3 py-2 rounded-md text-sm font-medium text-white/80 hover:bg-white/10 hover:text-white`.
- Link active: `bg-white/15 text-white shadow-soft`.
- Section label: `px-3 mt-4 mb-1 text-[10px] font-semibold uppercase tracking-widest text-white/50`.

### Secciones por rol

```js
function navFor(user) {
  if (isSupervisor(user)) {
    return [
      { title: 'Operación', items: [/* Inicio, Mis tickets */] },
      { title: 'Cuenta', items: [/* Notificaciones */] },
    ];
  }
  if (isAdmin(user)) {
    return [
      { title: 'Operación', items: [/* Inicio, Mi área */] },
      { title: 'Notificaciones', items: [/* Bandeja */] },
    ];
  }
  if (isJefe(user)) {
    return [
      { title: 'Operación', items: [/* Inicio, Tickets del área, Reportes */] },
      { title: 'Notificaciones', items: [/* Bandeja */] },
    ];
  }
  if (isSAC(user)) {
    return [
      { title: 'Operación', items: [/* Inicio, Todos los tickets */] },
      { title: 'Administración', items: [/* Usuarios, Categorías, Reportes */] },
      { title: 'Notificaciones', items: [/* Bandeja */] },
    ];
  }
}
```

### Mobile (< md)

- Sidebar se oculta: `body:not(.gcm-sidebar-open) .gcm-sidebar { display: none; }`.
- Al click en el botón ☰ del topbar, el body recibe la clase `.gcm-sidebar-open` y la sidebar se muestra como drawer fijo (`fixed inset-y-0 left-0 z-40`) con slide-in 200ms ease-out.
- Backdrop (`bg-brand/40`) se agrega en `.gcm-sidebar-backdrop` (z-30) y se cierra al click fuera.
- En `resize` ≥ 768px, la sidebar drawer se cierra y vuelve al estado sticky.

### Reglas

- **Máximo 3 secciones** por rol. Más = señal de scope creep.
- **Section labels en uppercase tracked** (10px) — indica grupo, no acción.
- **Active state = bg-white/15 + dot ocean** (no border, no underline — el dot es la señal).
- **`aria-current="page"`** en el link activo.
- **Brand area con border-bottom** (`border-white/10`) — separa brand de nav.
- **Foot area con user card + logout** — siempre visible, con bg `bg-white/5` para destacar sobre el navy.

---

## 9. Topbar

**Path:** `client/components/topbar.js`. CSS en `client/styles.css` (`.topbar`, `.topbar-search`).

### Anatomía

```
┌──────────────────────────────────────────────────────────────────┐
│ [☰]  Hola, Juan                          [🔔 (3)] [👤▾]         │
│      Tus tickets reportados y su estado                          │
│      [Refrescar] [+ Nuevo ticket]    [Buscar  /]                 │
└──────────────────────────────────────────────────────────────────┘
```

### Layout

- Height: `h-16` (64px).
- Background: `bg-white border-b border-surface-border`.
- Tres grupos en flex justify-between:
  - **Left**: botón mobile menu (`md:hidden`) + título/subtítulo.
  - **Center**: search bar (oculto en `sm-`).
  - **Right**: quick actions + campana + user menu.

### Title context

`topbarContext(user)` devuelve `{ title, subtitle }` según la ruta:

| Ruta | Title | Subtitle |
|---|---|---|
| `/dashboard` | `Hola, {firstName}` | dinámico por rol |
| `/tickets` | `Tickets` | `Listado y filtros` |
| `/tickets/new` | `Nuevo ticket` | `Reportar incidencia` |
| `/tickets/:id` | `Detalle de ticket` | `Historial y evidencias` |
| `/users` | `Usuarios` | `Gestión de cuentas y roles` |
| `/categories` | `Categorías` | `Catálogo de incidencias` |
| `/notifications` | `Notificaciones` | `Bandeja de entrada` |
| `/reports` | `Reportes` | `Exportes a Excel y PDF` |

### Quick actions

`quickActions(user)` devuelve botones según ruta + rol:

- `+ Nuevo ticket` (accent) en dashboard o lista de tickets si `canCreateTicket(user)`.
- `Refrescar` (ghost) en dashboard o lista de tickets.
- `Exportar` (secondary) en `/reports`.

### Search bar (atajo `/`)

```js
// Hook global (idempotente vía window.__gcmSearchHooked)
document.addEventListener('keydown', (e) => {
  const t = e.target;
  const isTyping = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  if (!isTyping && e.key === '/') { e.preventDefault(); input.focus(); }
  else if (isTyping && t === input && e.key === 'Enter') {
    const q = input.value.trim();
    if (q) go(`/tickets?q=${encodeURIComponent(q)}`);
  } else if (e.key === 'Escape' && t === input) {
    input.value = ''; input.blur();
  }
});
```

### Campana (notificaciones)

```html
<button class="btn-icon relative" aria-label="Notificaciones">
  <svg>...</svg>
  <span class="absolute top-1 right-1 bg-accent text-white text-[10px] rounded-full px-1 min-w-[16px] h-4 ...">
    3
  </span>
</button>
```

El counter badge se re-renderiza ante cada cambio de `state.unreadCount` vía `subscribe()`.

### User menu

- Trigger: avatar + nombre + chevron.
- Dropdown: Mi inicio, Notificaciones, divider, Cerrar sesión (rojo `text-accent`).
- Click fuera cierra. `Esc` cierra. `aria-haspopup="menu"`, `aria-expanded` actualizado.

### Reglas

- **Sticky en scroll.** `position: sticky; top: 0;` con `z-30` (debajo de modal/toast).
- **Título truncado** con `truncate` en long names.
- **Subtítulo en `text-slate-500`** — información secundaria, no compite con el título.

---

## 10. Modal

**Path:** `client/components/modal.js`. `openModal()`, `confirmModal()`.

### Anatomía

```html
<div class="fixed inset-0 z-40 flex items-center justify-center p-4">
  <div class="absolute inset-0 bg-slate-900/50"></div>
  <div class="relative bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
    <div class="flex items-center justify-between px-5 py-3 border-b border-slate-200">
      <h3 class="text-base font-semibold text-slate-800">{title}</h3>
      <button aria-label="Cerrar" class="...">×</button>
    </div>
    <div class="p-5 overflow-y-auto">{body}</div>
    <div class="flex justify-end gap-2 px-5 py-3 border-t border-slate-200 bg-slate-50 rounded-b-lg">
      {actions}
    </div>
  </div>
</div>
```

### Tamaños

| Size | max-width |
|---|---|
| `sm` | `max-w-sm` (24rem) |
| `md` (default) | `max-w-lg` (32rem) |
| `lg` | `max-w-2xl` (42rem) |
| `xl` | `max-w-4xl` (56rem) |

### Comportamiento

- Mount en `#modal-root` (ver `index.html`).
- Click en backdrop cierra.
- `Esc` cierra.
- `cleanup()` quita el nodo y desregistra el keydown listener.
- `onClose` callback opcional — se llama antes del cleanup.

### `confirmModal()`

```js
confirmModal({
  title: 'Cerrar ticket',
  message: '¿Confirmas que quieres cerrar TCK-0042?',
  confirmText: 'Cerrar',
  cancelText: 'Cancelar',
  danger: true,           // → btn-accent
  onConfirm: async () => { ... },
});
```

- `danger: true` → `btn-accent` (rojo camarón) para el botón de confirmación.
- `danger: false` (default) → `btn-primary` (navy).
- Cancel siempre es `btn-secondary`.

### Reglas

- **Title en imperativo.** "Cerrar ticket", no "¿Cerrar ticket?".
- **Body en una línea si es posible.** Dos como mucho.
- **Max-height 90vh con scroll interno.** Si el contenido no entra, scroll. Pero el modal debe ser la excepción, no la regla — si necesitás scroll, considera una página.
- **`textContent` para title.** Nunca `html: title` (XSS).
- **Backdrop sin animación.** Aparece y desaparece instantáneo. Linear/Vercel hacen lo mismo.

### Mejoras pendientes

- **Trampa de foco** dentro del modal (Tab cyclea, no sale).
- **Restaurar foco** al elemento que abrió el modal al cerrar.
- **`role="dialog" aria-modal="true" aria-labelledby={titleId}`** (semántica explícita).

---

## 11. Toast

**Path:** `client/utils/toast.js`. Función `toast(message, type, timeout)`.

### Anatomía

```html
<div class="toast pointer-events-auto flex items-center gap-2 px-4 py-2.5 rounded-md shadow-lg text-sm bg-{color} text-white"
     role="status" aria-live="polite" aria-atomic="true">
  <span class="font-bold">{icon}</span>
  <span class="flex-1">{message}</span>
  <button aria-label="Cerrar notificación" class="...">×</button>
</div>
```

### Tipos

| Type | Icon | Background |
|---|---|---|
| `success` | ✓ | `bg-emerald-600` |
| `error` | ✕ | `bg-red-600` |
| `info` (default) | i | `bg-brand` |
| `warn` | ! | `bg-amber-500` |

### Comportamiento

- Mount en `#toast-root` (top-right, fixed, `z-50`).
- Auto-remove después de `timeout` (default 4000ms).
- Click en × remueve inmediatamente.
- Leave animation: `opacity-0 translate-y-[-4px]` 200ms.

### Reglas

- **Mensaje en pasado para éxito.** "Ticket creado", "Asignación actualizada".
- **Mensaje específico para error.** "Error al subir foto.jpg: archivo demasiado grande", no "Error".
- **Max 1 línea ideal.** Si necesitás más, es un error que merece atención más detallada.
- **No más de 3 toasts simultáneos.** Si la app está escupiendo toasts, hay un bug.
- **Errores recuperables no van como toast** — van inline con un "Reintentar".

---

## 12. Empty State

**Path:** `client/components/empty-state.js`. `emptyState({ icon, title, message, action })` + 7 presets en `EMPTY_STATES`.

### Anatomía

```html
<div class="flex flex-col items-center justify-center py-12 px-6 text-center">
  <div class="flex items-center justify-center w-16 h-16 mx-auto mb-4 rounded-full bg-surface text-brand-ocean">
    <svg class="w-10 h-10">...</svg>
  </div>
  <h3 class="text-base font-semibold text-brand-ink mb-1">{title}</h3>
  <p class="text-sm text-slate-500 max-w-md mx-auto mb-4">{message}</p>
  {action && <button class="btn btn-primary btn-sm">{action.label}</button>}
</div>
```

### Presets

| Key | Icon | Title | Message |
|---|---|---|---|
| `tickets` | ticket | Sin tickets | No hay tickets que coincidan con los filtros seleccionados. Ajusta los filtros o crea uno nuevo. |
| `notifications` | bell | Bandeja vacía | No tienes notificaciones en este momento. Te avisaremos cuando haya actividad en tus tickets. |
| `users` | users | Sin usuarios | Aún no se han creado cuentas en el sistema. |
| `categories` | tag | Sin categorías | Crea categorías para clasificar los tickets (red, infraestructura, mantenimiento, etc.). |
| `reports` | chart | Sin datos | No hay reportes para los filtros seleccionados. Prueba a ampliar el rango de fechas. |
| `dashboard` | chart | Sin datos | No hay datos para mostrar en este panel todavía. |
| `search` | search | Sin resultados | No se encontraron coincidencias para tu búsqueda. |

### Reglas

- **Subtítulo ofrece salida.** Siempre que se pueda, terminamos con "Ajusta los filtros" / "Crea uno nuevo" / "Prueba a ampliar el rango".
- **Icono dentro de círculo `bg-surface` (no bg-white)**, en color `brand-ocean`. Es la única excepción donde ocean se usa como fill decorativo — y no es decorativo, es señal de "contenedor inactivo".
- **Max width del párrafo: `max-w-md mx-auto`.** Para que en pantallas grandes el texto no se estire.

---

## 13. Ticket Card

**Path:** `client/components/ticket-card.js`. Función `ticketCard(t)`.

### Anatomía

```html
<button class="w-full text-left bg-white border border-surface-border rounded-lg p-3
              hover:border-brand-ocean hover:shadow-card
              focus:outline-none focus:ring-2 focus:ring-brand-ocean/30 transition">
  <div class="flex items-center justify-between gap-2 mb-1">
    <span class="text-xs font-mono text-slate-500">TCK-0042</span>
    <span class="prio-alta">Alta</span>
  </div>
  <div class="font-medium text-brand-ink line-clamp-2">Bomba de achique no enciende</div>
  <div class="flex items-center gap-2 mt-2 text-xs flex-wrap">
    <span class="badge-en_proceso">En proceso</span>
    <span class="text-slate-500">· hace 3 h</span>
  </div>
  <div class="text-xs text-slate-500 mt-1.5 flex items-center gap-1">
    <svg class="w-3 h-3">...</svg>
    <span class="truncate">Asignado a: Juan Pérez</span>
  </div>
</button>
```

### Reglas

- **Toda la card es un `<button>`.** Click anywhere navega al detalle.
- **`aria-label`** describe la acción: "Abrir ticket TCK-0042: Bomba de achique no enciende".
- **Hover: border ocean + shadow lift.** Sutil, no rebote.
- **`line-clamp-2`** en el título para que tarjetas con título largo no rompan la grilla.
- **No badges duplicados innecesarios.** Status + priority sí. Categoría y área no (info redundante en listas filtradas).

### Variantes

- **Default**: como arriba.
- **Compacta** (futuro): sin la línea de "Asignado a", para grids más densos (6+ columnas).

---

## 14. Chat Bubble

**Path:** `client/components/chat.js`. Función interna `eventNode` + render de bubbles.

### Anatomía (burbuja "mía")

```html
<div class="flex items-start gap-2 flex-row-reverse">
  <span class="avatar" style="background-color: #16ACE4">JP</span>
  <div class="flex flex-col gap-1 max-w-[80%] items-end">
    <div class="flex items-center gap-2 text-xs text-slate-500 flex-row-reverse">
      <span class="font-medium text-slate-700">Juan Pérez</span>
      <span class="px-1.5 py-0.5 bg-slate-100 rounded text-[10px] text-slate-600">SAC</span>
      <span title="22 jun 2026 · 14:32">hace 5 min</span>
    </div>
    <div class="chat-bubble chat-bubble-me">Texto del comentario</div>
  </div>
</div>
```

### Tokens

- `.chat-bubble`: `max-w-[80%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed shadow-soft`.
- `.chat-bubble-me`: `bg-brand text-white rounded-br-sm` (cola de 4px abajo a la derecha).
- `.chat-bubble-other`: `bg-white text-brand-ink border border-surface-border rounded-bl-sm` (cola abajo a la izquierda).

### Reglas

- **Max width 80%** del container — para que el mensaje largo no se estire a full width.
- **Cola en la esquina inferior** del lado del avatar — visualmente "viene de" el avatar.
- **Metadata arriba del bubble** (autor, rol, timestamp) en `text-xs text-slate-500`. El timestamp tiene `title` con formato absoluto.
- **No color semántico en bubbles.** El azul navy es "yo", el blanco es "otros". La distinción de quién habla no requiere urgencia.

---

## 15. Chat Event

**Path:** `client/components/chat.js`. Función interna `eventNode({ icon, text, when })`.

### Anatomía

```html
<div class="chat-event">
  <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-white border border-surface-border rounded-full text-xs text-slate-600 shadow-soft">
    <svg class="w-3.5 h-3.5">...</svg>
    <span>Juan Pérez creó el ticket · <span class="text-slate-400">hace 3 h</span></span>
  </span>
</div>
```

### CSS

```css
.chat-event {
  @apply text-center text-xs text-slate-500 my-2 flex items-center gap-3;
}
.chat-event::before, .chat-event::after {
  content: ''; @apply flex-1 border-t border-surface-border;
}
```

Las líneas `::before` y `::after` se extienden a los costados vía `flex-1` + `border-t`. El pill blanco queda centrado entre las dos líneas.

### Tipos de evento

| Tipo | Icon | Texto |
|---|---|---|
| `created` | `+` (plus) | "{who} creó el ticket" |
| `assigned` | `user` | "Asignado a {to} (por {by})" |
| `reassign` | `arrows` | "Reasignado de {from} → {to} (por {by})" |
| `commented` | (burbuja) | (render como bubble, no como event) |
| `attachment` | `paperclip` | (render con `attachmentThumb` inline) |

### Reglas

- **Una línea por evento.** Sin line-clamp.
- **No color semántico.** Eventos son históricos, no requieren atención inmediata.
- **Centrado.** Es metadata, no contenido.

---

## 16. Chat Composer

**Path:** `client/components/chat-composer.js`. Función `chatComposer({ ticketId, onSent, disabled })`.

### Anatomía

```html
<div class="relative border border-slate-200 rounded-lg bg-white" data-composer>
  <!-- Preview zone (oculta hasta que hay archivos) -->
  <div class="hidden px-3 py-2 border-b border-slate-200 bg-slate-50 flex flex-wrap gap-2 text-xs">
    <span class="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-white border border-slate-200">
      <svg class="w-3.5 h-3.5 text-slate-500">...</svg>
      <span class="font-medium text-slate-700 max-w-[160px] truncate">foto.jpg</span>
      <span class="text-slate-500">· 2.4 MB</span>
      <button class="text-slate-400 hover:text-accent ...">×</button>
    </span>
    ...
  </div>

  <textarea class="w-full resize-none px-3 py-2 rounded-md focus:outline-none text-sm bg-transparent"
            rows="2" maxlength="4000"
            placeholder="Escribe un mensaje… (Enter para enviar, Shift+Enter para nueva línea)"
            aria-label="Mensaje"></textarea>

  <div class="flex items-center justify-between px-2 py-1 border-t border-slate-100 bg-slate-50 rounded-b-lg">
    <div class="flex items-center gap-1">
      <button class="btn btn-ghost btn-sm" aria-label="Adjuntar archivo">
        <svg>...</svg>
        <span class="hidden sm:inline">Adjuntar</span>
      </button>
      <span class="text-[10px] text-slate-400 px-1">0/4000</span>
    </div>
    <button class="btn btn-primary btn-sm gap-1">
      <svg>...</svg>
      <span>Enviar</span>
    </button>
  </div>
</div>
```

### Comportamiento

- **Enter envía**, **Shift+Enter nueva línea**.
- **Counter en vivo** abajo: `0/4000`.
- **Drag & drop** sobre el composer: `dragenter`/`dragover` muestran ring ocean; `drop` agrega los archivos.
- **Botón "Adjuntar"** abre file picker (`<input type="file" multiple>`).
- **Send btn**:
  - Disabled mientras `sending` o si el textarea está vacío y no hay archivos.
  - Spinner + "Enviando…" durante el request.
- **onSent({ type, data })** se llama por cada mensaje/archivo subido exitosamente. El padre (`ticket-detail.js`) hace `reload()` para traer el estado fresco del backend.
- **`disabled`** prop desactiva todo (ticket cerrado, sin permisos). Mostrar copy alternativo ("El ticket está cerrado") en lugar del composer.

### Reglas

- **Counter visible.** El usuario sabe cuántos caracteres le quedan.
- **No enviar vacío.** Si no hay texto ni archivos, no se hace nada.
- **Errores de upload** van como toast por archivo: "Error al subir foto.jpg: archivo demasiado grande". No se pierde el queue entero si uno falla.
- **Drag affordance** debe ser descubrible. El border ocean al hacer drag es la única señal visual — considerá un icono sutil de "drop here" en estado idle (futuro).

---

## 17. Attachment Thumb

**Path:** `client/components/attachments.js`. Función `attachmentThumb(att, ticketId)`.

### Variantes

#### Imagen (`isImage(mime)`)

```html
<a class="group block relative overflow-hidden rounded-md border border-slate-200 bg-slate-50"
   href="/api/tickets/{id}/attachments/{attId}" target="_blank" rel="noopener">
  <img class="w-32 h-32 object-cover group-hover:opacity-90 group-hover:scale-105 transition"
       src="..." alt="..." loading="lazy" width="128" height="128" />
</a>
```

- 128×128, `object-cover`.
- Hover: `opacity-90 + scale-105` (sutil, 150ms).
- `loading="lazy"` para no bloquear el fold.

#### Archivo (no imagen)

```html
<a class="flex items-center gap-2.5 px-3 py-2 rounded-md border border-slate-200 bg-white
          hover:bg-slate-50 hover:border-surface-border max-w-xs transition">
  <span class="flex-none text-{color}">
    <svg class="w-5 h-5">...</svg>
  </span>
  <div class="min-w-0">
    <div class="text-sm font-medium text-slate-800 truncate">{original_name}</div>
    <div class="text-xs text-slate-500">{extension} · {size}</div>
  </div>
</a>
```

### Iconos por tipo de archivo

| Tipo | Icon color | Glyph |
|---|---|---|
| `image/*` | `text-brand-ocean` | image |
| `application/pdf` | `text-accent` | pdf |
| `word/*` | `text-brand-ocean` | doc |
| `sheet/excel` | `text-emerald-600` | sheet |
| `zip` | `text-slate-500` | zip |
| otros | `text-slate-500` | file |

### Reglas

- **`target="_blank" rel="noopener"`** siempre — los archivos se abren en tab nueva.
- **`aria-label`** describe la acción: "Ver foto.jpg" o "Descargar reporte.pdf".
- **Download directo** (no preview) para no-imagen. La preview inline en el chat es el thumbnail; el click baja el archivo.
- **No infinite previews.** Si el archivo es pesado, el icono + nombre es suficiente.

---

## 18. Notification Card

**Path:** `client/views/notifications.js`. Función interna (no extraída todavía).

### Anatomía

```html
<button class="text-left card flex items-start gap-3 transition hover:border-brand-ocean">
  <div class="flex flex-col items-center gap-1 w-20 flex-none">
    <span class="badge bg-blue-100 text-blue-800 inline-flex items-center">
      <svg class="w-3 h-3 mr-1">...</svg>
      Ticket creado
    </span>
    <div class="text-[10px] text-slate-400" title="22 jun 2026 · 14:32">hace 5 min</div>
    {!read && <span class="dot bg-accent" title="No leída" aria-label="No leída"></span>}
  </div>

  <div class="flex-1 min-w-0">
    <div class="font-semibold text-brand-ink truncate">{title}</div>
    {body && <div class="text-sm text-slate-600 line-clamp-2 mt-0.5">{body}</div>}
    <div class="flex items-center gap-2 mt-2 text-xs">
      <span class="text-slate-500">Ticket #42</span>
      {!read && <span class="text-accent font-medium">No leída</span>}
    </div>
  </div>

  {ticket_id && <span class="text-xs text-brand font-medium flex-none">Abrir →</span>}
</button>
```

### Estados

| Estado | Estilo |
|---|---|
| Leída | `opacity-60` sobre todo el card. Sin ring, sin bg-accent. |
| No leída | `bg-accent/5` + `ring-1 ring-accent/20` (señal visual funcional). |
| Hover | `border-brand-ocean`. |
| Focus | ring 2px `brand-ocean/30`. |

### Reglas

- **The Functional Stripe Alternative:** no usamos side-stripe (prohibido en DESIGN.md). En su lugar: bg tint + ring.
- **El dot de "no leída"** es un `dot bg-accent` de 6×6 — la única señal cromática "esto requiere atención".
- **Click marca como leída** y navega al ticket si tiene `ticket_id`.

---

## 19. Back Button

**Path:** `client/components/back-button.js`. Función `backButton({ href, label, icon, className, minHeight })`.

### Anatomía

```html
<button class="flex items-center gap-1 text-sm font-medium text-brand-ink
              hover:text-brand inline-flex min-h-[44px] -ml-1 px-1 rounded">
  <svg class="w-4 h-4">...</svg>
  Volver
</button>
```

### Props

| Prop | Default | Uso |
|---|---|---|
| `href` | `/tickets` | Destino del `go()`. |
| `label` | `Volver` | Texto del botón. |
| `icon` | `ICON.back` (flecha izquierda) | SVG path. |
| `className` | `text-brand-ink hover:text-brand` | Override de color. |
| `minHeight` | `min-h-[44px]` | Touch target. |

### Reglas

- **44px min-height.** Touch target WCAG.
- **`-ml-1`** para alinear con el texto del título que está al lado (sin "saltar" visualmente).
- **Label por defecto es "Volver"**, no "Atrás". "Atrás" sugiere historial del browser; "Volver" sugiere la pantalla de la que viniste.
- **No es un link**, es un botón con handler que llama `go()`. Mantiene la convención del router hash-based.

---

## 20. Export Button

**Path:** `client/components/export-button.js`. Función `exportButton({ label, format, kind, onclick })`.

### Variantes

| Format | Sufijo label |
|---|---|
| `pdf` (default) | ` PDF` |
| `excel` | ` Excel` |
| `csv` | ` CSV` |

| Kind | Estilo |
|---|---|
| `primary` | `btn-primary` |
| `secondary` (default) | `btn-secondary` |
| `ghost` | `btn-ghost` |

### Anatomía

```html
<button class="btn btn-secondary gap-1.5" aria-label="Exportar PDF" title="Exportar PDF">
  <svg class="w-4 h-4">...</svg>
  <span class="hidden sm:inline">Exportar PDF</span>
</button>
```

### Reglas

- **Label oculto en `sm-`** (sólo icono). Tooltip via `title` y `aria-label`.
- **El `onclick` se provee desde el caller** (la vista tiene su propio `doExport` con su propio loading state).
- **No "Download"** como label — "Exportar" es el término del dominio.

---

## 21. Tabla

**Path:** clases `.table-wrap`, `.table`, `table thead th`, `table tbody td`, `table tbody tr:hover` en `client/styles.css`.

### Anatomía

```html
<div class="table-wrap">
  <table class="table" aria-busy="false">
    <thead>
      <tr>
        <th scope="col">Código</th>
        <th scope="col">Título</th>
        ...
      </tr>
    </thead>
    <tbody>
      <tr class="cursor-pointer" data-id="42">
        <td class="font-mono text-xs text-slate-500">TCK-0042</td>
        <td>
          <div class="font-medium text-slate-800">Bomba de achique no enciende</div>
          <div class="text-xs text-slate-500 line-clamp-1">Detalle de la descripción...</div>
        </td>
        ...
      </tr>
    </tbody>
  </table>
</div>
```

### Tokens

- `.table-wrap`: `w-full overflow-x-auto rounded-xl border border-surface-border bg-white shadow-card`.
- `.table`: `min-w-full text-sm`.
- `.table thead th`: `text-left text-xs font-semibold uppercase tracking-wide text-slate-500 bg-surface px-4 py-3 border-b border-surface-border`.
- `.table tbody td`: `px-4 py-3 border-b border-slate-200 align-top`.
- `.table tbody tr:hover`: `bg-surface/60`.
- `.table tbody tr:last-child td`: `border-b-0`.

### Reglas

- **No zebra.** Solo hover state (más calmado, más profesional).
- **`<th scope="col">`** en todos los headers — accesibilidad.
- **`aria-busy="true"`** mientras carga el skeleton; `false` cuando pintan las filas reales.
- **Click en fila** = acción (navegar al detalle, abrir edit modal). Toda la fila es interactiva, no sólo la primera celda.
- **Paginación** abajo: "Mostrando X de Y" + "← Anterior / Siguiente →".
- **No tablas con > 8 columnas** sin un sub-set colapsable. Si necesitás 10 columnas, no es una tabla — es un dashboard.

---

## 22. Charts

### 22.1 Chart de barras (30 días)

**Path:** `chartBars(data)` en `client/views/dashboard.js`. Futura extracción a `client/components/chart-bars.js`.

```html
<div class="flex items-end gap-1 h-32" role="img" aria-label="Gráfica de barras de tickets creados en los últimos 30 días">
  <div class="flex-1 flex flex-col items-center justify-end group" title="22 jun: 5">
    <div class="text-[10px] font-medium text-slate-600 mb-0.5">5</div>
    <div class="w-full bg-brand-ocean rounded-t transition-all group-hover:bg-brand-deep" style="height: 60%; min-height: 2px; opacity: 0.85"></div>
    <div class="text-[10px] text-slate-500 mt-1">22 jun</div>
  </div>
  ...
</div>
```

### Tokens

- Container: `flex items-end gap-1 h-32`.
- Bar: `w-full bg-brand-ocean rounded-t`. **No `bg-accent` para urgente** — la barra es monocromática. La prioridad se distingue por la fila que la precede, no por el color de la barra.
- Hover: `group-hover:bg-brand-deep`.
- Empty state: si todos los valores son 0, mostrar `<emptyState>` en lugar de barras a 2px (que parece bug).
- Intensidad visual: opacity de 0.35 a 1.0 según valor relativo al máximo. El día "pico" se ve al 100%.

### Reglas

- **`role="img"` + `aria-label`** describiendo qué se está viendo.
- **Tooltip via `title`** con formato "DD MMM: N". Accesible sin librería.
- **Labels en eje X**: día y mes, formato corto. No timestamps ISO.
- **Una sola unidad de medida** por chart. Si mezclás tickets y tiempo, son dos charts.

### 22.2 Progress bar (por prioridad / estado)

**Path:** `progressBar(value, max, color)` en `client/views/dashboard.js`.

```html
<div class="w-full h-2 bg-slate-100 rounded overflow-hidden">
  <div class="h-2 rounded transition-all bg-brand-ocean" style="width: 60%"></div>
</div>
```

### Reglas

- **Una sola barra monocromática.** `bg-brand-ocean`. Sin variantes de color por prioridad.
- **Width animado** con `transition-all` para que cuando cambian los datos, la barra se desliza (no salta).
- **Label + valor** arriba de la barra. Sin tooltips.

### 22.3 Charts de reportes (barChart por estado/prioridad)

Similar al progress bar pero en formato horizontal con label y valor. `h-2` de alto, `bg-slate-100` track, `bg-brand-ocean` fill.

---

## 23. Skeleton

**Path:** inline en cada view (no extraído todavía). Clases: `bg-slate-200 rounded animate-pulse`.

### Patrones por bloque

#### KPI skeleton

```html
<div class="card flex flex-col gap-2">
  <div class="h-3 w-1/3 bg-slate-200 rounded animate-pulse"></div>
  <div class="h-7 w-1/2 bg-slate-200 rounded animate-pulse"></div>
</div>
```

Label ocupa 1/3 del ancho, value 1/2. Mismas dimensiones que el KPI real → no reflow cuando llega el dato.

#### Row skeleton (tabla)

```html
<tr aria-hidden="true">
  <td class="py-3">
    <div class="h-3 bg-slate-200 rounded animate-pulse w-3/4"></div>
  </td>
  ... (8 columnas)
</tr>
```

5 rows por default en la lista de tickets.

#### Spinner inline

```html
<div class="card flex items-center justify-center gap-2 py-10 text-sm text-slate-600"
     role="status" aria-live="polite">
  <svg class="animate-spin w-4 h-4 text-brand-ocean" .../>
  <span>Cargando notificaciones…</span>
</div>
```

### Reglas

- **Mismas dimensiones que el contenido real.** Esto es lo que evita el reflow.
- **`aria-busy="true"`** en el contenedor de tabla mientras hay skeleton.
- **`aria-hidden="true"`** en las rows de skeleton (no las lea el screen reader).
- **Spinner con copy.** "Cargando X" no sólo el spinner. El usuario necesita saber qué está pasando.
- **`prefers-reduced-motion: reduce`** colapsa el `animate-pulse` (ya implementado globalmente en `styles.css`).

---

## 24. Layout Shell

**Path:** `client/components/layout.js`. Función `renderLayout({ content, user, onLogout })`.

### Anatomía

```
<div class="flex h-full bg-surface">
  <div class="gcm-sidebar">
    <aside class="sidebar">...</aside>
  </div>
  <div class="flex-1 flex flex-col min-w-0">
    <header class="topbar">...</header>
    <main class="flex-1 overflow-y-auto">
      <div class="max-w-7xl mx-auto w-full p-4 md:p-6">
        {content}
      </div>
    </main>
  </div>
</div>
```

### Tokens

- Outer: `flex h-full bg-surface`.
- Sidebar container: `gcm-sidebar` (md:flex md:flex-none md:sticky md:top-0 md:h-screen; <md: drawer con .gcm-sidebar-open).
- Main column: `flex-1 flex flex-col min-w-0` (min-w-0 crítico para que el contenido flex no rompa el width).
- Page container: `max-w-7xl mx-auto w-full p-4 md:p-6`.

### Lifecycle

- `renderLayout` se llama cada vez que cambia la ruta (vía `dispatch()` en `main.js`).
- Retorna un wrapper con `_gcmLayoutCleanup()` para desregistrar listeners (`hashchange`, `resize`, `gcm:toggle-sidebar`).
- El wrapper se monta en `#app`. El cleanup de la vista anterior se ejecuta antes (`app.firstElementChild._gcmCleanup()`).

### Sidebar mobile

- **Botón ☰** en topbar dispara `window.dispatchEvent(new CustomEvent('gcm:toggle-sidebar'))`.
- El layout escucha el evento y togglea `body.gcm-sidebar-open`.
- **Backdrop** (`bg-brand/40 z-30`) se crea dinámicamente al abrir, se remueve al cerrar.
- **Click en backdrop** cierra.
- **`hashchange`** cierra (porque cambiar de ruta con sidebar abierta es un footgun de navegación).
- **`resize` ≥ 768px** cierra (porque vuelve al modo sticky).

### Reglas

- **`min-w-0`** en el main column — sin esto, el contenido con `text-2xl` o `whitespace-nowrap` rompe el flex y genera scroll horizontal.
- **`max-w-7xl mx-auto`** — no llenar toda la pantalla. El ojo pierde el hilo.
- **Page padding `p-4 md:p-6`** — más aire en desktop, edge-to-edge en mobile.
- **Sin animación al cambiar de ruta.** El nuevo contenido reemplaza al viejo.

---

## Convenciones generales

### Exports

- **Componente público**: `export function Nombre({ ...props })` desde su archivo.
- **Helper público**: `export function helperName(...)` o `export const helperName = (...)`.
- **Internal**: `function helperLocal()` sin export.
- **Default export**: desaconsejado. Nombrado es más explícito y permite tree-shaking.

### Naming

- **Archivos**: `kebab-case.js`.
- **Funciones exportadas**: `camelCase`.
- **CSS classes**: `kebab-case` (Tailwind + custom).
- **DOM tags**: lowercase.
- **Constantes (enums, mapas)**: `UPPER_SNAKE_CASE` (ej. `STATUS_LABEL`).
- **Props**: `camelCase` (ej. `onClick`, `className`).

### Tipos (en JSDoc, no TypeScript)

El codebase no usa TypeScript, pero los comentarios JSDoc en funciones públicas documentan props:

```js
/**
 * Renderiza el header del topbar.
 * @param {Object} props
 * @param {User} props.user
 * @param {() => void} props.onLogout
 * @returns {HTMLElement}
 */
export function renderTopbar({ user, onLogout }) { ... }
```

### Performance

- **Re-mount selectivo.** Una vista que cambia de estado no debe re-pintar el shell.
- **Listeners con cleanup.** Todo `addEventListener` tiene su contraparte en un `_gcmCleanup` o `AbortController`.
- **Throttle para eventos realtime** (ver UX_GUIDELINES §5.2).
- **No librerías de animación pesadas.** Solo CSS transitions nativas.

### Testing (estado actual)

- Sin tests unitarios de componentes hoy.
- **Recomendación:** testear componentes puros (los que toman props y devuelven DOM) con happy-dom + Vitest. Los que tienen side-effects (modal, toast, realtime) son más difíciles — mejor testear los handlers, no el DOM.
- **Test E2E sugerido**: Playwright cubriendo los 4 flujos de rol (login → crear ticket → asignar → trabajar → cerrar).

---

## Próximos componentes a extraer

El codebase tiene componentes inline en las views que se beneficiarían de ser extraídos:

| Componente | Hoy vive en | Por qué extraerlo |
|---|---|---|
| `KpiCard` | `dashboard.js`, `reports.js` | Reutilizado. Helper local duplicado. |
| `ChartBars` | `dashboard.js` | Reutilizable en `/reports`. |
| `FilterBar` | `tickets-list.js`, `reports.js` | Casi idéntico en ambos. |
| `Tabs` | `notifications.js` | Patrón de tab bar (Todas / No leídas) usado sólo una vez hoy, pero probable que crezca. |
| `Pagination` | `tickets-list.js` | Si se agrega a `/reports` y `/users`. |
| `ToastProvider` | `utils/toast.js` | Ya extraído, pero sin tests. |

**Regla de extracción:** si un patrón se repite en 2+ archivos O si un archivo view pasa de 200 líneas, extraer.