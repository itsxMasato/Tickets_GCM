# Design System — GCM Tickets

> Sistema visual del producto. Tokens, primitivas y reglas. Inspirado en la sobriedad operativa de Emil Kowalski (motion + craft), la jerarquía funcional de Linear y la verdad compositiva de Stripe.

**North Star:** *La sala de control de operaciones.*
**Personalidad de marca:** Operacional premium. Tres palabras: **serio, inmediato, fiable**.
**Register:** product — la herramienta primero, el marketing después.

---

## 1. Principios

1. **Cada rol es una superficie distinta.** Triage (SAC), ejecución (admin), auditoría (jefe), captura (supervisor). El diseño sirve al trabajo, no al framework.
2. **La visibilidad es una función de seguridad.** Cada rol ve solo lo que le toca. Las fugas (SAC leyendo chat donde no debe) son bugs de diseño, no de datos.
3. **La historia es el producto.** El chat del ticket es el sistema de registro. Estados, comentarios, adjuntos, reasignaciones — todo vive allí, en orden.
4. **Datos reales, números reales.** Cada métrica visible se calcula desde el estado vivo. Sin placeholders. Sin "12.4M Registros activos".
5. **Densidad calmada, no decoración ruidosa.** Mucha información por pantalla, una sola superficie de acento, espaciado generoso, sin gradientes compitiendo.
6. **Mover solo lo que informa.** Animaciones solo para transiciones de estado. `prefers-reduced-motion` honrado globalmente.

---

## 2. Tokens

Todos los tokens viven en tres lugares que deben coincidir:
- `client/styles.css` (`:root` CSS variables — fuente de verdad para el navegador).
- `tailwind.config.js` (extend `colors` / `boxShadow` — fuente de verdad para utility-classes).
- `DESIGN.md` (documentación narrativa — fuente de verdad para humanos).

Si cambias un color, cambia los tres. **Una sola paleta, una sola historia.**

### 2.1 Color

La paleta está deliberadamente restringida: un navy primario, un ocean de detalle, un rojo de acento, una familia casi blanca neutra. El acento aparece en ≤ 8% de cualquier pantalla — la escasez es el punto.

#### Primary

| Token | Hex | Uso |
|---|---|---|
| `brand.DEFAULT` | `#071D4C` | Brand-defining. Sidebar, CTAs primarias, link color, h1. Ancla visual del sistema. |
| `brand.deep` | `#44497B` | Hover/pressed de navy. Strokes oscuras en charts. |
| `brand.ocean` | `#16ACE4` | Detail / information. Barras de chart, dot de estado `asignado`, focus ring tint, dot indicador activo en sidebar. **Nunca** como fill de acción primaria. |
| `brand.ink` | `#243447` | Texto de cuerpo y headings. No es negro puro — ligeramente azul, armoniza con el navy. |

#### Accent

| Token | Hex | Uso |
|---|---|---|
| `accent.DEFAULT` | `#CF301D` | Rojo camarón. Acciones críticas (`Crear ticket`, `Cerrar`, `Reabrir`), dot de prioridad `urgente`, dot de no-leída. Escasez = jerarquía. |
| `accent.hover` | `#A8261A` | Pressed de accent. |

#### Surface

| Token | Hex | Uso |
|---|---|---|
| `surface.DEFAULT` | `#F7F9FC` | Fondo de página. Gris muy claro con toque azul. Nunca blanco puro. |
| `surface.alt` | `#E1D9DB` | Fondo de secciones alternativas, hovers de sidebar, contenido agrupado. Levemente cálido — el "off plane". |
| `surface.border` | `#D6DEE8` | Bordes, divisores, separadores de celda. Bajo contraste: organiza sin gritar. |
| `surface.border-strong` | `#B6C2D2` | Borde de scrollbar activo, separadores que piden presencia. |

#### Reglas con nombre

- **The One Voice Rule.** El rojo camarón aparece en ≤ 8% de cualquier pantalla, y solo en acciones que el usuario no puede perderse. Nunca decorativo.
- **The Ink-Not-Black Rule.** Todo texto usa `brand-ink` o un slate derivado. Negro puro prohibido — pelea con el navy.
- **The Color-Blind Rule.** Cada estado se comunica con `dot + label + color`. Nunca color solo.
- **The White-on-Navy Opacity Scale.** El texto blanco sobre `bg-brand-navy` no es libre: sigue una escala fija de opacidades, cada una con un rol y un contraste medido sobre `#071D4C`. No inventar valores intermedios.

| Opacidad | Contraste sobre navy | WCAG | Uso canónico |
|---|---|---|---|
| `text-white/55` | ~4.0:1 | falla AA en < 18px | **Reservado al login glass** (surface translúcida, no navy plano). |
| `text-white/60` | ~4.6:1 | AA (margen) | Meta secundario del sidebar: subtítulo de marca, role/área en user card. |
| `text-white/70` | ~5.6:1 | AA+ | Links del login y elementos interactivos no primarios sobre navy. |
| `text-white/75` | ~6.2:1 | AAA | **Headers de sección del sidebar** (`.sidebar-section`). |
| `text-white/80` | ~6.7:1 | AAA | Links de navegación del sidebar (`.sidebar-link` default). |
| `text-white` | ~16:1 | AAA | Activos, items primarios, indicadores fuertes. |

La jerarquía adentro del sidebar queda: **link (white/80) > header de sección (white/75) > meta (white/60)**. Bajar la opacidad del header debajo de 75% lo hace ilegible a 10px y se confunde con un control sin propósito.

### 2.2 Tipografía

**Familia:** Inter (con `system-ui` fallback).
**Idiom character:** Una sola sans geométrica-humanista en todos los pesos. No segunda familia, no serif display. Esto es operaciones, no editorial; el tipo se quita del camino.

| Rol | Tamaño | Peso | Line-height | Uso |
|---|---|---|---|---|
| Display | `clamp(1.875rem, 4vw, 2.25rem)` | 700 | 1.2 | h1 de dashboard ("Hola, Juan"). Apretado, confiado. |
| Headline | `1.5rem` | 700 | 1.25 | Títulos de página (tickets, detalle, usuarios, reportes). |
| Title | `1rem` | 600 | 1.4 | Card titles, table headers, modal headers. |
| Body | `0.875rem` | 400 | 1.5 | Todo el texto corrido. Tablas, descripciones, burbujas de chat. |
| Label | `0.75rem` | 600 | tracking `0.08em`, uppercase | KPI labels, sidebar section labels, button text, table column headers. |

#### Reglas con nombre

- **The Single-Family Rule.** Inter es la única tipografía. No segunda familia, no display serif, no script.
- **The No-Serif-Display Rule.** Headlines siguen siendo sans. No somos editorial; somos consola de operaciones.

#### Iconografía

Los iconos vienen de una sola familia: **SVG inline 24×24, stroke 1.8, currentColor** — centralizados en `client/utils/icons.js` (export `ICON`). No emoji, no Material Symbols en este codebase (estaba planeado en DESIGN.md pero la implementación actual usa SVG stroke-based; los iconos del login son la única excepción con Material Symbols). Glyphs a `w-4 h-4` por defecto en componentes, `w-5 h-5` en navegación, `w-3.5 h-3.5` en chips compactos.

### 2.3 Radio

Tres pasos documentados. El radio correcto se elige por el rol de la superficie — no se inventan valores nuevos.

| Superficie | Radio | Token | Rationale |
|---|---|---|---|
| Botones, inputs, chips, links de sidebar | 8px | `rounded-md` | Apretado para sentirse operacional, suave para evitar esquinas 2003. |
| Cards estándar, KPI cards, tablas, modals | 12px | `rounded-xl` | Default para superficies que contienen contenido. Lee como "contenedor, no botón". |
| Login card, superficies "feature" | 16px | `rounded-2xl` | Reservado al momento cinemático y a cualquier hero "esto es el producto". |
| Login card (implementación actual) | 32px | `rounded-[2rem]` | Una excepción documentada: el card vive solo en su hero, y un radio más suave refuerza la lectura de "momento". Si una segunda superficie usara este radio, promoverlo a `rounded-3xl` en el token map. |
| Status badges, tag chips | pill | `rounded-full` | Único lugar donde pill se permite. Si lo usas en un botón, estás cayendo en el tell del SaaS consumer — para. |

**The Consistency Rule.** Nunca mezcles radios dentro de un componente. Un botón sentado en un card de 32px sigue siendo 8px; un card dentro de una superficie de 16px sigue siendo 12px. Composiciones de radio mixto son un tell de IA.

### 2.4 Elevación

**Ambient elevation.** Superficies planas en reposo. Las sombras aparecen como respuesta a estado: hover, focus, active panel. No hay drop shadows permanentes bajo contenido en reposo — la página está calmada.

Las sombras están tintadas con el navy de marca a baja alpha (5–18%), no con negro puro — esto es lo que le da al UI ese toque frío y premium.

| Token | Valor | Uso |
|---|---|---|
| `shadow-soft` | `0 1px 2px rgba(7,29,76,0.05)` | Default en inputs, chat bubbles, átomos pequeños. Casi invisible. |
| `shadow-card` | `0 1px 3px rgba(7,29,76,0.06), 0 1px 2px -1px rgba(7,29,76,0.06)` | Default en `.card`, tablas, modals en reposo. |
| `shadow-pop` | `0 8px 24px -6px rgba(7,29,76,0.18)` | Hover state en KPI cards y paneles elevados. |
| `shadow-sidebar` | `4px 0 24px -8px rgba(7,29,76,0.18)` | La única sombra asimétrica del sistema — lleva una cue direccional. Ancla la sidebar a la página. |

**The Flat-By-Default Rule.** Planas en reposo. Sombras solo en hover, focus, o como respuesta a interacción.
**The Brand-Tinted Shadow Rule.** Todas las sombras usan `rgba(7,29,76, …)` — nunca negro puro.

### 2.5 Espaciado

Escala Tailwind estándar (4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48 / 64). En la práctica, los valores que más se ven:

| Uso | Valor | Notas |
|---|---|---|
| Padding card estándar | `20px` (`p-5`) | Card interno. |
| Padding login card | `32px` (`p-8`) | Más generoso por el contexto cinemático. |
| Padding page | `16px / 24px` (`p-4 md:p-6`) | Edge en mobile, edge en desktop. |
| Gap grid cards | `12px` (`gap-3`) | Standard en grids de KPI / cards. |
| Gap vertical entre secciones | `24px` (`gap-6`) | Entre bloques de un view. |

### 2.6 Z-index

| Capa | Valor | Uso |
|---|---|---|
| Base | `0` | Page content. |
| Sidebar drawer (móvil) | `z-30` | Drawer + backdrop. |
| Modal backdrop | `z-40` | Modal root. |
| Modal content | `z-40` (mismo layer) | Hijos de `modal-root`. |
| Topbar dropdowns | `z-40` | User menu, search results. |
| Toasts | `z-50` | Top-right, fixed. |

---

## 3. Estructura de la app

### 3.1 Layout shell

```
┌─────────────────────────────────────────────────────────────────┐
│ .gcm-sidebar  (aside.sidebar, w-64, bg-brand, fixed md+, drawer <md)
│ ┌─────────────┐
│ │  Brand      │  Logo GCM + label "Servicio al cliente"
│ ├─────────────┤
│ │  Section 1  │  uppercase tracked label (Operación / Administración / Notificaciones)
│ │   - link    │
│ │   - link    │  active: bg-white/15 + ocean dot indicator
│ ├─────────────┤
│  ...          │
│ ├─────────────┤
│ │  User card  │  Avatar + nombre + rol/área + botón Cerrar sesión
│ └─────────────┘
└─────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────┐
│ .topbar  (h-16, bg-white, border-b, sticky)
│ [☰] Hola, Juan            [Buscar  /]      [+ Nuevo] [🔔] [👤▾]
│      Tus tickets reportados                                   │
└─────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────┐
│ <main>  (max-w-7xl mx-auto p-4 md:p-6, overflow-y-auto)
│   ...view content...
│ </main>
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Estados de superficie

| Estado | Aplica a | Cambio |
|---|---|---|
| Rest | Todo | Plano. Sin sombra (excepto `shadow-card` en cards). |
| Hover | Buttons | `bg-brand-deep` (primary) / `bg-accent-hover` (accent) / `bg-surface` (secondary). |
| Hover | KPI cards | `shadow-pop` lift, ningún otro cambio. |
| Hover | Sidebar links | `bg-white/10`. |
| Hover | Tables | `bg-surface/60` en la fila. |
| Active | Sidebar links | `bg-white/15 text-white shadow-soft` + ocean indicator dot a la derecha. |
| Focus | Inputs | Border `brand-ocean`, ring 2px `brand-ocean/40`. |
| Focus | Buttons | Ring 2px `brand-ocean` (primary) / `accent` (accent) / `brand-ocean` (secondary). |
| Disabled | Buttons | `opacity-50 cursor-not-allowed`. |

---

## 4. Iconografía

### 4.1 Familia única

Una sola familia de iconos: SVG inline 24×24, stroke 1.8, `currentColor`, `viewBox="0 0 24 24"`. Centralizado en `client/utils/icons.js`.

No emoji, no otras librerías. Una familia para glyphs, una familia para texto (Inter).

### 4.2 Tamaños

| Contexto | Tamaño | Token |
|---|---|---|
| Sidebar links | 20px | `w-5 h-5` |
| Botones | 16px | `w-4 h-4` |
| Chips / bubbles de chat event | 14px | `w-3.5 h-3.5` |
| Avatar / user | 36px | `w-9 h-9` |
| Empty state | 40px | `w-10 h-10` |

### 4.3 Reglas

- **No emoji en UI.** Los emoji son inconsistentes entre plataformas (causan "fallo en blanco" en Windows sin fuentes de emoji). Reemplazado por SVG para homogeneidad visual.
- **Stroke uniforme.** Todos los iconos son 1.8px. No mezclar filled con outlined dentro de la misma vista.
- **`aria-hidden="true"`** en iconos decorativos. Iconos que llevan acción van con `aria-label` en el botón contenedor.

---

## 5. Patrones de motion

Motion está reservada a transiciones de estado. Animaciones decorativas prohibidas.

| Pattern | Duración | Easing | Uso |
|---|---|---|---|
| Sidebar slide-in (móvil) | 200ms | `ease-out` | Drawer en `<md`. |
| Toast enter/leave | 200ms | linear | Fade + translate-y(-4px). |
| Dropdown | instantánea | — | User menu, topbar dropdowns. Sin animar. |
| Modal backdrop fade | instantánea | — | Aparece/sale sin animar. |
| `prefers-reduced-motion: reduce` | 0.01ms | — | **Todas** las animaciones colapsan. Ya implementado en `styles.css`. |

**Regla Emil Kowalski:** no animes duración. Anima una sola propiedad (transform u opacity), una vez, por 200ms. Si necesitas más, reconsidera el problema.

---

## 6. Accesibilidad (WCAG AA)

Ya implementado / requerido:

- **Contraste:** body text ≥ 4.5:1, large text ≥ 3:1 contra cualquier fondo (status badges, KPI values, table cells).
- **Focus rings:** visibles en cada elemento interactivo. Navegación por teclado lista → detalle → composer completamente soportada.
- **Status por tres canales:** `dot + label + color` en cada status badge — color-blind safe por diseño.
- **`prefers-reduced-motion`:** honrado globalmente. Animaciones colapsan a instant.
- **Inputs:** labelados. Errores anunciados vía `aria-live="polite"` (login form ya cableado).
- **Español:** UI completa en español. Sin strings mezclados.
- **`role` y `aria-*`:** en toasts (`role="status"`), tables (`<th scope="col">`), chat events, status de carga (`role="status" aria-live="polite"`).

---

## 7. Glass / login card

Regla scope: `.login-card` (superficie translúcida sobre el video del login) es la **única superficie glass permitida** en el proyecto. Si una nueva superficie necesitara el mismo tratamiento (un modal "premium", un drawer de settings), **no** recibe glass — recibe surface sólido con la misma paleta de marca.

Honesty rule: el `backdrop-filter` del login es una **aproximación web de glassmorphism**, no Apple Liquid Glass. Apple documenta Liquid Glass solo para Apple platforms. Comentarios en `styles.css` ya lo aclaran.

Accessibility rule: cualquier superficie glass debe tener fallback a `prefers-reduced-transparency: reduce`. El login card cae a `rgba(7,29,76,0.88)` (brand-navy 88%) cuando el usuario reduce transparencia.

---

## 8. Anti-patterns (lo que NO se hace)

- **No side-stripe borders** (`border-left > 1px` como acento de color) en cards, list items, alerts.
- **No gradient text.** `background-clip: text` es decorativo, nunca significativo.
- **No glass como default.** Reservado al login card.
- **No hero-metric template** (número enorme + label chico + stats de soporte + acento en gradiente) en cada pantalla. KPIs viven en el dashboard, no en cada página.
- **No dashboards idénticos** para los 4 roles. Triage, ejecución, auditoría, captura son trabajos distintos.
- **No copy celebratorio** ("🎉 Ticket cerrado!") ni signos de exclamación amistosos.
- **No métricas hero fabricadas.** Si el login muestra un número, viene del estado real del sistema.
- **No emoji como elemento de UI.** SVG icons y Material Symbols (solo en el login) son el vocabulario.
- **No animación que gatee visibilidad de contenido.** Los reveals realzan, no desbloquean.
- **No eyebrow uppercase tracked en cada sección.** Una kicker deliberada por superficie como máximo.
- **No sidebars con 8+ secciones de peso idéntico.** Tres secciones máximo, nombradas por propósito (Operación, Administración, Notificaciones).
- **No zebra tables.** Solo hover state.
- **No tells genéricos de IA:** "Get started", "Welcome back!", "✨", "Supercharge your workflow". Español, imperativo, profesional.

---

## 9. Componentes

Documentación detallada en `COMPONENT_LIBRARY.md`. Resumen:

| Componente | Variantes | Notas |
|---|---|---|
| `Button` | primary · accent · secondary · ghost · icon · icon-sm | 8px radio, 1.5 gap, font-medium. |
| `Input` | text · search · password · date | 8px radio, focus ocean ring. |
| `Card` | standard · tight | 12px radio, 20px padding, 1px border. |
| `KPI card` | label · value · hint | 12px label uppercase, 24px value bold. |
| `Status badge` | recibido · asignado · en_proceso · solucionado · cerrado · reabierto | dot + label + color. |
| `Priority badge` | baja · media · alta · urgente | dot + label + color. |
| `Sidebar link` | default · active | 8px radio, 3 gap, ocean dot indicator. |
| `Chat bubble` | me · other | 16px radio + 4px tail, max-w 80%. |
| `Chat event` | created · assigned · reassigned · commented · attachment | Pill centrada con `::before/::after` flex-borders. |
| `Avatar` | — | 36px circular, color determinístico, 2-letter initials. |
| `Modal` | sm · md · lg · xl | Backdrop slate-900/50, max-w-[90vh]. |
| `Toast` | success · error · info · warn | Top-right, 4s default, dismiss manual. |
| `Empty state` | 7 presets | Icono SVG + título + mensaje + acción opcional. |
| `Notification card` | read · unread | Unread: `bg-accent/5` + `ring-1 ring-accent/20`. |
| `Ticket card` | — | 8px radio, hover border-ocean. |
| `Attachment thumb` | image · pdf · doc · sheet · zip · file | Image = 128×128 cover, file = row con icono + nombre. |

---

## 10. Stack técnico (contexto)

- **Frontend:** Vanilla JS (sin React). Helpers propios: `h()` hyperscript, `escapeHtml()`, `mount()`. Vite build.
- **CSS:** Tailwind 3.4 + `client/styles.css` con `@layer components` para primitivas reutilizables.
- **Iconos:** SVG inline centralizado en `client/utils/icons.js`.
- **Backend:** Express 5 + SQLite (better-sqlite3) + Socket.io para realtime.
- **Auth:** sesiones cookie-based, `bcrypt`.
- **Build:** Vite para client, Tailwind CLI para CSS, `concurrently` para dev paralelo.

Documentación operacional de cada componente, props, slots y code examples: ver `COMPONENT_LIBRARY.md`.