/* Documentado por: Miguel Flores */
import { h } from '../utils/dom.js';
import { ICON, svg } from '../utils/icons.js';

/**
 * Renderiza el bloque de marca (logo, nombre, tagline y ubicación) usado en la
 * pantalla de login, enlazado a la página de inicio.
 * @param {Object} [options] - opciones de configuración
 * @param {string} [options.name='GCM Tickets'] - nombre del producto
 * @param {string} [options.tagline='Sala de control'] - lema o subtítulo
 * @param {string} [options.location='Acceso corporativo seguro'] - texto de ubicación/contexto
 * @param {string} [options.logoSrc='/img/Logo.png'] - ruta de la imagen del logo
 * @param {string} [options.href='/'] - enlace de destino del bloque de marca
 * @returns {HTMLElement} elemento anchor con el logotipo y textos
 */
export function BrandLockup(
  {
    name = 'GCM Tickets',
    tagline = 'Sala de control',
    location = 'Acceso corporativo seguro',
    logoSrc = '/img/Logo.png',
    href = '/',
  } = {}
) {
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

/**
 * Renderiza un campo de formulario de login con label, ícono opcional, input y
 * texto de ayuda, soportando estados de error (aria-invalid) y accesibilidad.
 * @param {Object} params - configuración del campo
 * @param {string} params.id - id del input (y del label asociado)
 * @param {string} params.label - texto del label
 * @param {string} [params.type='text'] - tipo de input HTML
 * @param {string} [params.icon] - nombre del ícono a mostrar dentro del campo
 * @param {string} [params.autocomplete] - valor del atributo autocomplete
 * @param {string} [params.placeholder=''] - texto placeholder del input
 * @param {boolean} [params.autofocus=false] - si el input debe enfocarse automáticamente
 * @param {string} [params.value=''] - valor inicial del input
 * @param {string} [params.inputmode] - valor del atributo inputmode
 * @param {string} [params.autocapitalize] - valor del atributo autocapitalize
 * @param {string} [params.autocorrect] - valor del atributo autocorrect
 * @param {boolean} [params.spellcheck] - valor del atributo spellcheck
 * @param {boolean} [params.required=true] - si el campo es obligatorio
 * @param {string} [params.helper=''] - texto de ayuda debajo del input
 * @param {Function} [params.onInput] - callback del evento input
 * @param {string} [params.describedBy] - id del elemento que describe el campo (aria-describedby)
 * @param {boolean} [params.invalid=false] - marca el campo como inválido (aria-invalid)
 * @returns {{node: HTMLElement, input: HTMLElement}} nodo contenedor del campo y referencia al input
 */
export function LoginField(
  {
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
  }
) {
  const labelEl = h('label.label.font-medium', {
    class: 'text-white/85 text-[12.5px]',
    for: id,
  }, [label, required ? h('span', { class: 'text-brand-ocean/80 ml-0.5', 'aria-hidden': 'true' }, '·') : null]);

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

  const node = h('div', { class: 'space-y-1.5' }, [labelEl, wrap, helperEl]);
  return { node, input };
}

/**
 * Renderiza el campo de contraseña del login: incluye ícono de candado, botón
 * para mostrar/ocultar el valor y aviso opcional de Bloq Mayús activado.
 * @param {Object} params - configuración del campo
 * @param {string} [params.id='password'] - id del input
 * @param {string} [params.label='Contraseña'] - texto del label
 * @param {string} [params.placeholder] - texto placeholder del input
 * @param {string} [params.autocomplete='current-password'] - valor del atributo autocomplete
 * @param {boolean} [params.autofocus=false] - si el input debe enfocarse automáticamente
 * @param {boolean} [params.capsWarning=true] - si se debe mostrar el aviso de Bloq Mayús
 * @param {boolean} [params.required=true] - si el campo es obligatorio
 * @param {string} [params.describedBy] - id del elemento que describe el campo (aria-describedby)
 * @param {boolean} [params.invalid=false] - marca el campo como inválido (aria-invalid)
 * @returns {{node: HTMLElement, input: HTMLElement}} nodo contenedor del campo y referencia al input
 */
export function PasswordField(
  {
    id = 'password',
    label = 'Contraseña',
    placeholder = '••••••••••',
    autocomplete = 'current-password',
    autofocus = false,
    capsWarning = true,
    required = true,
    describedBy,
    invalid = false,
  }
) {
  const labelEl = h('label.label.font-medium', {
    class: 'text-white/85 text-[12.5px]',
    for: id,
  }, [label, required ? h('span', { class: 'text-brand-ocean/80 ml-0.5', 'aria-hidden': 'true' }, '·') : null]);

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

  const caps = h('div.hidden.flex.items-center.mt-1', {
    class: 'text-[11.5px] text-amber-200/90 gap-1.5',
    role: 'status',
    'aria-live': 'polite',
  }, [svg(h, 'capsLock', 'w-3.5 h-3.5'), h('span', {}, 'Bloq Mayús está activado.')]);

  if (capsWarning) {
    /**
     * Muestra u oculta el aviso de Bloq Mayús según el estado del modificador CapsLock.
     * @param {KeyboardEvent} e - evento de teclado
     * @returns {void}
     */
    const checkCaps = (e) => {
      const on = e.getModifierState && e.getModifierState('CapsLock');
      caps.classList.toggle('hidden', !on);
    };
    input.addEventListener('keydown', checkCaps);
    input.addEventListener('keyup', checkCaps);
    input.addEventListener('blur', () => caps.classList.add('hidden'));
  }

  const node = h('div', { class: 'space-y-1.5' }, [labelEl, wrap, caps]);
  return { node, input };
}

/**
 * Renderiza el checkbox de "recordarme" del formulario de login.
 * @param {Object} [params] - configuración del checkbox
 * @param {string} [params.id='remember'] - id del input checkbox
 * @param {string} [params.label='Recordarme en este equipo'] - texto de la etiqueta
 * @param {boolean} [params.checked=false] - estado inicial marcado/desmarcado
 * @returns {HTMLElement} elemento label que envuelve el checkbox y su texto
 */
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

/**
 * Renderiza el botón principal de envío del formulario de login, con ícono y
 * texto que cambian a estado "cargando" mientras se verifica el acceso.
 * @param {Object} params - configuración del botón
 * @param {string} [params.label='Ingresar'] - texto del botón en estado normal
 * @param {string} [params.loadingLabel='Verificando…'] - texto del botón en estado de carga
 * @param {boolean} [params.loading=false] - si el botón debe mostrar el estado de carga
 * @param {string} [params.type='submit'] - atributo type del botón HTML
 * @returns {HTMLElement} elemento button
 */
export function PrimaryButton(
  { label = 'Ingresar', loadingLabel = 'Verificando…', loading = false, type = 'submit' }
) {
  const btn = h('button.btn.btn-primary.w-full.login-submit.gap-2.font-medium', {
    type,
    'aria-busy': loading ? 'true' : undefined,
    disabled: loading || undefined,
  });

  /**
   * Redibuja el contenido interno del botón (ícono y texto) según el estado de carga.
   * @returns {void}
   */
  const render = () => {
    btn.innerHTML = '';
    if (loading) {
      btn.appendChild(makeSpinnerSVG());
    } else {
      btn.appendChild(svg(h, 'login', 'w-4 h-4'));
    }
    const text = h('span', { class: 'tracking-[0.005em]' }, loading ? loadingLabel : label);
    btn.appendChild(text);
  };
  render();

  return btn;
}

/**
 * Crea manualmente (vía DOM API, sin `h`) el ícono SVG de spinner animado usado
 * en el botón principal mientras se verifica el login.
 * @returns {SVGElement} elemento svg del spinner
 */
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

/**
 * Renderiza un cartel de alerta del formulario de login (error, warning o info)
 * con el rol ARIA y nivel de aria-live apropiados según su variante.
 * @param {Object} params - configuración del banner
 * @param {string} params.message - texto del mensaje a mostrar
 * @param {string} [params.variant='error'] - tipo de banner ('error', 'warning' o 'info')
 * @param {string} [params.id] - id del elemento, útil para aria-describedby
 * @returns {HTMLElement} elemento div con el banner
 */
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

/**
 * Renderiza un separador visual con texto centrado (ej. "o continúa con").
 * @param {Object} [params] - configuración del divisor
 * @param {string} [params.label='o continúa con'] - texto del separador
 * @returns {HTMLElement} elemento div del separador
 */
export function Divider({ label = 'o continúa con' }) {
  return h('div.login-divider', {}, [h('span', {}, label)]);
}

/**
 * Renderiza un ítem de "capacidad" del sistema (ícono, título y subtítulo opcional),
 * usado en la pantalla de login para listar funcionalidades destacadas.
 * @param {Object} params - configuración del ítem
 * @param {string} params.title - título de la capacidad
 * @param {string} [params.subtitle] - descripción breve opcional
 * @param {string} [params.icon='check'] - nombre del ícono a mostrar
 * @returns {HTMLElement} elemento div con el ítem de capacidad
 */
export function Capability({ title, subtitle, icon = 'check' }) {
  return h('div.login-cap', {}, [
    h('span.login-cap-icon', { 'aria-hidden': 'true' }, [svg(h, icon, 'w-3.5 h-3.5')]),
    h('div.min-w-0', {}, [
      h('div.login-cap-title', {}, title),
      subtitle ? h('div.login-cap-sub', {}, subtitle) : null,
    ]),
  ]);
}

/**
 * Renderiza el indicador de estado del sistema (operativo o parcial) mostrado
 * en la pantalla de login, con la fecha desde la que aplica si se provee.
 * @param {Object} [params] - configuración del indicador
 * @param {string} [params.status='ok'] - estado del sistema ('ok' o 'degraded')
 * @param {string|Date} [params.since] - fecha desde la cual aplica el estado
 * @returns {HTMLElement} elemento div con el indicador de estado
 */
export function SystemStatus({ status = 'ok', since } = {}) {
  const dotClass = status === 'degraded' ? 'login-status-dot degraded' : 'login-status-dot ok';
  const label = status === 'degraded' ? 'Servicio parcial' : 'Sistema operativo';
  const tail = since ? ` desde ${formatSince(since)}` : '';
  return h('div.login-status', { role: 'status', 'aria-live': 'polite' }, [
    h('span.' + dotClass, { 'aria-hidden': 'true' }),
    h('span', {}, `${label}${tail}`),
  ]);
}

/**
 * Formatea una fecha como mes y año abreviados en español (ej. "jul 2026"),
 * usado para mostrar desde cuándo aplica el estado del sistema.
 * @param {string|Date} since - fecha a formatear
 * @returns {string} fecha formateada, o cadena vacía si es inválida
 */
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

/**
 * Renderiza la fila de enlaces de soporte de la pantalla de login (ej. centro de ayuda).
 * @param {Object} [params] - configuración de la fila
 * @param {string} [params.helpHref='/ayuda'] - enlace al centro de ayuda; si es falsy no se muestra
 * @returns {HTMLElement} elemento div con los enlaces de soporte
 */
export function SupportRow({ helpHref = '/ayuda' } = {}) {
  const items = [];
  if (helpHref) {
    items.push(h('a', { href: helpHref }, [svg(h, 'help', 'w-3.5 h-3.5'), 'Centro de ayuda']));
  }
  return h('div.login-support', {}, items);
}

