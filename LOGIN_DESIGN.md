# Login — Diseño (módulo aislado)

> Registro del estado construido. Refleja `client/views/login.js` + `client/components/login.js` + `client/styles.css` + `client/utils/icons.js`. Si cambia uno de esos archivos, actualizar aquí.

---

## 1. Estructura

### 1.1 Layout

- **Mobile (< lg):** stack vertical, video de fondo activo con overlay navy translúcido. Panel lateral (`.login-side`) oculto (`hidden lg:flex`).
- **Desktop (≥ lg):** split 60/40 implementado como `flex-[3] / flex-[2]`. Sin SSO, sin registro público, sin segunda vía: una sola entrada al sistema.

```
.root  (.login-root, min-h-[100dvh], flex, bg-brand, text-white)
├── .login-video-bg        z-0 absoluto  (video + overlay; data-video-failed solo si MP4 falla)
├── .login-grid            z-10 relative flex-1 flex flex-col lg:flex-row min-h-0
│   ├── .login-aside       flex-[3]  (superficie de tarea)
│   │   ├── .login-aside-inner
│   │   │   ├── <BrandLockup>             logo + name + tagline + línea auxiliar
│   │   │   ├── .login-card (glass navy-tinted, p-7 sm:p-9)
│   │   │   │   ├── .login-card-head       (eyebrow + h2 + sub)
│   │   │   │   ├── <form>
│   │   │   │   │   ├── <LoginField>        usuario (icon user, helper)
│   │   │   │   │   ├── <PasswordField>     contraseña (icon lock + show/hide + caps warning)
│   │   │   │   │   ├── .login-form-row     (remember · olvidé mi acceso)
│   │   │   │   │   ├── errorBox (oculto)   <Banner variant="error">
│   │   │   │   │   ├── hintBox  (oculto)   <Banner variant="warning"> tras 3 intentos
│   │   │   │   │   ├── <PrimaryButton>     (login icon + label; spinner cuando loading)
│   │   │   │   │   └── .login-card-foot     (lock-dot + cifrado + caducidad + legal)
│   │   │   ├── .login-aside-foot
│   │   │   │   ├── <SystemStatus>          dot + label + desde + región (datos reales)
│   │   │   │   └── <SupportRow>            mail · tel · centro de ayuda
│   ├── .login-side        flex-[2] hidden lg:flex (superficie de contexto)
│   │   ├── .login-side-inner
│   │   │   ├── <sideHead>                  eyebrow + h2 + lede
│   │   │   ├── 4× <Capability>             check ocean + título + subtítulo
│   │   │   └── .login-side-foot
│   │   │       └── "Plataforma de tickets · v1" (icono shield, neutro)
```

### 1.2 Background

- **Video siempre activo.** El `<video>` carga `/videos/DJI_0495.MP4` con `muted autoplay loop playsinline preload="metadata"`. El `preload="metadata"` descarga solo los metadatos del primer frame para que arranque rápido sin tirar el archivo entero. El `poster="/img/Logo.png"` cubre el frame inicial mientras se carga. `aria-hidden="true"` en `<video>` y en el wrapper (decorativo).
- **Overlay translúcido navy.** `.login-video-overlay` aplica dos viñetas suaves (ocean top-left al 6%, navy bottom-right al 30%) y un degradado vertical navy del 32% al 62%. La capa es lo bastante delgada para que el footage se vea, lo bastante opaca para que el card glass tenga contraste consistente.
- **Card glass navy-tinted.** `.login-card` usa `linear-gradient(180deg, rgba(7,29,76,0.32), rgba(7,29,76,0.18))` con `backdrop-blur-2xl`. El tinte es azul marino de marca, no blanco lechoso: el navy manda incluso en la translucidez. Borde `white/22`, highlight superior y sombras de marca como antes.
- **Fallback real, no por defecto.** El listener `error` del `<video>` setea `data-video-failed="true"` solo si el MP4 falla la decodificación. Cuando eso pasa, el CSS oculta `.login-bg-video` y `.login-video-overlay` y queda el fondo brand del root (gradiente + grain + viñetas ocean). No se asume fallo al inicio.
- **Card animation de entrada:** `login-card-in 220ms cubic-bezier(.2,.7,.2,1) both`. Honrado por `prefers-reduced-motion` global.
- **Fallback de transparencia.** `@media (prefers-reduced-transparency: reduce)` lleva el card a `linear-gradient(180deg, rgba(7,29,76,0.94), rgba(68,73,123,0.92))` con `backdrop-filter: none`. El card sigue siendo navy (no blanco), con un toque de `#44497B` (brand-deep) abajo para profundidad.

### 1.3 Datos que NO se exponen (política de login público)

- Sin ubicación física (ciudad, país).
- Sin teléfonos ni correos de soporte en la UI pre-login.
- Sin build SHA, env ni reloj local (filtrarían entorno y zona).
- Sin nombre de equipo interno ("Operaciones internas" / similar).
- Sin assets personales (videos, fotos).

---

## 2. Componentes

Todos viven en **`client/components/login.js`** (módulo nuevo, no exporta a otros sitios).

### 2.1 `<BrandLockup>`

- **Props:** `name`, `tagline`, `location`, `logoSrc` (default `/img/Logo.png`), `href` (default `/`).
- **Render:** `<a class="login-brand">` con logo 40×40 + columna (name · tag · meta). Es un link al home (`aria-label` completo).
- **Tagline actual:** *"Sala de control"* (alineado con North Star).

### 2.2 `<LoginField>`

- **Props:** `id`, `label`, `type`, `icon`, `autocomplete`, `placeholder`, `autofocus`, `value`, `inputmode`, `autocapitalize`, `autocorrect`, `spellcheck`, `required`, `helper`, `onInput`, `describedBy`, `invalid`.
- **Render:** `<label>` con bullet ocean `·` (visual de requerido) + `.login-input-wrap` con icono posicionado (`.login-input-icon`) + `<input.input.pl-10>` + `<p.login-input-helper>` opcional.
- **Estados (todos en CSS):**
  - **Rest:** border `white/15`, bg `white/[0.06]` (definido en `.login-card .input`).
  - **Hover:** border sube a `white/22`, bg `white/[0.09]` (no en focus).
  - **Focus:** border `brand-ocean`, bg `white/[0.10]`, ring `box-shadow: 0 0 0 4px rgba(22,172,228,0.18)`. Icono recibe clase `.login-input-icon-active` (`text-brand-ocean`).
  - **Invalid:** border `var(--color-accent)` (`#CF301D`), ring `box-shadow: 0 0 0 4px rgba(207,48,29,0.18)`, helper recibe `.login-input-helper-error` (texto `red-300`).
- **A11y:** `<label for>` + `aria-invalid` cuando hay error + `aria-describedby` apunta al helper.

### 2.3 `<PasswordField>` (extiende `LoginField`)

- **Props:** `id`, `label`, `placeholder` (default `••••••••••`), `autocomplete` (default `current-password`), `autofocus`, `capsWarning` (default `true`), `required`, `describedBy`, `invalid`.
- **Añade:**
  - Icono `lock` a la izquierda (no `login`).
  - **Toggle show/hide** (`button.login-toggle`, `type="button"`) con `ICON.eye` ↔ `ICON.eyeOff`. `aria-label` dinámico ("Mostrar/Ocultar contraseña").
  - **Caps Lock detector:** `keydown`/`keyup` consultan `getModifierState('CapsLock')`. Cuando activo, muestra `<div role="status" aria-live="polite">` con `ICON.capsLock` + texto *"Bloq Mayús está activado."*. Se oculta en `blur`.
  - Atributos fijos: `spellcheck="false"`, `autocapitalize="off"`, `autocorrect="off"`.

### 2.4 `<LoginCheckbox>`

- **Props:** `id` (default `remember`), `label` (default *"Recordarme en este equipo"* — `login.js` lo sobreescribe a *"Recordarme en este dispositivo"* en la llamada real), `checked`.
- **Render:** `<label.login-checkbox-row>` con `<input.login-checkbox>` + `<span.label-text>`. El checkbox custom es **16×16 px** (`w-[16px] h-[16px]`, no 18), border `white/35`, bg `white/[0.04]`. Checked: `bg-brand-ocean border-brand-ocean` con check blanco SVG (`stroke-width=3.2`). Focus ring 2px `brand-ocean/60` (WCAG AA sobre glass).
- **Touch target:** la fila `.login-checkbox-row` mide 28px de alto (`min-h-[28px] py-1`), garantizando WCAG sin inflar el control visual.

### 2.5 `<PrimaryButton>`

- **Props:** `label` (default *"Ingresar"*), `loadingLabel` (default *"Verificando…"*), `loading`, `type`.
- **Render:** `<button.btn.btn-primary.w-full.login-submit>` con `aria-busy` cuando loading.
- **Contenido:**
  - **Rest:** `ICON.login` 16px + label.
  - **Loading:** spinner inline (`makeSpinnerSVG`, `animate-spin`, stroke 2) + label cambia a "Verificando…".
- **Spinner:** hereda `currentColor`, mantiene focus ring aunque esté disabled (a11y: no robar foco).

### 2.6 `<Banner>`

- **Props:** `message`, `variant` (`'error' | 'warning' | 'info'`, default `'error'`), `id?`.
- **Render:** `.login-banner` + variante. Icono 16px + texto.
- **Variantes (CSS):**
  - `error`: bg `accent/[0.08]`, border `accent/30`, texto `red-100`, icono `red-300`. `role="alert"` + `aria-live="assertive"`.
  - `warning`: bg `amber-500/[0.08]`, border `amber-400/25`, texto `amber-100`, icono `amber-300`. `role="status"` + `aria-live="polite"`.
  - `info`: bg `brand-ocean/[0.08]`, border `brand-ocean/30`, texto `white/85`, icono `brand-ocean`. `role="status"` + `aria-live="polite"`.
- **Icon mapping:** `error → alert`, `warning → alert`, `info → shield`.
  - `error` y `warning` comparten `alert` intencionalmente: ambos requieren atención, el color (rojo vs ámbar) lleva la severidad.
  - `info` usa `shield` porque comunica "sistema/información de servicio", no "alerta". Distinción semántica, no decorativa.
  - Si en el futuro se añade `ICON.info` (círculo con `i`), `warning` puede migrar a un icono distintivo y dejar `alert` para `error` exclusivamente. Hoy no se justifica añadir un icono nuevo solo para esto.

### 2.7 `<Divider>`

- **Props:** `label` (default *"o continúa con"*).
- **Render:** `.login-divider` con `::before/::after` líneas blancas al 12% y label centrado (`text-[11.5px] uppercase tracking-widest text-white/45`).

### 2.8 `<Capability>`

- **Props:** `title`, `subtitle`, `icon` (default `check`).
- **Render:** `.login-cap` con `.login-cap-icon` (ocean, 14px) + columna (`.login-cap-title` 13.5px semibold + `.login-cap-sub` 12px `text-white/55`).

### 2.9 `<SystemStatus>`

- **Props:** `status` (`'ok' | 'degraded'`, default `'ok'`), `since?` (string ISO o Date).
- **Render:** `.login-status` (`role="status"` `aria-live="polite"`) con `.login-status-dot.ok|degraded` 6px + label.
  - **ok:** `bg-brand-ocean` + halo `rgba(22,172,228,0.18)` + *"Sistema operativo desde {mes año}"* (tail solo si hay `since`; sin `since`, label corto: *"Sistema operativo"*).
  - **degraded:** `bg-accent` + halo `rgba(207,48,29,0.18)` + *"Servicio parcial"* (sin tail — el modo degradado es ahora, no desde cuándo).
- **Datos:** `since` viene de `window.__GCM_CONFIG__` (no inventado). **No** lee `region` — la región se omite en el login público.

### 2.10 `<SupportRow>`

- **Props:** `helpHref` (default `/ayuda`).
- **Render:** `.login-support` con un único link (`/ayuda`) con icono 14px (`help`) + texto *"Centro de ayuda"`. Hover sube a `text-white` (regla: `text-white/70 hover:text-white`).
- **Comportamiento:** si `helpHref` es falsy (`null`/`''`/`undefined`), el link se omite y el contenedor queda vacío. Útil para builds donde el centro de ayuda no está deployado.
- **Política:** no acepta `supportEmail` ni `supportPhone`. El canal de soporte pre-login es únicamente el centro de ayuda — el email y el teléfono solo aparecen en el panel autenticado.

### 2.11 Eliminado: `<BuildChip>` · `<ClockChip>`

- Removidos del módulo. Filtraban SHA de build y zona horaria local. Si se necesitan en el futuro, deben ser sustituidos por un componente "estado del sistema" en el panel autenticado, no en el login público.

---

## 3. Comportamiento UX

| # | Cambio | Detalle | A11y |
|---|---|---|---|
| 1 | **Show/hide de contraseña** | Toggle con `eye` ↔ `eyeOff`, `aria-label` dinámico. | `aria-label` cambia; sin live region. |
| 2 | **Caps Lock detector** | `keydown/keyup` → `getModifierState('CapsLock')`. Se oculta en `blur`. | `role="status"` + `aria-live="polite"`. No bloquea submit. |
| 3 | **Spinner dentro del botón** | Spinner SVG inline (no cambio de texto). Label cambia a "Verificando…" para redundancia visual. | `aria-busy="true"` durante loading. |
| 4 | **Mensajes de error específicos** | `describeError(err)` mapea `401 → invalid_credentials`, `429 → rate_limited`, `5xx → server_error`, `code → ERROR_COPY[code]`, `!navigator.onLine → network_error`, fallback `err.message`. | `role="alert"` + `aria-live="assertive"`. |
| 5 | **3 intentos → pista de recuperación** | Tras 3 intentos fallidos, banner amarillo sugiere *"Si no recuerdas tu contraseña, usa 'Olvidé mi acceso' o contacta a soporte para restablecerla."* | `role="status"`, `aria-live="polite"`. |
| 6 | **Focus post-error** | Si `401`, foco vuelve a password + `select()`. Otros errores: foco se queda donde está. | Manual, sin saltar a un botón de acción forzado. |
| 7 | **`?next=URL` respetado** | `renderLogin({ query })` lee `query.next` y lo guarda en `sessionStorage['gcm:postLoginNext']` antes de llamar `onLogin(u)`. | — |
| 8 | **Sin registro público** | Confirmado por brief. El form no sugiere auto-registro; copy del eyebrow es *"Acceso corporativo"*. | — |
| 9 | **`autocomplete="username"`** | No `email`. Usuarios pueden entrar por `jperez` o por correo. | Atributo HTML correcto. |
| 10 | **Atajo `/` para focus** | Listener `keydown` en root: si foco no está en `input/textarea/select`, `/` mueve foco a username. | No anuncia; documentado en `login-card-foot` (futuro copy). |
| 11 | **Submit con `Enter` desde cualquier campo** | Implícito con `<form>`. `show/hide` con `Enter` no dispara submit (`type="button"`). | Flag local `state.busy` previene doble submit. |
| 12 | **Mobile: teclado y paste** | `inputmode="text"` en username; password con `autocapitalize="off"`, `autocorrect="off"`, `spellcheck="false"`. | Previene autocaps en iOS/Android. |
| 13 | **Recuperación de sesión** | Si cookie válida, redirige antes de mostrar login. (Comportamiento gestionado en `app.js`, no en `renderLogin`.) | — |
| 14 | **Video background fallback** | Si `video.error`, `data-video-failed="true"` en root → CSS oculta `.login-bg-video` y `.login-video-overlay`, queda `bg-brand` sólido. | `aria-hidden="true"` en `<video>`. |

---

## 4. UI — tokens y reglas aplicadas

### 4.1 Tokens usados (sin nuevos)

Todos los valores vienen de `DESIGN_SYSTEM.md §2`:

- **Color base:** `brand` (`#071D4C`) de fondo del root.
- **Acento del card:** `brand-ocean` (`#16ACE4`) para focus ring, dot de check en capabilities, link "Olvidé mi acceso" en hover, dot de status `ok`, fill de checkbox checked.
- **Error:** `accent` (`#CF301D`) como tinte de borde/icono; texto en `red-100`/`red-300`.
- **Warning:** `amber-400/25` para borde, `amber-100`/`amber-300` para texto/icono (no es accent — un warning no es un error crítico).
- **Texto:** blanco con jerarquía por opacidad — `text-white` (label/input), `text-white/85` (label form, banner info), `text-white/75` (login-link), `text-white/70` (login-status, login-side-lede, side-foot "Plataforma"), `text-white/65` (sub card, lock-dot meta), `text-white/55` (helper, sub capability, support row, aside-foot), `text-white/45` (eyebrow side, divider).
- **Borde:** `border-white/15` (input rest), `border-white/16` (card glass en `.login-card`), `border-white/35` (checkbox rest).
- **Radius:** `rounded-[28px]` para `.login-card` (no `rounded-[2rem]` 32px como decía doc anterior — código real usa 28px; equivalente a `rounded-3xl` con 1px menos, queda en la franja de "feature surface" del sistema); `rounded-md` 8 px (inputs, botones); `rounded-[4px]` (checkbox, focus-ring de link); `rounded-lg` (banners).
- **Sombra:** card usa `box-shadow` propio del glass (highlight superior 1px + sombra de marca 30/60 + secundaria 12/30). Focus de input: `box-shadow: 0 0 0 4px rgba(22,172,228,0.18)`. Focus de submit: `box-shadow: 0 0 0 4px rgba(22,172,228,0.30)` (sube a `/30` porque el botón es navy sólido, no glass — necesita más separación). Focus de link/toggle: `box-shadow: 0 0 0 3px rgba(22,172,228,0.30)`. **Nota WCAG:** la opacidad del ring del login es menor que en el shell (`/60`) porque el fondo es navy oscuro — el ring ocean ya tiene contraste suficiente a `/18` sobre `#071D4C`. La audit WCAG se hace por superficie, no global.
- **Tipografía:** `Title` 600 (h2 card 22-24px), `Label` 600 uppercase 0.18em (eyebrow, brand-tag), `Body` 400 (todo lo demás). Sin segunda familia.

### 4.2 Reglas con nombre aplicadas

- **The One Voice Rule.** Rojo solo en `Banner variant="error"` y elementos asociados. Nunca en link "Olvidé mi acceso" (ocean), ni en status ok (ocean), ni en Capability check (ocean).
- **The Ink-Not-Black Rule.** Texto del card no usa `text-slate-*`; usa `text-white` con opacidades. Placeholder `text-white/55` (definido en `.login-card .input::placeholder`).
- **The Color-Blind Rule.** Error = `border + icono + texto` (tres canales). Status = `dot + label + color` (tres canales). Caps warning = `icono + texto + color` (tres canales).
- **The Consistency Rule.** Botón submit dentro del card de 28 px sigue siendo 8 px. Inputs dentro del card siguen siendo 8 px. Checkbox 16×16 (no rompe escala — área click se expande con la `.login-checkbox-row` de 28px height que envuelve el control, garantizando touch target WCAG sin inflar el control visual).
- **The Single-Family Rule.** Iconos del login son `ICON.*` SVG (mismo set que el resto). No hay `material-symbols-outlined` en `login.js` actual.
- **No emoji / No celebratory copy.** Banners nunca usan `❌` o `🎉`. Copy es imperativo, profesional, en español.
- **No eyebrow uppercase tracked en cada sección.** Solo dos: `.eyebrow` en card-head ("Acceso corporativo") y `.login-side-eyebrow` en side-head ("Operación"). Ambos son deliberados.

### 4.3 Detalles visuales (estado actual)

| Zona | Estado |
|---|---|
| **Iconos input** | `ICON.user` (username), `ICON.lock` (password). Icono `text-white/50` en rest, `text-brand-ocean` en focus vía `.login-input-icon-active`. |
| **Border input** | `border-white/15` en rest, sube a `white/22` en hover, `brand-ocean` sólido en focus. Background `white/[0.06]` en rest, `white/[0.09]` en hover, `white/[0.10]` en focus. |
| **Placeholder** | `rgba(226, 232, 240, 0.55)` — slate-200/55 calibrado para secundario honesto sobre glass. |
| **Botón submit** | `.btn-primary.login-submit`, height 46px, `bg-brand` → `bg-brand-deep` en hover, `opacity-0.7` en disabled. Spinner inline durante loading (label cambia a "Verificando…"). |
| **Link "Olvidé mi acceso"** | `.login-link`: `text-white/75` en rest, `brand-ocean` en hover, ring `ocean/30` 3px en focus-visible. Sin underline. |
| **Checkbox remember** | 16×16 px (no 18×18 como decía el doc anterior), `border-white/35 bg-white/[0.04]` en rest, `bg-brand-ocean border-brand-ocean` con check blanco SVG en checked. Focus ring `brand-ocean/60` (WCAG AA, ver §4.1). |
| **Capabilities** | Icono ocean 14px dentro de `.login-cap-icon` (cuadrado 28×28 px `bg-brand-ocean/15 text-brand-ocean` redondeado `rounded-md`) + título 13.5px semibold + subtítulo 12px `text-white/55`. **4 ítems**, no 3 como decía el doc original. |
| **BrandLockup** | logo 40×40 (`rounded-full`, ring blanco translúcido 1px) + "GCM Tickets" (15px semibold) + "Sala de control" (10px uppercase ocean, `tracking-[0.18em]`) + location (11px white/55). **Location actual: "Acceso corporativo seguro"** (política del login público: no ciudad/país). |
| **H2 del card** | "Iniciar sesión" — `text-[22px] sm:text-[24px] font-semibold tracking-tight text-white leading-tight`. |
| **Sub del card** | "Ingresa con tus credenciales corporativas para gestionar tickets, reportes y asignaciones." — `text-[13.5px] text-white/65 leading-relaxed mt-1.5`. |
| **Eyebrow del card** | "Acceso corporativo" — uppercase 10px `tracking-[0.18em]` ocean, `mb-2`. |
| **Foot del card** | "Conexión cifrada TLS · La sesión caduca a los 7 días. Privacidad · Términos." con `.lock-dot` ocean/70 (6px) a la izquierda. Links `text-white/70 hover:text-white underline-offset-2 decoration-white/20`. |
| **Aside foot** | `<SystemStatus>` con `since` real (config, sin región) + `<SupportRow>` (único link: Centro de ayuda). Container: `text-[10.5px] uppercase tracking-[0.16em] text-white/45`. |
| **Side (hero derecho)** | eyebrow "Operación" (10px `tracking-[0.20em]` ocean) + h2 "Una vista del ciclo completo de tickets." (26-30px semibold) + lede (14px white/70, max-w-[42ch]) + **4 capabilities** + foot con "Plataforma de tickets · v1" (icono `shield`, neutro). |
| **SSO button** | Inline-styled (no en `styles.css`): 44px alto, bg `rgba(255,255,255,0.05)`, border `rgba(255,255,255,0.14)`, hover sube a `0.10`. `ICON.shield` + label "Acceder con el SSO de la empresa". **Placeholder — cablear SSO real cuando exista el endpoint.** |

### 4.4 CSS — fuente de verdad

Todas las clases viven en `client/styles.css` dentro de `@layer components`, sección **"Login Page Styles"** (líneas 220-583). Resumen por bloque:

```
Línea 226-236  .login-root (gradiente navy + grain + viñetas ocean; min-h-[100dvh])
Línea 239-263  .login-video-bg, .login-bg-video, .login-video-overlay (grain pseudo-elemento)
Línea 265-274  .login-video-overlay::after (grain SVG inline)
Línea 276-296  .login-card (glass; fallback prefers-reduced-transparency → brand-navy 88% alpha)
Línea 298-300  Fallback data-video-failed (oculta video + overlay)
Línea 302-340  .login-card .input (estados rest/hover/focus/invalid, height 46px), .btn-primary.login-submit
Línea 342-367  .login-grid, .login-aside, .login-side, .login-aside-inner, .login-side-inner (responsive padding)
Línea 369-385  .login-brand, .login-brand-logo, .login-brand-name, .login-brand-tag, .login-brand-meta
Línea 387-397  .login-card-head (eyebrow, h2, p)
Línea 399-411  .login-form-row, .login-link (con hover/focus ocean; focus-radius 4px)
Línea 413-425  .login-input-wrap, .login-input-icon, .login-input-icon-active, .login-input-helper(-error)
Línea 427-436  .login-toggle (eye button, 9×9 box, focus-ring 3px ocean/30)
Línea 438-456  .login-checkbox, .login-checkbox-row (focus-ring brand-ocean/60 — WCAG AA)
Línea 458-469  .login-divider (con ::before/::after flex lines)
Línea 471-490  .login-banner + 3 variantes (error/warning/info) + .login-banner-icon
Línea 492-501  .login-card-foot + .lock-dot + links
Línea 503-516  .login-aside-foot, .login-status, .login-status-dot (.ok/.degraded) — dot 6px con halo 3px
Línea 518-527  .login-side-eyebrow, .login-side h2, .login-side-lede
Línea 529-537  .login-cap, .login-cap-icon (cuadrado bg ocean/15), .login-cap-title, .login-cap-sub
Línea 539-546  .login-side-foot + .login-side-foot .pill (definido, no usado actualmente)
Línea 548-560  .login-support (link a Centro de ayuda) + .login-meta-mono (JetBrains Mono + tabular-nums)
Línea 562-564  .login-submit .spinner + cursor-progress en aria-busy
Línea 566-583  prefers-reduced-motion (animation login-card-in 220ms cubic-bezier, fallback 0.01ms global)
```

**No hay tokens nuevos.** Todos los valores referencian `--color-*` CSS variables o `brand-*` Tailwind.

### 4.5 Falsos positivos del hook `impeccable` (registrados, sin acción)

Tres hallazgos recurrentes que el linting marca pero son intencionales:

- **`gray-on-color` en `.login-status-dot.ok|degraded`** (`styles.css:514-516`): pseudo-elemento `dot` del `SystemStatus`, no texto. Color y fondo son el mismo tono por diseño (status indicator legible, ver `DESIGN.md §5 — Chips`).
- **`design-system-radius` 4px** (`.login-link:focus-visible` `styles.css:410`): radio del focus ring, no de superficie. Los tokens `6/8/12/16/32` son para superficies; los focus rings usan radio ligeramente inferior para envolver sin comerse esquinas. Convención análoga a los `rounded-[4px]` del checkbox (`styles.css:440`).
- **`design-system-font` JetBrains Mono** (`styles.css:559`): monospace con fallback al sistema (`ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`) usado en `.login-meta-mono` para datos numéricos operacionales (`tabular-nums`). La regla "Single-Family" de `DESIGN.md §3` aplica al texto de lectura; los datos numéricos (códigos de ticket, timestamps) legítimamente requieren monospace para alineación tabular.

### 4.6 Iconos — fuente de verdad

`client/utils/icons.js` exporta `ICON` con paths SVG (24×24, stroke-based). Entradas usadas en login:

```js
// Login base
user, lock, eye, eyeOff, capsLock, alert, check, shield

// Login profesionales (sin uso en login público — reservados para panel autenticado)
chevronR, arrowR, building, clock, globe, help, mail, phone, extLink, key, lockOpen, copy, login
```

> `help` se usa en `SupportRow` ("Centro de ayuda"). `mail`/`phone`/`clock`/`building` se mantienen en `ICON` para uso futuro dentro del panel autenticado; **no se renderizan en la pantalla de login**.

---

## 5. Scope (lo que NO toca este módulo)

- **Tokens** (`client/styles.css:9-19`, `tailwind.config.js`) — sin nuevos colores ni sombras.
- **Sidebar / Topbar / Dashboard / Tickets / Usuarios / Reportes / Notificaciones / Categorías** — fuera de scope.
- **Componentes compartidos** (`utils/icons.js`, `utils/dom.js`, `api.js`, `components/modal.js`, `components/chat.js`, etc.) — solo se **agregan** entradas a `ICON`, no se modifican exports existentes.
- **Rutas backend** — no se añaden endpoints nuevos (`/recuperar` ya existe).
- **SSO real** — el botón está como placeholder visual; cablear cuando exista el endpoint.
