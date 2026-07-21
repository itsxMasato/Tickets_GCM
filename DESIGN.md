<!-- Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. -->

---
name: GCM Tickets
description: Internal ticket management system for GCM (shrimp industry operations). Navy primary, ocean blue detail, shrimp-red accent. Operacional premium feel.
colors:
  brand-navy: "#071D4C"
  brand-deep: "#44497B"
  brand-ocean: "#16ACE4"
  brand-ink: "#243447"
  accent-camaron: "#CF301D"
  accent-camaron-hover: "#A8261A"
  surface-bg: "#F7F9FC"
  surface-alt: "#E1D9DB"
  surface-border: "#D6DEE8"
typography:
  display:
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "clamp(1.875rem, 4vw, 2.25rem)"
    fontWeight: 700
    lineHeight: 1.2
  body:
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    letterSpacing: "0.08em"
    textTransform: "uppercase"
rounded:
  sm: "6px"
  md: "8px"
  lg: "12px"
  xl: "16px"
  chat: "16px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "40px"
components:
  button-primary:
    backgroundColor: "{colors.brand-navy}"
    textColor: "#FFFFFF"
    rounded: "{rounded.md}"
    padding: "8px 14px"
    typography: "{typography.body}"
  button-accent:
    backgroundColor: "{colors.accent-camaron}"
    textColor: "#FFFFFF"
    rounded: "{rounded.md}"
    padding: "8px 14px"
  button-secondary:
    backgroundColor: "#FFFFFF"
    textColor: "{colors.brand-ink}"
    rounded: "{rounded.md}"
    padding: "8px 14px"
  card:
    backgroundColor: "#FFFFFF"
    rounded: "{rounded.lg}"
    padding: "20px"
  input:
    backgroundColor: "#FFFFFF"
    textColor: "{colors.brand-ink}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
  badge-status:
    backgroundColor: "#F1F5F9"
    textColor: "{colors.brand-ink}"
    rounded: "999px"
    padding: "2px 8px"
---

# Design System: GCM Tickets

## 1. Overview

**Creative North Star: "La sala de control de operaciones."**

GCM Tickets is the operations nerve center for an internal shrimp-industry workflow. Four roles, one shared ticket lifecycle, every action visible to the people who need it. The visual language reflects that: a quiet, navy-grounded surface, real data on every screen, no decoration that doesn't carry information. The login is cinematic because first impressions of corporate systems earn trust; the in-app surface is calm because the work is dense.

We are explicitly **not** a consumer SaaS. No pastel gradients. No "Welcome back!" copy. No celebratory micro-interactions. The aesthetic is closer to an air-traffic console than a meditation app — the user is operating, not browsing.

**Key Characteristics:**

- **Navy-first, not gray-first.** The brand color carries identity; surface gray is a quiet canvas for content.
- **One accent, used with intent.** Rojo camarón (`#CF301D`) is reserved for primary actions, critical status, and the things the user must not miss.
- **Status communicated three ways.** Dot + label + color on every status badge. Color-blind safe by design.
- **Calm density.** Multiple KPIs, tables, and chat surfaces per screen, but a single accent, generous whitespace, no competing gradients.
- **Spanish, direct, no fluff.** Imperative verb buttons ("Asignar", "Cerrar", "Reabrir"). No exclamation marks. No emoji.

## 2. Colors

The palette is restrained: one navy primary, one ocean-blue detail, one red accent, and a near-white neutral family. The accent appears on ≤8% of any given screen — its scarcity is the point.

### Primary
- **Navy Mar Profundo** (`#071D4C`): Brand-defining color. Used for the sidebar background, primary CTAs, link color, and h1 emphasis. The visual anchor of the system.
- **Azul Profundo Suavizado** (`#44497B`): Hover/pressed state for navy. Slightly desaturated, used for `btn-primary:hover` and darker chart strokes.
- **Azul Océano** (`#16ACE4`): Detail and information color. Chart bars, status "asignado" dot, focus ring tint, and the active sidebar indicator dot. Never used as a fill for primary actions.

### Secondary
- **Rojo Camarón** (`#CF301D`): The accent. Critical actions ("Crear ticket", "Cerrar", "Reabrir"), the "urgente" priority dot, and any button that the user must not miss. Used sparingly.
- **Rojo Camarón Hover** (`#A8261A`): Pressed state of the accent.

### Tertiary
- **Tinta (Ink)** (`#243447`): Body text and headings. Not pure black — slightly blue, harmonizes with the navy primary.

### Neutral
- **Superficie** (`#F7F9FC`): Page background. A very light cool gray with a touch of blue, never pure white.
- **Superficie Alternativa** (`#E1D9DB`): Alt background for sections, sidebar hovers, and grouped content. Slightly warm; used as the "off" plane.
- **Borde Superficie** (`#D6DEE8`): All borders, dividers, table cell separators. Stays low-contrast so it organizes without shouting.

### Named Rules

**The One Voice Rule.** Rojo Camarón appears on ≤8% of any given screen, and only on actions the user must not miss. It is never used decoratively.

**The Ink-Not-Black Rule.** All text uses `brand-ink` or a derived slate. Pure black is forbidden; it fights the navy.

**The Color-Blind Rule.** Every status is communicated by `dot + label + color`. Color alone is never the only signal.

## 3. Typography

**Display Font:** Inter (with system-ui fallback)
**Body Font:** Inter (same family)
**Label Font:** Inter uppercase tracked

**Character:** A single geometric-humanist sans used across every weight and role. No second family, no display serif. The work is operations, not editorial; the type system stays out of the way.

### Hierarchy
- **Display** (700, `clamp(1.875rem, 4vw, 2.25rem)`, lh 1.2): Dashboard h1s ("Hola, Juan"). Tight, confident, never decorative.
- **Headline** (700, `1.5rem`, lh 1.25): Page titles on the tickets list, ticket detail, users, reports.
- **Title** (600, `1rem`, lh 1.4): Card titles, table headers, modal headers.
- **Body** (400, `0.875rem`, lh 1.5): All running text. Tables, descriptions, chat bubbles.
- **Label** (600, `0.75rem`, tracking `0.08em`, uppercase): KPI labels, sidebar section labels, button text, table column headers. Inter is a humanist sans — the uppercase tracking gives labels a quiet authority without feeling militaristic.

### Named Rules

**The Single-Family Rule.** Inter is the only typeface. No second family, no display serif, no script. Pairing on a contrast axis is a brand move; here, density is the move.

**The No-Serif-Display Rule.** Display headlines stay sans. We are not an editorial; we are an operations console.

### Iconography

Inter carries the typography. Icons come from a single icon family, **Material Symbols Outlined** (variable font, configurable `wght` / `FILL` / `GRAD` / `opsz` axes). The icon family is *not* a second typeface — it is a vocabulary of glyphs, used at `wght 400`, `FILL 0`, `opsz 24` by default. No emoji, no hand-rolled SVG, no other icon library. One family for glyphs, one for text.

## 4. Elevation

The system uses **ambient elevation**: surfaces are flat at rest, and shadows appear as a response to state — hover, focus, or active panel. There are no permanent drop shadows under resting content; the page is calm.

Shadows are tinted with the brand navy at low alpha (5–18%) rather than pure black, which is what gives the UI its slightly cool, premium feel.

### Shadow Vocabulary
- **soft** (`0 1px 2px rgba(7,29,76,0.05)`): Default on inputs, chat bubbles, and small UI atoms. Almost invisible.
- **card** (`0 1px 3px rgba(7,29,76,0.06), 0 1px 2px -1px rgba(7,29,76,0.06)`): Default on `.card` containers, tables, modals at rest.
- **pop** (`0 8px 24px -6px rgba(7,29,76,0.18)`): Hover state on KPI cards and elevated panels.
- **sidebar** (`4px 0 24px -8px rgba(7,29,76,0.18)`): The single asymmetric shadow in the system — the only place a shadow carries a directional cue. Anchors the sidebar to the page.

### Named Rules

**The Flat-By-Default Rule.** Surfaces are flat at rest. Shadows appear only on hover, focus, or as a response to interaction.

**The Brand-Tinted Shadow Rule.** All shadows use `rgba(7,29,76, …)` not pure black. This is what makes the elevation feel cool and premium.

## 5. Components

### Buttons
- **Shape:** Slightly soft corners (`rounded-md`, 8px). Not pill, not square.
- **Primary:** Navy (`#071D4C`) background, white text, white-on-navy. Used for the dominant action of any surface.
- **Accent:** Rojo Camarón background. Reserved for "Crear ticket" and other high-stakes actions where the user must not miss the button.
- **Secondary:** White background, ink text, surface-border. The workhorse — used for "Ver todos", "Filtrar", "Limpiar".
- **Ghost:** Transparent background, ink/80 text. Destructive or quiet actions in tight layouts.
- **Hover / Focus:** Primary darkens to `brand-deep`; accent darkens to `accent-hover`. Focus ring uses `brand-ocean` at 30–40% alpha, 2px, with 1px offset.

### Chips / Status Badges
- **Style:** Pill (`rounded-full`), tinted background (e.g. `bg-amber-100`), dark text (`text-amber-800`), and a leading colored dot.
- **Statuses:** `recibido` (slate), `asignado` (blue), `en_proceso` (amber), `solucionado` (emerald), `cerrado` (slate-dark), `reabierto` (orange).
- **Priorities:** `baja` (slate), `media` (blue), `alta` (amber), `urgente` (red — uses brand-accent for the dot).

### Cards / Containers
- **Corner Style:** `rounded-xl` (12px) on the standard card; `rounded-2xl` (16px) on the login card and any "feature" surface.
- **Background:** White.
- **Border:** `border-surface-border` (1px) on every resting card.
- **Shadow:** `shadow-card` at rest, `shadow-pop` on hover (used on KPI cards).
- **Internal Padding:** 20px (`p-5`) on standard cards; 32px on hero/login.

### Radius System
The project uses a documented three-step radius scale. Pick the right one by surface role; do not invent new values.

| Surface | Radius | Token | Rationale |
|---|---|---|---|
| Buttons, inputs, chips, sidebar links | 8px | `rounded-md` | Tight enough to feel operational, soft enough to avoid 2003-era sharp corners. |
| Standard cards, KPI cards, table wrappers, modals | 12px | `rounded-xl` | Default for any surface that holds content. Reads as "container, not button." |
| Login card, feature surfaces that frame the product | 16px | `rounded-2xl` | Reserved for the cinematic moment (login) and any "this is the product" hero surface. |
| Login card (current implementation) | 32px | `rounded-[2rem]` | One documented exception. The login card sits alone on a hero, so a softer radius reinforces the "moment" read. If a second card ever uses this radius, promote it to `rounded-3xl` in the token map. |

**The Consistency Rule.** Never mix radii inside one component. A button sitting on a 32px card is still 8px; a card inside a 16px surface is still 12px. Mixed-radius compositions are an AI-tell.

**The Pill Exception.** Status badges and tag chips use `rounded-full` (pill). This is the only place pill is allowed. If you reach for `rounded-full` on a button, you are reaching for a consumer-SaaS tell — stop.

### Inputs / Fields
- **Style:** White background, 1px `surface-border`, 8px radius, `shadow-soft` (subtle, gives the field a slight "lift").
- **Placeholder:** Slate-400. Meets 4.5:1 against the white background.
- **Focus:** Border shifts to `brand-ocean`, focus ring at 2px with `brand-ocean` at 30% alpha. No color change to text.
- **Error:** Red text on `bg-red-50`, `border-red-200`. Announced via `aria-live="polite"`.

### Navigation (Sidebar)
- **Background:** Navy (`#071D4C`). Single solid color, no gradient, no image.
- **Links:** White at 80% opacity, 12px gap, `rounded-md` (8px). Hover: `bg-white/10`. Active: `bg-white/15` plus a 1.5px `brand-ocean` indicator dot on the right.
- **Section Labels:** White at 50% opacity, uppercase, `tracking-widest` (0.1em), 10px. Identifies the start of a group ("Operación", "Administración").
- **Mobile:** Slides in as a drawer from the left with a 200ms ease-out animation. `prefers-reduced-motion` collapses to instant.

### Chat (Signature Component)
- **Background container:** `bg-slate-50` (slightly cooler than page surface) so the conversation visually separates from the page chrome.
- **My bubble:** Navy background, white text, 16px radius with a 4px tail at the bottom-right (`rounded-br-sm`).
- **Other bubble:** White background, ink text, 1px surface-border, 16px radius with a 4px tail at the bottom-left.
- **Avatar:** Color from a deterministic palette of 10 tones (blue, green, amber, red, etc.), 2-letter initials in white.
- **Event markers:** Centered pill with a 1px line extending to both edges (`::before/::after` flex-borders). Used for "Ticket creado", "Reasignado a X", "Adjuntó archivo".

### KPI Cards
- **Shape:** Card, `rounded-xl`.
- **Label:** Uppercase tracked (`tracking-wider`), 12px, slate-500.
- **Value:** Bold 24px, ink.
- **Hint:** 12px, slate-400. Optional supporting text.
- **Hover:** `shadow-pop` lift, no other change.

## 6. Do's and Don'ts

### Do:
- **Do** use the brand-navy as the page's primary identity. Sidebar, primary CTAs, and h1s all carry it.
- **Do** use Rojo Camarón for "Create", "Close", "Reopen" and other high-stakes actions. Scarcity is the point.
- **Do** communicate status with `dot + label + color`. Never color alone.
- **Do** keep surfaces flat at rest. Shadows appear on hover or focus only.
- **Do** cap body line length to 65–75ch on long prose (chat, descriptions).
- **Do** honor `prefers-reduced-motion`. All animations collapse to instant transitions under that media query.
- **Do** differentiate the four role dashboards. Each role's primary surface reflects its job — supervisor capture, admin execution, jefe audit, SAC triage.

### Don't:
- **Don't** use side-stripe borders (`border-left` > 1px as a colored accent) on cards, list items, or alerts. Rewrite with full borders, background tints, or leading numbers.
- **Don't** use gradient text. `background-clip: text` is decorative, never meaningful. Use a single solid color.
- **Don't** use glassmorphism as a default. Glass is reserved for the login card and nowhere else.
  - **Scope rule:** the `.login-card` translucent surface is the **only** sanctioned glass surface in the project. If a new surface needs the same treatment (a "premium" modal, a settings drawer), it does not get glass — it gets a solid surface with the same brand palette.
  - **Honesty rule:** the login card's `backdrop-filter` is a **web approximation of glassmorphism**, not Apple Liquid Glass. Apple documents Liquid Glass for Apple platforms only. Comments in `styles.css` already call this out.
  - **Accessibility rule:** any glass surface must provide a `prefers-reduced-transparency: reduce` fallback to a solid surface with the same contrast budget. The login card falls back to `rgba(7, 29, 76, 0.88)` (brand-navy at 88% alpha) when the user reduces transparency.
- **Don't** ship a hero-metric template (big number + small label + supporting stats + gradient accent) on every screen. KPIs belong on the dashboard, not on every page.
- **Don't** use the same dashboard layout for all four roles. Triage, execution, audit, and capture are different jobs.
- **Don't** use celebratory copy ("🎉 Ticket cerrado!") or friendly exclamation marks. This is an internal tool.
- **Don't** fabricate hero metrics. The login may feel premium, but every number shown must come from real system state.
- **Don't** use emoji as a UI element. SVG icons and Material Symbols are the icon vocabulary; emoji is not.
- **Don't** show animation that gates content visibility. Reveals enhance, they don't unlock.
- **Don't** ship a "small uppercase tracked eyebrow" above every section. One deliberate kicker per surface at most.
- **Don't** use sidebars with 8+ icon+label sections of identical weight. Three sections maximum, named by purpose (Operación, Administración, Notificaciones).
- **Don't** use zebra tables. Hover state only.
- **Don't** use generic AI tells: "Get started", "Welcome back!", "✨" sparkles, "Supercharge your workflow." Spanish, imperative, professional.