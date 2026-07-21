<!-- Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. -->

# GCM Tickets — Design System (Master)

> Source of truth para todo el UI. Cuando un archivo de `pages/` exista, sus reglas sobrescriben las de aquí.

**Stack:** Vite + Tailwind 3.4 + JS nativo (sin React). Inter como tipo base. Material Symbols + iconos SVG inline (Lucide-style).

---

## 1. Identidad de marca

| Token | Valor | Uso |
|-------|-------|-----|
| `brand.DEFAULT` | `#071D4C` | Navy corporativo — sidebar, títulos, CTAs primarios |
| `brand.deep` | `#44497B` | Hover sobre brand |
| `brand.ocean` | `#16ACE4` | Acento informativo, links, indicador activo |
| `brand.ink` | `#243447` | Texto principal |
| `accent.DEFAULT` | `#CF301D` | Rojo camarón — acciones críticas/destructivas, badges urgentes |
| `accent.hover` | `#A8261A` | Hover sobre accent |
| `surface.DEFAULT` | `#F7F9FC` | Fondo app |
| `surface.alt` | `#E1D9DB` | Fondos secundarios (futuro) |
| `surface.border` | `#D6DEE8` | Bordes, divisores |

**Reglas:** nunca usar hex crudos en componentes. Usar siempre los tokens semánticos (`bg-brand`, `text-accent`, `border-surface-border`).

## 2. Tipografía

- **Base:** Inter, weights 400/500/600/700.
- **Tamaños:** 12 · 14 · 16 (base) · 18 · 24 · 32.
- **Line-height:** 1.5 para body, 1.2-1.35 para headings.
- **Letter-spacing:** default; `-0.01em` permitido en headings ≥ 24px.

## 3. Iconografía

- **NO emojis** como iconos estructurales. Reemplazar por:
  - **SVG inline Lucide-style** (ya en uso en sidebar/topbar) — stroke 1.8, currentColor, viewBox 24×24.
  - **Material Symbols Outlined** cuando se necesite una glifos/ilustrativa (ya cargado en `index.html`).
- Stroke uniforme: 1.8px en iconos UI.
- Tamaños estándar: `w-4 h-4` (16px) en línea, `w-5 h-5` (20px) en sidebar/tablas, `w-6 h-6` (24px) en empty states.

## 4. Estados de un ticket (jerarquía visual)

| Estado | Badge | Color | Color de texto | Dot de énfasis |
|--------|-------|-------|----------------|----------------|
| `recibido` | `badge-recibido` | `slate-100` | `slate-700` | `slate-400` |
| `asignado` | `badge-asignado` | `blue-100` | `blue-800` | `blue-500` |
| `en_proceso` | `badge-en_proceso` | `amber-100` | `amber-800` | `amber-500` |
| `solucionado` | `badge-solucionado` | `emerald-100` | `emerald-800` | `emerald-500` |
| `cerrado` | `badge-cerrado` | `slate-300` | `slate-800` | — |
| `reabierto` | `badge-reabierto` | `orange-100` | `orange-800` | `orange-500` |

**Prioridad:** baja (slate), media (blue), alta (amber), urgente (red). Cada badge incluye un dot de color a la izquierda para daltónicos (no depender solo del color).

## 5. Componentes base (referencia rápida)

- **Botones:** `.btn` (base), `.btn-primary` (CTA), `.btn-accent` (crítico), `.btn-secondary` (secundario), `.btn-ghost` (terciario), `.btn-danger` (destructivo), `.btn-sm` (compacto).
  - **Altura mínima:** 40px desktop, **44px touch** en mobile (`.btn` ya cumple en desktop; en mobile aplicar `min-h-[44px]`).
  - **Loading:** disabled + texto cambiado a "Creando…" / "Enviando…".
- **Inputs:** `.input` con label visible, helper text debajo, error inline.
- **Card:** `.card` (padding 5, shadow-card) y `.card-tight` (sin padding para tablas).
- **Modal:** `openModal({ title, body, actions, size })` — title con `textContent` (NUNCA `html` para evitar XSS).
- **Chat-bubble:** max-w 80%, esquinas asimétricas (`rounded-br-sm` para "me", `rounded-bl-sm` para "other").

## 6. Layout

- **Breakpoints:** 375 (mobile) · 768 (md) · 1024 (lg) · 1440 (xl).
- **Sidebar:** fija en ≥md (w-64), drawer con backdrop en <md.
- **Topbar:** h-16 fija, contexto + search + acciones + campana + usuario.
- **Container:** `max-w-7xl mx-auto p-4 md:p-6`.
- **Safe areas:** respetar notch y gesture bar en iOS — `env(safe-area-inset-*)` en header/topbar.

## 7. Reglas críticas (NO NEGOCIABLES)

1. **Touch targets ≥ 44×44pt.** Cualquier `btn-icon` debe medir al menos 44×44. Aplicar `min-w-[44px] min-h-[44px]` y/o `hitSlop` equivalente.
2. **Contraste mínimo 4.5:1** en texto contra su fondo. Verificar `text-slate-400` sobre `bg-surface` (#F7F9FC) — usar `text-slate-500` o más oscuro.
3. **Aria-label** en todo botón icon-only (campana, ayuda, refresh, cerrar modal, cerrar sesión).
4. **No `html` en titles de modal** — usar `textContent`. Para títulos con formato, usar `<h3>` y nodos hijos.
5. **NO emojis como iconos UI.** Reemplazar por SVG/Material Symbols.
6. **Reduced motion:** todos los `animate-*` deben envolverse en `@media (prefers-reduced-motion: no-preference)`.
7. **Auto-cierre de toasts** en 4s, con `aria-live="polite"` para lectores de pantalla.
8. **Confirmación destructiva:** cerrar ticket y desactivar usuario usan `confirmModal` con `danger: true` y texto explícito.

## 8. Estados vacíos (empty states)

Toda vista de datos debe tener:
- Icono grande (48-64px) neutro.
- Título: "Sin [entidad] todavía" / "No hay coincidencias".
- Subtítulo: acción sugerida o filtro activo.
- CTA opcional (ej. "+ Nuevo ticket" en lista vacía de supervisor).

## 9. Loading & feedback

- < 300ms: nada (transición parece instantánea).
- 300ms-1s: skeleton en línea (3 barras, shimmer).
- > 1s: skeleton + texto "Cargando…".
- Acciones: botón disabled + texto "Enviando…/Creando…/Subiendo…".
- Realtime: indicador "En vivo" con dot pulsante (ya en `notifications.js`).

## 10. Exportes

- **Excel:** primary action en `/tickets` y `/reports`, con icono de download (no emoji).
- **PDF por ticket:** secondary action en header de detalle, con icono download.
- Ambos deshabilitados cuando `total === 0`.

---

## Anti-patterns a evitar

- ❌ Mezclar emoji + SVG en la misma jerarquía.
- ❌ Hardcodear `#071D4C` en un componente.
- ❌ `hover:` como única forma de descubrir funcionalidad (sin equivalente en touch).
- ❌ Re-render completo de página cuando llega un evento realtime — preferir actualización quirúrgica.
- ❌ Tabla con scroll horizontal en <768px — usar cards apiladas.
- ❌ Modal con scroll del body bloqueado (ya está OK, verificar al cambiar).
- ❌ Chat-bubble "me" a la derecha cuando no hay "yo" claro (ticket multi-actor).
