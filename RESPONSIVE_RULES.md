<!-- Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. -->

# Responsive Rules — GCM Tickets

> Cómo se adapta el producto entre mobile, tablet y desktop. Breakpoints, transformaciones, qué cambia y qué no. Inspirado en la disciplina mobile-first de Linear y la consistencia cross-device de Stripe.
>
> **Filosofía:** la app es desktop-first en la realidad operativa (8+ horas en escritorio), pero **debe funcionar impecablemente en mobile y tablet** porque los supervisores de campo reportan desde ahí. El responsive no es bonus — es core.

**Convención del codebase:** Tailwind CSS 3.4 con breakpoints estándar.

| Breakpoint | Min-width | Tailwind | Uso |
|---|---|---|---|
| (base) | 0px | (sin prefijo) | Mobile vertical. |
| `sm` | 640px | `sm:` | Phablet, mobile horizontal, tablets pequeñas. |
| `md` | 768px | `md:` | **Breakpoint de layout principal.** Sidebar se vuelve sticky. |
| `lg` | 1024px | `lg:` | Layout de 2 columnas en dashboard, gráficos side-by-side. |
| `xl` | 1280px | `xl:` | Charts con más espacio. |
| `2xl` | 1536px | `2xl:` | (No usado activamente). |

---

## Principios

1. **Mobile-first pero desktop-dominant.** El layout por defecto es mobile; los refinamientos se agregan con prefijos `md:` y `lg:`. Pero el caso de uso primario (8h/día) es desktop, así que optimizamos para ahí sin descuidar mobile.
2. **Sidebar se transforma, no se encoge.** En mobile, la sidebar es un drawer. En desktop, es un aside fijo. No es un "shrink to hamburger" — es un cambio de paradigma.
3. **Touch targets ≥ 44px en mobile, ≥ 36px en desktop.** Regla WCAG 2.5.5. Implementada con clases `min-h-[44px]` y `min-w-[44px]` en icon buttons.
4. **Contenido prioritario primero.** En mobile, el orden de la página es: header → triage → primary list → supporting → activity. En desktop, mismo orden pero con más grid columns.
5. **Densidad varía con viewport.** Más densidad en desktop (filas con `py-3`), menos en mobile (`py-4` o `py-3.5`).
6. **Sin horizontal scroll salvo en tablas.** Cualquier otra cosa que se salga del viewport es un bug.

---

## 1. Layout shell responsive

### 1.1 Sidebar

**Mobile (< md):**
- `display: none` por default (`body:not(.gcm-sidebar-open) .gcm-sidebar { display: none; }`).
- Al click en el botón ☰ del topbar: `body.gcm-sidebar-open` → la sidebar se muestra como **drawer fijo** (`fixed inset-y-0 left-0 z-40`) con slide-in 200ms ease-out.
- **Backdrop** (`bg-brand/40 z-30`) se crea dinámicamente al abrir. Click en backdrop cierra.
- Ancho: `w-64` (256px) — mismo que en desktop, porque es legible y porque el usuario espera ver las labels completas.
- `Esc` cierra (no implementado, **mejora pendiente**).

**Desktop (≥ md):**
- `display: flex` sticky en el viewport: `md:flex md:flex-none md:sticky md:top-0 md:h-screen`.
- Ancho fijo: `w-64`.
- `shadow-sidebar` (4px 0 24px -8px rgba(7,29,76,0.18)) — única sombra direccional del sistema, ancla la sidebar a la página.
- En `resize` ≥ 768px, si el drawer mobile estaba abierto, se cierra automáticamente.

### 1.2 Topbar

**Mobile (< sm):**
- Botón ☰ visible (mobile menu trigger).
- Título del topbar se trunca con `truncate`. Subtítulo también.
- Search bar **oculto** (`hidden md:block`).
- Quick actions **ocultas** (`hidden md:flex`).
- "Ayuda" **oculta** (`hidden sm:inline-flex`).
- El bell badge y el avatar quedan visibles (esenciales).
- User menu trigger **muestra sólo el avatar** (sin nombre/rol en `hidden md:block`).

**Tablet (sm - md):**
- Botón ☰ visible.
- "Ayuda" aparece.
- Search bar sigue oculto.
- Quick actions siguen ocultas.

**Desktop (≥ md):**
- Todo visible: search, quick actions, ayuda, bell, user menu con nombre y rol.
- El user menu trigger muestra avatar + nombre + rol + chevron.

### 1.3 Main content

**Universal:**
- `max-w-7xl mx-auto w-full`.
- Padding: `p-4 md:p-6` (16px mobile, 24px desktop).
- `flex-1 overflow-y-auto` para scroll vertical.

**Comportamiento clave:** `min-w-0` en la columna principal es **obligatorio**. Sin esto, el flex children con texto largo o `text-2xl` rompen el width y crean scroll horizontal.

---

## 2. Grids responsive

### 2.1 KPI grid (dashboard, supporting)

```html
<div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
```

| Viewport | Columnas | Comportamiento |
|---|---|---|
| Mobile (base) | 1 | Una KPI por fila, full width. |
| sm (640px+) | 2 | Dos columnas. |
| md (768px+) | 3 | Tres columnas. |
| lg (1024px+) | 4 | Cuatro columnas (default dashboard). |

**Por qué no 5 columnas en lg:** cinco KPIs pequeños son ilegibles. Si necesitás 5, es porque estás queriendo meter demasiada información en un solo card.

### 2.2 Cards side-by-side (charts, primary list + sidebar)

```html
<div class="grid grid-cols-1 lg:grid-cols-3 gap-3">
  <div class="lg:col-span-2">...</div>
  <div>...</div>
</div>
```

- **Mobile:** apilado vertical. El chart va arriba, el sidebar de info va abajo.
- **lg+:** dos tercios + un tercio. El primary surface ocupa más espacio; la info complementaria queda a la derecha.

### 2.3 Quick actions grid

```html
<div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
```

- **Mobile:** 2 columnas. Dos botones por fila, generosos en espacio.
- **sm+:** 4 columnas. Una fila de 4 botones.

### 2.4 Tabla → cards en mobile (patrón futuro)

**Hoy:** la tabla es la misma en todos los viewports, con `overflow-x-auto` en mobile. Scroll horizontal para verla completa.

**Recomendación futura (no implementado):** a partir de 768px, mantener tabla. Por debajo, transformar cada fila en una "card row" con label + valor. Esto evita el scroll horizontal en mobile sin perder la información.

**Por qué no se implementó:** los datos de la tabla son densos (8 columnas). La card-ificación mobile-first duplica markup. Trade-off consciente: scroll horizontal > markup duplicado en este caso. Si la usabilidad mobile de las tablas empeora con el uso, refactorizar.

---

## 3. Tipografía responsive

### 3.1 Display h1 (dashboard "Hola, Juan")

```html
<h1 class="text-[clamp(1.875rem,4vw,2.25rem)] font-bold text-brand-ink">
```

- `clamp(1.875rem, 4vw, 2.25rem)` = 30px a 36px, escalando suavemente.
- **Mobile:** 30px (1.875rem).
- **Tablet (768px):** ~31px.
- **Desktop (1024px+):** 36px (2.25rem) — tope.

**Por qué clamp y no `text-2xl md:text-3xl`:** clamp escala suavemente entre breakpoints, sin saltos visibles. `text-2xl` (24px) a `text-3xl` (30px) en md se siente como un jump.

### 3.2 Headline (títulos de página: Tickets, Detalle, Usuarios)

```html
<h1 class="text-2xl md:text-3xl font-bold text-slate-900">
```

- Mobile: 24px (`text-2xl`).
- md+: 30px (`text-3xl`).
- Salto entre breakpoints es aceptable aquí porque es un cambio de jerarquía (página vs dashboard).

### 3.3 KPI value

```html
<div class="kpi-value">42</div>
```

`text-2xl font-bold` — sin cambios responsive. 24px funciona en todos los viewports para un número grande.

### 3.4 Body y label

Sin cambios responsive. `text-sm` (14px) y `text-xs` (12px) son fijos. Probados y legibles desde 320px hasta 4K.

---

## 4. Espaciado responsive

### 4.1 Page padding

| Viewport | Padding | Clase |
|---|---|---|
| Mobile | 16px | `p-4` |
| md+ | 24px | `p-6` |

Aplicado a `max-w-7xl mx-auto w-full`.

### 4.2 Section gap

Universal: `gap-6` (24px) entre bloques del dashboard. Sin cambios responsive — la densidad es la misma en todos los viewports.

### 4.3 Card padding

Universal: `p-5` (20px) en `.card`. El `card-tight` no tiene padding default.

**Densidad aumenta en mobile de forma implícita** porque menos columnas hacen que cada card sea más estrecho vertical pero con el mismo padding interno — el ojo lee en una sola columna, lo que reduce la fricción.

### 4.4 Gap-3 entre items

Universal: `gap-3` (12px) en grids. Funciona mobile y desktop.

---

## 5. Touch targets y densidad

### 5.1 Regla WCAG 2.5.5

| Elemento | Min size | Implementación |
|---|---|---|
| Buttons (`btn`) | 36px height | `py-2` + `text-sm` → ~36px. |
| Buttons (`btn-sm`) | 28px height | `py-1` + `text-xs` → ~28px. ⚠ **debajo de 44px.** |
| Icon buttons (`btn-icon`) | 44×44 | `min-w-[44px] min-h-[44px] w-11 h-11`. |
| Icon buttons small (`btn-icon-sm`) | 36×36 | `min-w-[36px] min-h-[36px] w-9 h-9`. ⚠ **debajo de 44px.** |
| Sidebar links | 40px height | `py-2` + `text-sm` + `gap-3` → ~40px. |
| Sidebar drawer | 44px recomendado | (futuro) |
| Modal close | 44×44 | `min-w-[44px] min-h-[44px]`. |
| Toast close | 44×44 | igual. |

**Gap conocido:** `btn-sm` y `btn-icon-sm` quedan por debajo del mínimo WCAG de 44px. Esto es aceptable **en desktop** (mouse, no touch) pero problemático **en mobile**. 

**Regla práctica:** en mobile, evitar `btn-sm` y `btn-icon-sm` en flujos críticos. Usarlos sólo en:
- Filas de tabla (donde el row ya es alto).
- Avatars / decoración.
- Badges y tags (que no son interactivos).

### 5.2 Spacing entre interactivos

`gap-2` (8px) mínimo entre botones adyacentes en mobile. Por debajo de eso, el usuario clicka el equivocado en touch.

En desktop, `gap-1.5` (6px) es aceptable para button groups (ej. quick actions del topbar). En mobile, **subir a `gap-2`**.

---

## 6. Sidebar drawer en mobile

### 6.1 Animación

```css
body.gcm-sidebar-open .gcm-sidebar {
  @apply flex fixed inset-y-0 left-0 z-40 animate-[slidein_0.2s_ease-out];
}
@keyframes slidein {
  from { transform: translateX(-100%); }
  to   { transform: translateX(0); }
}
```

- **200ms ease-out.** Suficiente para que se note el movimiento, no tanto que se sienta lento.
- **`prefers-reduced-motion: reduce`** colapsa a 0.01ms (ya implementado en `styles.css`).

### 6.2 Backdrop

```js
backdropEl = document.createElement('div');
backdropEl.className = 'fixed inset-0 bg-brand/40 z-30 md:hidden gcm-sidebar-backdrop';
backdropEl.addEventListener('click', closeMobileSidebar);
```

- `bg-brand/40` (navy 40% alpha) — el tinte más oscuro disponible, comunica "fuera de foco".
- `z-30` para que esté por debajo del drawer (z-40) pero por encima del contenido.
- `md:hidden` — el backdrop sólo existe en mobile; en desktop no se necesita.
- Click cierra.

### 6.3 Behavior

- **Click en link del drawer:** navega, drawer NO se cierra automáticamente. **Pendiente** — debería cerrarse para evitar el bug "navego pero el drawer sigue abierto encima del nuevo contenido".
- **Click en backdrop:** cierra.
- **`Esc`:** no implementado. **Pendiente.**
- **Hashchange (cambio de ruta):** cierra. (Esto evita el bug mencionado arriba **parcialmente**, pero el primer problema sigue vigente.)
- **Resize ≥ 768px:** cierra. (Vuelve al modo sticky.)

### 6.4 Patrón "drawer con contenido nuevo"

Hoy: al navegar, el drawer se cierra por el hashchange listener. Funciona, pero con un frame de delay visible. Mejora futura: cerrar el drawer optimistamente al hacer click en un link, antes de que la navegación ocurra.

---

## 7. Formularios responsive

### 7.1 Layouts de campos

**Mobile (base):** una columna.
```html
<div class="grid grid-cols-1 md:grid-cols-2 gap-3">
  <div>...</div>
  <div>...</div>
</div>
```

**Desktop (md+):** dos columnas para pares de campos cortos (rol + área, estado + prioridad).

### 7.2 Inputs de fecha

Los `<input type="date">` nativos se comportan distinto en iOS (abre un picker de tres ruedas) vs Android (calendario). Sin workaround por ahora; es comportamiento del OS.

**Recomendación futura:** si la consistencia cross-OS importa, usar un date picker custom. Trade-off: bundle size + accesibilidad.

### 7.3 Selects

Los `<select>` nativos son feos y difíciles de estilar consistentemente. Hoy se usan con `.input` para tener un look unificado.

**Limitación:** en mobile, el dropdown nativo abre un sheet que tapa media pantalla. Es funcional pero no bonito. Aceptable por ahora.

**Recomendación futura:** custom select accesible (WAI-ARIA combobox). Es trabajo significativo.

### 7.4 Textarea del chat composer

```html
<textarea class="w-full resize-none px-3 py-2 rounded-md focus:outline-none text-sm bg-transparent"
          rows="2" maxlength="4000" ...></textarea>
```

- `rows="2"` en mobile y desktop. Dos líneas iniciales. Crece con el contenido si fuera necesario (hoy está fijo).
- **Touch keyboard:** el `Enter` desde el teclado mobile abre nueva línea por default. La interceptación de `Enter` (sin Shift) para enviar funciona en mobile también, pero **algunos keyboards no la respetan consistentemente** (Gboard vs Samsung Keyboard vs iOS). Trade-off conocido.
- **Sugerencia futura:** botón de envío más prominente en mobile, para los usuarios que no descubren el atajo.

---

## 8. Chat del ticket en mobile

### 8.1 Layout

**Mobile:** una columna. La columna central (chat) ocupa todo el ancho. La sidebar de info + acciones se apila debajo.

**Desktop (lg+):** dos tercios (chat) + un tercio (info + acciones). Grid `lg:grid-cols-3`.

### 8.2 Chat bubbles

```css
.chat-bubble { max-w-[80%]; }
```

- En mobile, `max-w-[80%]` deja un 20% de aire en cada lado, lo que ayuda a la legibilidad con dedos pulgares.
- En desktop, mismo `max-w-[80%]` es generoso para textos largos.

### 8.3 Composer

- Sticky al fondo de la columna del chat (hoy: aparece al final del scroll, no es sticky — **mejora pendiente** para mobile).
- En mobile, el teclado virtual tapa la mitad inferior de la pantalla. Necesita `scroll-into-view` cuando el input recibe focus. **Pendiente.**

### 8.4 Adjuntos en mobile

- Drag & drop es de desktop. En mobile, el path es: tap "Adjuntar" → bottom sheet de file picker (imágenes, archivos, etc.) o cámara directa.
- `capture="environment"` no está implementado aún. **Pendiente** para acelerar el flujo "foto de la incidencia".

---

## 9. Tablas en mobile

### 9.1 Comportamiento actual

Las tablas (`/tickets`, `/users`, `/categories`, `/reports`) tienen `overflow-x-auto` en su wrapper. En mobile, el usuario hace scroll horizontal para ver todas las columnas.

**Esto es subóptimo** pero funcional. El usuario más afectado es el supervisor en campo.

### 9.2 Patrón futuro: row → card

Para mejorar la UX mobile, cada fila podría convertirse en un card stack:

```html
<!-- Mobile: card vertical -->
<div class="md:hidden">
  <div class="card-tight p-3">
    <div class="flex justify-between">
      <span class="font-mono text-xs">TCK-0042</span>
      <span class="prio-alta">Alta</span>
    </div>
    <div class="font-medium text-brand-ink mt-1">Bomba de achique no enciende</div>
    <div class="flex items-center gap-2 mt-2 text-xs">
      <span class="badge-en_proceso">En proceso</span>
      <span class="text-slate-500">hace 3 h</span>
    </div>
  </div>
</div>

<!-- Desktop: tabla normal -->
<div class="hidden md:block table-wrap">
  <table class="table">...</table>
</div>
```

**Trade-off:** duplicación de markup. **Beneficio:** mobile UX de primera, sin scroll horizontal. **Decisión:** implementar si la métrica de uso mobile de las tablas supera el 30%.

### 9.3 Paginación

```html
<div class="flex items-center gap-2">
  <button class="btn btn-secondary btn-sm" id="prev">← Anterior</button>
  <span>Página 1 de 12</span>
  <button class="btn btn-secondary btn-sm" id="next">Siguiente →</button>
</div>
```

- En mobile, los botones "← Anterior" y "Siguiente →" son lo suficientemente grandes con `btn-sm` (28px height) **pero** el área clickeable es el botón entero, no solo el texto. Considerado aceptable.
- Alternativa futura: number-picker directo (`<input type="number">`) en mobile para saltar de página sin clicks.

---

## 10. Charts responsive

### 10.1 Chart de barras (30 días)

```html
<div class="flex items-end gap-1 h-32">  <!-- h-32 = 128px -->
```

- 30 barras. En mobile (320px), cada barra es ~10px con gap-1 (4px). Se ve apretado pero funciona.
- En desktop (1024px+), cada barra es ~33px. Respirado.
- **No se re-escala con `h-32` fijo** — la altura del chart es constante. Lo que escala es el ancho de cada barra.
- Labels en X (`text-[10px]`): "22 jun". En mobile, los labels pueden superponerse si el día es largo. El backend devuelve `YYYY-MM-DD` y el frontend hace `.slice(5)` para mostrar `MM-DD`. Corto.

**Mejora futura:** ocultar labels en días alternos cuando el viewport es muy angosto (`hidden xs:inline` o similar). Hoy el chart sigue siendo legible al precio de overlap menor.

### 10.2 Progress bar (por prioridad)

```html
<div class="w-full h-2 bg-slate-100 rounded overflow-hidden">
  <div class="h-2 rounded transition-all bg-brand-ocean" style="width: 60%"></div>
</div>
```

- Universal. Funciona en todos los viewports sin cambios.

### 10.3 Layouts de charts (uno al lado del otro)

- **Mobile:** apilados vertical (`grid-cols-1`).
- **lg+:** lado a lado (`lg:grid-cols-2` o `lg:grid-cols-3` con un chart en col-span-2).

---

## 11. Modal responsive

### 11.1 Tamaños

```js
const widths = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };
```

| Size | max-width | Uso |
|---|---|---|
| `sm` | 24rem (384px) | Confirmaciones simples. |
| `md` (default) | 32rem (512px) | Asignar, cambiar estado, editar categoría. |
| `lg` | 42rem (672px) | Editar ticket (todos los campos). |
| `xl` | 56rem (896px) | (reservado, no usado). |

### 11.2 Comportamiento mobile

- `p-4` en el container del modal → 16px de aire en cada borde.
- `max-w-lg` (32rem = 512px) **se reduce** en mobile porque el container tiene `p-4` y el viewport mobile es ~360-414px. El modal se ajusta al viewport.
- `max-h-[90vh]` con `overflow-y-auto` interno → si el contenido no entra, scroll. El usuario puede hacer scroll dentro del modal.

### 11.3 Posicionamiento

```html
<div class="fixed inset-0 z-40 flex items-center justify-center p-4">
```

Centrado vertical y horizontal. En mobile, esto puede hacer que el modal quede parcialmente fuera de la vista si el teclado virtual está abierto (típico de forms en modal). **Pendiente:** considerar bottom-sheet en mobile para modales con form.

---

## 12. Toast responsive

### 12.1 Posición

```html
<div id="toast-root" class="fixed top-4 right-4 z-50 flex flex-col gap-2"></div>
```

- Top-right fijo. En mobile, queda a 16px del top y 16px del right.
- Ancho: `auto` (se ajusta al contenido, hasta el ancho del viewport - 32px).

### 12.2 Limitaciones mobile

- **En mobile, el toast puede tapar acciones del topbar** (especialmente el bell badge). Si el usuario recibe un toast justo después de hacer click en algo, la siguiente acción puede ser bloqueada visualmente.
- **Mejora futura:** considerar bottom-anchored toast en mobile (más cerca del pulgar). Trade-off: consistencia cross-device.

### 12.3 Auto-dismiss

- 4s default. En mobile, suficiente para leer.
- `prefers-reduced-motion: reduce` no afecta el auto-dismiss; sólo las animaciones de enter/leave.

---

## 13. Performance mobile

### 13.1 Bundle size

- Vite tree-shaking + sin React → bundle inicial ~150-200KB gzipped (estimado). Es **muy** liviano para SPA.
- SheetJS (xlsx) y jsPDF se cargan **bajo demanda** desde CDN cuando el usuario hace click en "Exportar". No pesan en el bundle inicial.
- Socket.io client también se carga bajo demanda al login.

### 13.2 Imágenes

- `loading="lazy"` en attachments (ya implementado).
- Sin imágenes hero. El video del login es la única excepción — y tiene fallback.

### 13.3 Realtime

- El `socket.io-client` se mantiene conectado. En mobile con conexión intermitente, el `reconnect` es costoso. 
- **Mejora futura:** heartbeat adaptativo (más frecuente cuando hay eventos, menos cuando no).

### 13.4 Skeleton

- `animate-pulse` consume CPU. En mobile, esto puede drenar batería. 
- **Mejora futura:** skeleton estático en mobile (sólo desktop usa pulse). Hoy: el `prefers-reduced-motion: reduce` colapsa pulse a estado estático, pero el usuario tiene que activarlo manualmente. **Considerar:** auto-activar en mobile.

---

## 14. Viewport meta tag

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
```

Configurado en `client/index.html`. Sin `user-scalable=no` (accesibilidad: usuarios con problemas de vista necesitan poder hacer zoom).

---

## 15. Orientación

- **Portrait:** el layout por defecto. Mobile vertical.
- **Landscape (mobile):** el sidebar drawer sigue funcionando, pero el chat del ticket se siente apretado. La limitation es del viewport, no del código.
- **Tablet portrait:** igual que mobile, pero con más espacio.
- **Tablet landscape:** comportamiento de desktop en muchos sentidos (sidebar sticky ≥ md).

**No se bloquea orientación** — el usuario puede usar la app como prefiera.

---

## 16. Breakpoint matrix (resumen)

| Componente / vista | base | sm (640) | md (768) | lg (1024) | xl (1280) |
|---|---|---|---|---|---|
| Sidebar | drawer | drawer | sticky | sticky | sticky |
| Topbar search | hidden | hidden | visible | visible | visible |
| Topbar quick actions | hidden | hidden | visible | visible | visible |
| Page padding | 16 | 16 | 24 | 24 | 24 |
| Dashboard h1 | 30px | 31px | 33px | 35px | 36px |
| KPI grid | 1 col | 2 col | 3 col | 4 col | 4 col |
| Chart grid | 1 col | 1 col | 1 col | 2-3 col | 2-3 col |
| Tickets table | scroll-h | scroll-h | normal | normal | normal |
| Chat layout | stacked | stacked | stacked | 2/3 + 1/3 | 2/3 + 1/3 |
| Modal | bottom | bottom | centered | centered | centered |
| Sidebar drawer width | 256 | 256 | — | — | — |
| Touch target | 44 | 44 | 36-44 | 36 | 36 |

---

## 17. Anti-patterns responsive

- ❌ **`hidden md:block` sin alternativa mobile** — esconder un control sin reemplazarlo es peor que mostrarlo mal.
- ❌ **`text-xs` en mobile para CTAs primarias** — el dedo necesita ver para poder clickar. Mínimo `text-sm` en acciones.
- ❌ **`w-[80vw]` o similares** — usar `max-w-*` con padding en su lugar, o el contenido se ve raro en tablets.
- ❌ **`overflow: hidden` en containers con cards** — esconde el problema de overflow en vez de resolverlo.
- ❌ **Asumir que desktop y mobile son el mismo bug** — a veces un fix mobile rompe desktop y viceversa. Testear ambos.
- ❌ **Media queries dentro de los componentes** — Tailwind utility classes son la forma. `md:flex` es legible; `@media (min-width: 768px) { ... }` no.
- ❌ **Tabs deprecadas en mobile** — los tabs son desktop pattern. En mobile, usar bottom navigation o un sheet. (No aplica en GCM hoy, pero tenerlo en mente.)
- ❌ **Hover states en mobile** — `:hover` no aplica en touch. El usuario toca, no hover. Asegurar que el `:active` state se vea diferente o usar `:focus-visible`.
- ❌ **`100vh` para hero sections en mobile** — el viewport real en mobile es menor (por el address bar). Usar `100dvh` (dynamic viewport height) o `min-h-[100dvh]`. **El login ya usa `min-h-[100dvh]`** ✓.

---

## 18. Testing cross-device

### 18.1 Manual checklist (antes de cada release)

- [ ] Login funciona en iPhone SE (375px), iPad (768px), MacBook 13" (1280px), monitor externo 4K.
- [ ] Sidebar drawer abre/cierra con tap en ☰, click en backdrop, navegación.
- [ ] Topbar no se desborda con título largo.
- [ ] Dashboard KPIs se ven bien en 1, 2, 3, 4 columnas.
- [ ] Chat del ticket es usable en mobile (typing, send, attach).
- [ ] Modal no se sale del viewport.
- [ ] Tablas no rompen el layout horizontal.
- [ ] Toast no tapa acciones críticas.
- [ ] Realtime funciona con conexión intermitente (modo avión + reconectar).
- [ ] Video del login no rompe el layout si tarda en cargar.

### 18.2 DevTools tips

- **Chrome DevTools → Device Toolbar** (`Cmd+Shift+M` / `Ctrl+Shift+M`).
- Probar iPhone SE, iPhone 14 Pro, iPad, iPad Pro 12", desktop 1280, desktop 1920.
- **Throttling de red**: Fast 3G + 4x CPU slowdown es la prueba mínima.
- **Lighthouse mobile** en cada deploy.

---

## Resumen

- **Mobile:** drawer sidebar, single column, touch targets 44px, sin scroll horizontal.
- **Tablet (md+):** sticky sidebar, 2-3 col grids, search aparece.
- **Desktop:** sticky sidebar, multi-col grids, quick actions, user menu con nombre.
- **Universal:** mismo shell, mismos componentes, mismas reglas. Lo que cambia es la disposición, no el contrato.

Si un PR introduce cambios responsive que rompen alguno de estos breakpoints sin ser explícito al respecto, es un PR que necesita revisión de diseño. Las reglas responsive no son accidentales — son la columna vertebral de la accesibilidad operacional del producto.