/* Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. */
// Componentes del módulo Login (scope aislado).
// Solo este archivo y client/views/login.js los consumen.
// No exportar desde aquí hacia otros módulos.

import { h } from '../utils/dom.js';
import { ICON, svg } from '../utils/icons.js';

// ───────────────────────────────────────────────────────────────────────
// BrandLockup — logo + nombre + tagline + línea auxiliar
// ───────────────────────────────────────────────────────────────────────
export function BrandLockup({
  name = 'GCM Tickets',
  tagline = 'Sala de control',
  location = 'Acceso corporativo seguro',
  logoSrc = '/img/Logo.png',
  href = '/',
} = {}) {
  const inner = h('a.login-brand', { href, 'aria-label': `${name} — Inicio` }, [
    h('img.login-brand-logo', {
      src: logoSrc,
      alt: '',
      width: 40,
      height: 40,
      loading: 'eager',
      decoding: 'async',
    }),
    h('div.flex.flex-col.leading-tight', {}, [
      h('span.login-brand-name', {}, name),
      tagline ? h('span.login-brand-tag', {}, tagline) : null,
      location ? h('span.login-brand-meta', {}, location) : null,
    ]),
  ]);
  return inner;
}

// ───────────────────────────────────────────────────────────────────────
// LoginField — input con icono izquierdo, helper, estados y a11y
// ───────────────────────────────────────────────────────────────────────
export function LoginField({
  id,
  label,
  type = 'text',
  icon,
  autocomplete,
  placeholder = '',
  autofocus = false,
  value = '',
  inputmode,
  autocapitalize,
  autocorrect,
  spellcheck,
  required = true,
  helper = '',
  onInput,
  describedBy,
  invalid = false,
}) {
  const labelEl = h('label.label.text-white\\/85.text-\\[12\\.5px\\].font-medium', {
    for: id,
  }, [label, required ? h('span.text-brand-ocean\\/80.ml-0\\.5', { 'aria-hidden': 'true' }, '·') : null]);

  const wrap = h('div.login-input-wrap', {});
  const iconEl = icon
    ? h('span.login-input-icon', { 'aria-hidden': 'true' }, [svg(h, icon, 'w-4 h-4')])
    : null;

  const input = h('input.input.pl-10', {
    id,
    type,
    autocomplete,
    placeholder,
    autofocus: autofocus || undefined,
    value: value || undefined,
    inputmode: inputmode || undefined,
    autocapitalize: autocapitalize || undefined,
    autocorrect: autocorrect || undefined,
    spellcheck: spellcheck ? 'true' : spellcheck === false ? 'false' : undefined,
    required: required || undefined,
    'aria-invalid': invalid ? 'true' : undefined,
    'aria-describedby': describedBy || undefined,
  });
  if (typeof onInput === 'function') input.addEventListener('input', onInput);

  if (iconEl) {
    input.addEventListener('focus', () => iconEl.classList.add('login-input-icon-active'));
    input.addEventListener('blur', () => iconEl.classList.remove('login-input-icon-active'));
  }
  if (iconEl) wrap.appendChild(iconEl);
  wrap.appendChild(input);

  const helperEl = helper
    ? h('p.login-input-helper', { id: `${id}-helper` }, helper)
    : null;

  const node = h('div.space-y-1\\.5', {}, [labelEl, wrap, helperEl]);
  return { node, input };
}

// ───────────────────────────────────────────────────────────────────────
// PasswordField — LoginField + show/hide + caps lock warning
// ───────────────────────────────────────────────────────────────────────
export function PasswordField({
  id = 'password',
  label = 'Contraseña',
  placeholder = '••••••••••',
  autocomplete = 'current-password',
  autofocus = false,
  capsWarning = true,
  required = true,
  describedBy,
  invalid = false,
}) {
  const labelEl = h('label.label.text-white\\/85.text-\\[12\\.5px\\].font-medium', {
    for: id,
  }, [label, required ? h('span.text-brand-ocean\\/80.ml-0\\.5', { 'aria-hidden': 'true' }, '·') : null]);

  const wrap = h('div.login-input-wrap', {});

  const lockIcon = h('span.login-input-icon', { 'aria-hidden': 'true' }, [svg(h, 'lock', 'w-4 h-4')]);
  wrap.appendChild(lockIcon);

  const input = h('input.input.pl-10.pr-11', {
    id,
    type: 'password',
    autocomplete,
    placeholder,
    autofocus: autofocus || undefined,
    spellcheck: 'false',
    autocapitalize: 'off',
    autocorrect: 'off',
    required: required || undefined,
    'aria-invalid': invalid ? 'true' : undefined,
    'aria-describedby': describedBy || undefined,
  });
  input.addEventListener('focus', () => lockIcon.classList.add('login-input-icon-active'));
  input.addEventListener('blur', () => lockIcon.classList.remove('login-input-icon-active'));

  // Toggle de visibilidad — type="button" para no disparar submit.
  const toggle = h('button.login-toggle', {
    type: 'button',
    'aria-label': 'Mostrar contraseña',
    tabindex: '0',
  }, [svg(h, 'eye', 'w-4 h-4')]);
  toggle.addEventListener('click', () => {
    const visible = input.type === 'text';
    input.type = visible ? 'password' : 'text';
    toggle.setAttribute('aria-label', visible ? 'Mostrar contraseña' : 'Ocultar contraseña');
    toggle.firstElementChild.replaceWith(svg(h, visible ? 'eye' : 'eyeOff', 'w-4 h-4'));
  });
  wrap.appendChild(input);
  wrap.appendChild(toggle);

  // Caps Lock warning (live region, polite).
  const caps = h('div.hidden.text-\\[11\\.5px\\].text-amber-200\\/90.flex.items-center.gap-1\\.5.mt-1', {
    role: 'status',
    'aria-live': 'polite',
  }, [svg(h, 'capsLock', 'w-3.5 h-3.5'), h('span', {}, 'Bloq Mayús está activado.')]);

  if (capsWarning) {
    const checkCaps = (e) => {
      const on = e.getModifierState && e.getModifierState('CapsLock');
      caps.classList.toggle('hidden', !on);
    };
    input.addEventListener('keydown', checkCaps);
    input.addEventListener('keyup', checkCaps);
    input.addEventListener('blur', () => caps.classList.add('hidden'));
  }

  const node = h('div.space-y-1\\.5', {}, [labelEl, wrap, caps]);
  return { node, input };
}

// ───────────────────────────────────────────────────────────────────────
// LoginCheckbox — recordarme (custom-styled, área click amplia)
// ───────────────────────────────────────────────────────────────────────
export function LoginCheckbox({ id = 'remember', label = 'Recordarme en este equipo', checked = false }) {
  const row = h('label.login-checkbox-row', { for: id });
  const cb = h('input.login-checkbox', {
    type: 'checkbox',
    id,
    checked: checked || undefined,
    'aria-describedby': `${id}-hint`,
  });
  row.appendChild(cb);
  row.appendChild(h('span.label-text', {}, label));
  return row;
}

// ───────────────────────────────────────────────────────────────────────
// PrimaryButton — submit con spinner inline
// ───────────────────────────────────────────────────────────────────────
export function PrimaryButton({ label = 'Ingresar', loadingLabel = 'Verificando…', loading = false, type = 'submit' }) {
  const btn = h('button.btn.btn-primary.w-full.login-submit.gap-2.font-medium', {
    type,
    'aria-busy': loading ? 'true' : undefined,
    disabled: loading || undefined,
  });

  const render = () => {
    btn.innerHTML = '';
    if (loading) {
      btn.appendChild(makeSpinnerSVG());
    } else {
      // icono login al lado del label (al entrar, no al cargar)
      btn.appendChild(svg(h, 'login', 'w-4 h-4'));
    }
    const text = h('span.tracking-\\[0\\.005em\\]', {}, loading ? loadingLabel : label);
    btn.appendChild(text);
  };
  render();

  return btn;
}

function makeSpinnerSVG() {
  const NS = 'http://www.w3.org/2000/svg';
  const s = document.createElementNS(NS, 'svg');
  s.setAttribute('class', 'spinner w-4 h-4 animate-spin');
  s.setAttribute('fill', 'none');
  s.setAttribute('stroke', 'currentColor');
  s.setAttribute('stroke-width', '2');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(NS, 'path');
  p.setAttribute('stroke-linecap', 'round');
  p.setAttribute('stroke-linejoin', 'round');
  p.setAttribute('d', 'M21 12a9 9 0 11-6.2-8.55');
  s.appendChild(p);
  return s;
}

// ───────────────────────────────────────────────────────────────────────
// Banner — error / warning / info (3 canales, sin border-left)
// ───────────────────────────────────────────────────────────────────────
export function Banner({ message, variant = 'error', id }) {
  const cls = {
    error:   'login-banner login-banner-error',
    warning: 'login-banner login-banner-warning',
    info:    'login-banner login-banner-info',
  }[variant] || 'login-banner login-banner-info';

  const iconName = variant === 'warning' ? 'alert' : variant === 'info' ? 'shield' : 'alert';
  const role = variant === 'error' ? 'alert' : 'status';
  const live = variant === 'error' ? 'assertive' : 'polite';

  return h('div.' + cls, { id, role, 'aria-live': live }, [
    svg(h, iconName, 'login-banner-icon'),
    h('span.flex-1', {}, message),
  ]);
}

// ───────────────────────────────────────────────────────────────────────
// Divider — separador con label (continuar con SSO, etc.)
// ───────────────────────────────────────────────────────────────────────
export function Divider({ label = 'o continúa con' }) {
  return h('div.login-divider', {}, [h('span', {}, label)]);
}

// ───────────────────────────────────────────────────────────────────────
// Capability — fila con icono + título + subtítulo (panel lateral)
// ───────────────────────────────────────────────────────────────────────
export function Capability({ title, subtitle, icon = 'check' }) {
  return h('div.login-cap', {}, [
    h('span.login-cap-icon', { 'aria-hidden': 'true' }, [svg(h, icon, 'w-3.5 h-3.5')]),
    h('div.min-w-0', {}, [
      h('div.login-cap-title', {}, title),
      subtitle ? h('div.login-cap-sub', {}, subtitle) : null,
    ]),
  ]);
}

// ───────────────────────────────────────────────────────────────────────
// SystemStatus — dot + label, datos reales
// ───────────────────────────────────────────────────────────────────────
export function SystemStatus({ status = 'ok', since } = {}) {
  const dotClass = status === 'degraded' ? 'login-status-dot degraded' : 'login-status-dot ok';
  const label = status === 'degraded' ? 'Servicio parcial' : 'Sistema operativo';
  const tail = since ? ` desde ${formatSince(since)}` : '';
  return h('div.login-status', { role: 'status', 'aria-live': 'polite' }, [
    h('span.' + dotClass, { 'aria-hidden': 'true' }),
    h('span', {}, `${label}${tail}`),
  ]);
}

function formatSince(since) {
  let d;
  try { d = since instanceof Date ? since : new Date(since); } catch { return ''; }
  if (Number.isNaN(d.getTime())) return '';
  try {
    return d.toLocaleDateString('es', { month: 'short', year: 'numeric' });
  } catch {
    return d.toISOString().slice(0, 7);
  }
}

// ───────────────────────────────────────────────────────────────────────
// SupportRow — único canal neutro (centro de ayuda). Sin email ni teléfono
// pre-login para no filtrar datos de contacto en la página pública.
// ───────────────────────────────────────────────────────────────────────
export function SupportRow({ helpHref = '/ayuda' } = {}) {
  const items = [];
  if (helpHref) {
    items.push(h('a', { href: helpHref }, [svg(h, 'help', 'w-3.5 h-3.5'), 'Centro de ayuda']));
  }
  return h('div.login-support', {}, items);
}
