# Login — Overrides

## Layout

- **Desktop (≥ lg):** grid 2 columnas — form a la izquierda (max-w-xl), hero a la derecha con gradient.
- **Móvil:** sólo form, full-width.

## Form (columna izquierda)

- Logo + nombre "GCM" arriba (`eyebrow text-xs uppercase tracking-[0.3em]`).
- H1 `text-3xl sm:text-4xl font-bold text-slate-900`: "Bienvenido al panel ejecutivo".
- Subtítulo `text-sm text-slate-600 max-w-2xl` con copy corporativo.
- Card `.card.p-8.space-y-6` envolviendo el form.
- Inputs:
  - Icono Material Symbols a la izquierda (`pl-10`).
  - Focus: icono cambia a `text-brand`.
- Opciones (recordar + olvidé): fila flexible, wrap en mobile.
- Submit: full-width, `py-3`, loading state con spinner.
- Footer: "SISTEMA OPERACIONAL · v4.12.0-STABLE" en `text-xs text-slate-500`.

## Hero (columna derecha, sólo ≥ lg)

- `login-hero` gradient: radial azul océano top-left + radial accent bottom-right sobre linear navy → deep navy.
- Eyebrow pill blanco semitransparente: "Control total".
- H2 `text-4xl font-bold text-white` con copy de producto.
- Párrafo `text-base text-slate-200` descriptivo.
- Stats grid 3 columnas (Uptime, Registros, Latencia) con valores `text-2xl font-bold text-white`.
- Dos blobs blur decorativos (`blur-3xl`) a 20% opacidad en esquinas.

## Accesibilidad

- `autocomplete` correcto: `username` / `current-password`.
- `autofocus` en usuario.
- Error inline con `aria-live="polite"`.
- Submit deshabilitado durante request para evitar doble envío.
