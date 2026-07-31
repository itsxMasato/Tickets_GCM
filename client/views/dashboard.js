/* Documentado por: Miguel Flores */
import { h } from '../utils/dom.js';
import { api } from '../api.js';
import { ticketCard } from '../components/ticket-card.js';
import { go } from '../router.js';
import { isSAC, isJefe, isAdmin, isSupervisor, canCreateTicket } from '../utils/permissions.js';
import { PRIORITY_LABEL, AREA_LABEL, relativeFromNow } from '../utils/format.js';
import { getRoleLabel } from '../utils/role-labels.js';
import { ICON, svg } from '../utils/icons.js';
import { emptyState, EMPTY_STATES } from '../components/empty-state.js';
import { subscribeToRealtimeEvents } from '../utils/realtime.js';
import { renderAvatar } from '../utils/avatar.js';

/**
 * Determina el rol funcional del dashboard a partir de las banderas de permisos del usuario.
 * @param {Object} user - usuario autenticado
 * @returns {string} uno de: 'sac', 'jefe_inmediato', 'admin_area', 'supervisor_campo'
 */
const ROL_FROM_USER = (user) =>
  isSAC(user)          ? 'sac'
  : isJefe(user)       ? 'jefe_inmediato'
  : isAdmin(user)      ? 'admin_area'
  : isSupervisor(user) ? 'supervisor_campo'
  : 'supervisor_campo';

/**
 * Arma la lista de tarjetas KPI a mostrar según el rol del usuario.
 * @param {string} rol - rol funcional del dashboard
 * @param {Object} totals - totales agregados de tickets
 * @returns {Array<Object>} configuración de cada KPI (label, value, hint, tone, icon, badge)
 */
function buildKpis(rol, totals) {
  const t = totals || {};
  switch (rol) {
    case 'sac':
      return [
        { label: 'Abiertos',      value: t.open  ?? 0, hint: 'Tickets sin cerrar', icon: ICON.ticket },
        { label: 'Sin asignar',   value: t.recibido ?? 0, hint: 'Esperan triage', tone: 'ocean', icon: ICON.inbox, badge: 'Triage' },
        { label: 'Urgentes',      value: t.urgent ?? 0, hint: 'Prioridad elevada', tone: 'accent', icon: ICON.alert, badge: 'Crítico' },
        { label: 'Cerrados hoy',  value: t.closed_today ?? 0, hint: 'Resueltos en el día', tone: 'good', icon: ICON.check, badge: 'Meta' },
      ];
    case 'admin_area':
      return [
        { label: 'Asignados a mí', value: t.total ?? 0, hint: 'Tu cola activa', icon: ICON.ticket },
        { label: 'En proceso',     value: t.en_proceso ?? 0, hint: 'En curso ahora', tone: 'ocean', icon: ICON.refresh, badge: 'Activo' },
        { label: 'Solucionados',   value: t.solucionado ?? 0, hint: 'Listos para cerrar', tone: 'good', icon: ICON.check, badge: 'Listo' },
        { label: 'Reabiertos',     value: t.reabierto ?? 0, hint: 'Volvieron a tu cola', tone: 'accent', icon: ICON.reopen, badge: 'Alerta' },
      ];
    case 'jefe_inmediato':
      return [
        { label: 'Total área',     value: t.total ?? 0, hint: 'Tickets del área', icon: ICON.layers },
        { label: 'Abiertos',       value: t.open ?? 0, hint: 'No cerrados', icon: ICON.ticket },
        { label: 'Por cerrar',     value: t.por_cerrar ?? 0, hint: 'En estado solucionado', tone: 'ocean', icon: ICON.check, badge: 'Decisión' },
        { label: 'Reabiertos',     value: t.reopened ?? 0, hint: 'Volvieron al área', tone: 'accent', icon: ICON.reopen, badge: 'Alerta' },
      ];
    case 'supervisor_campo':
    default:
      return [
        { label: 'Mis tickets',     value: t.total ?? 0, hint: 'Reportados por ti', icon: ICON.ticket },
        { label: 'Abiertos',        value: t.open ?? 0, hint: 'En curso', tone: 'ocean', icon: ICON.refresh, badge: 'Activo' },
        { label: 'Cerrados este mes',  value: t.closed_month ?? 0, hint: 'Resueltos este mes', tone: 'good', icon: ICON.check, badge: 'Meta' },
        { label: 'Tasa de cierre',  value: t.closure_rate != null ? `${t.closure_rate}%` : '—', hint: 'Sobre el total reportado', icon: ICON.report },
      ];
  }
}

/**
 * Arma los datos del bloque hero (mensaje destacado y CTA principal) según el rol y los totales actuales.
 * @param {string} rol - rol funcional del dashboard
 * @param {Object} totals - totales agregados de tickets
 * @returns {Object} datos del hero (count, icon, eyebrow, headline, sub, ctaLabel, ctaHref)
 */
function buildHero(rol, totals) {
  const t = totals || {};
  switch (rol) {
    case 'sac': {
      const c = t.recibido ?? 0;
      return {
        count: c,
        icon: ICON.inbox,
        eyebrow: 'Triage',
        headline: c === 0
          ? 'Bandeja de triage al día'
          : `Tienes ${c} ticket${c === 1 ? '' : 's'} esperando asignación`,
        sub: c === 0
          ? 'No hay tickets sin asignar en este momento.'
          : 'Revisa la bandeja de recibidos y asígnalos al área correspondiente.',
        ctaLabel: 'Asignar ahora',
        ctaHref: '/tickets?status=recibido',
      };
    }
    case 'admin_area': {
      const c = t.en_proceso ?? 0;
      return {
        count: c,
        icon: ICON.ticket,
        eyebrow: 'Tu trabajo',
        headline: c === 0
          ? 'Cola al día, sin tickets en proceso'
          : `Tienes ${c} ticket${c === 1 ? '' : 's'} en proceso`,
        sub: c === 0
          ? 'Cuando te asignen uno, aparecerá aquí para trabajar.'
          : 'Continúa con los tickets asignados a tu área.',
        ctaLabel: 'Ver mi cola',
        ctaHref: '/tickets',
      };
    }
    case 'jefe_inmediato': {
      const c = t.por_cerrar ?? ((t.solucionado || 0) + (t.en_proceso || 0));
      return {
        count: c,
        icon: ICON.check,
        eyebrow: 'Decisión',
        headline: c === 0
          ? 'No hay tickets esperando decisión'
          : `Tienes ${c} ticket${c === 1 ? '' : 's'} por cerrar o revisar`,
        sub: c === 0
          ? 'El área no tiene tickets pendientes de cierre.'
          : 'Tickets en estado solucionado o reabierto que requieren tu firma.',
        ctaLabel: 'Ir a cerrarlos',
        ctaHref: '/tickets?status=solucionado',
      };
    }
    case 'supervisor_campo':
    default: {
      return {
        count: -1,
        icon: ICON.plus,
        eyebrow: 'Captura',
        headline: 'Reportar una incidencia',
        sub: 'Levanta un ticket en menos de un minuto desde el campo. Adjunta fotos, asigna categoría y prioridad.',
        ctaLabel: 'Crear ticket',
        ctaHref: '/tickets/new',
        ctaRole: 'supervisor',
      };
    }
  }
}

/**
 * Arma la lista de accesos rápidos (tarjetas de navegación) para el rol dado.
 * @param {string} rol - rol funcional del dashboard
 * @returns {Array<Object>} configuración de cada acceso rápido (icon, title, sub, href, tone)
 */
function buildQuickActions(rol) {
  switch (rol) {
    case 'sac':
      return [
        { icon: ICON.inbox,     title: 'Bandeja de recibidos', sub: 'Tickets sin asignar',          href: '/tickets?status=recibido', tone: 'is-ocean' },
        { icon: ICON.reopen,    title: 'Reabiertos',           sub: 'Tickets que volvieron al flujo', href: '/tickets?status=reabierto', tone: 'is-accent' },
        { icon: ICON.report,    title: 'Reportes',             sub: 'Exportes Excel y PDF',          href: '/reports', tone: 'is-brand' },
      ];
    case 'admin_area':
      return [
        { icon: ICON.ticket,    title: 'Mi área',              sub: 'Todos los tickets del área',     href: '/tickets', tone: 'is-brand' },
        { icon: ICON.bell,      title: 'Notificaciones',       sub: 'Bandeja de entrada',            href: '/notifications', tone: 'is-ocean' },
        { icon: ICON.users,     title: 'Equipo',               sub: 'Compañeros de área',            href: '/users', tone: 'is-emerald' },
      ];
    case 'jefe_inmediato':
      return [
        { icon: ICON.report,    title: 'Reportes',             sub: 'Métricas y exportes',           href: '/reports', tone: 'is-brand' },
        { icon: ICON.ticket,    title: 'Tickets del área',     sub: 'Vista global del área',          href: '/tickets', tone: 'is-ocean' },
        { icon: ICON.bell,      title: 'Notificaciones',       sub: 'Bandeja de entrada',            href: '/notifications', tone: 'is-emerald' },
      ];
    case 'supervisor_campo':
    default:
      return [
        { icon: ICON.ticket,    title: 'Mis tickets',          sub: 'Tus tickets reportados',        href: '/tickets', tone: 'is-ocean' },
        { icon: ICON.bell,      title: 'Notificaciones',       sub: 'Bandeja de entrada',            href: '/notifications', tone: 'is-emerald' },
        { icon: ICON.plus,      title: 'Crear nuevo',          sub: 'Reportar una incidencia',       href: '/tickets/new', tone: 'is-brand' },
      ];
  }
}

/**
 * Renderiza la franja superior de bienvenida con nombre, rol, área y última actualización.
 * @param {Object} user - usuario autenticado
 * @param {string} lastUpdateIso - fecha ISO de la última actualización de datos
 * @returns {HTMLElement} nodo de la franja de bienvenida
 */
function welcomeStrip(user, lastUpdateIso) {
  const firstName = (user.full_name || '').split(' ')[0] || 'equipo';
  const role = ROL_FROM_USER(user);
  const roleLabel = getRoleLabel(role);
  const areaLabel = user.area && AREA_LABEL[user.area] ? AREA_LABEL[user.area] : null;
  const fresh = lastUpdateIso ? relativeFromNow(lastUpdateIso) : 'ahora';

  return h('div.dash-welcome', { 'aria-label': `Bienvenida, ${firstName}` }, [
    h('div.dash-welcome-left', {}, [
      h('span.dash-welcome-name', {}, `Hola, ${firstName}`),
      h('span.dash-welcome-dot', { 'aria-hidden': 'true' }),
      h('span.dash-welcome-role', {}, roleLabel),
      areaLabel && h('span.dash-welcome-dot', { 'aria-hidden': 'true' }),
      areaLabel && h('span.dash-welcome-meta', {}, areaLabel),
      h('span.dash-welcome-dot', { 'aria-hidden': 'true' }),
      h('span.dash-welcome-time', { 'aria-live': 'polite' }, `Actualizado ${fresh}`),
    ]),
    h('div.dash-welcome-status', {}, [
      h('span.dash-welcome-status-dot', { 'aria-hidden': 'true' }),
      'En línea',
    ]),
  ]);
}

/**
 * Renderiza el bloque hero del dashboard: variante "en calma" cuando no hay pendientes, o variante destacada con CTA.
 * @param {string} rol - rol funcional del dashboard
 * @param {Object} totals - totales agregados de tickets
 * @returns {HTMLElement} nodo del hero
 */
function heroAction(rol, totals) {
  const h_ = buildHero(rol, totals);
  const noCount = h_.count === -1;
  const allClean = !noCount && h_.count === 0;

  if (allClean) {
    return h('div.dash-hero-quiet', { role: 'status', 'aria-live': 'polite' }, [
      h('span.dash-hero-quiet-dot', { 'aria-hidden': 'true' }),
      h('span.dash-hero-quiet-text', {}, h_.headline),
      h('span.dash-hero-quiet-sub', {}, h_.sub),
    ]);
  }

  return h('div.dash-hero', {}, [
    h('div.relative.z-10.flex.items-start.gap-4.min-w-0', {}, [
      h('span.dash-hero-icon.flex-none', { 'aria-hidden': 'true' }, [
        svg(h, h_.icon, 'w-6 h-6'),
      ]),
      h('div.min-w-0', {}, [
        h('div.dash-hero-eyebrow', {}, h_.eyebrow),
        h('div.dash-hero-title', {}, h_.headline),
        h('div.dash-hero-sub', {}, h_.sub),
      ]),
    ]),
    h('div.relative.z-10.flex-none', {}, [
      h('button.btn.btn-accent.px-5.py-3.text-sm.font-semibold.shadow-lg', {
        class: 'shadow-black/20 gap-1.5',
        onclick: () => go(h_.ctaHref),
        'aria-label': `${h_.ctaLabel}. ${h_.headline}`,
      }, [
        h('span', {}, h_.ctaLabel),
        h('span', { 'aria-hidden': 'true' }, '→'),
      ]),
    ]),
  ]);
}

const KPI_TONE = {
  accent: { border: 'border-l-accent',       iconTone: 'is-accent',  badge: 'bg-accent/10 text-accent',           value: 'dash-kpi-accent' },
  ocean:  { border: 'border-l-brand-ocean',  iconTone: 'is-ocean',   badge: 'bg-brand-ocean/10 text-brand-ocean', value: 'dash-kpi-ocean' },
  good:   { border: 'border-l-emerald-500',  iconTone: 'is-emerald', badge: 'bg-emerald-100 text-emerald-700',    value: '' },
  '':     { border: 'border-l-surface-border-strong', iconTone: '',  badge: '',                                   value: '' },
};

/**
 * Renderiza una tarjeta KPI individual con valor, etiqueta, ícono y badge opcional.
 * @param {string} label - etiqueta del KPI
 * @param {number|string} value - valor a mostrar
 * @param {string} [hint] - texto de ayuda bajo el valor
 * @param {string} [tone] - clave de tono visual (accent, ocean, good, '')
 * @param {string} [icon] - ícono a mostrar
 * @param {string} [badge] - texto de badge opcional
 * @returns {HTMLElement} nodo de la tarjeta KPI
 */
function kpi(label, value, hint = '', tone = '', icon = null, badge = '') {
  const t = KPI_TONE[tone] || KPI_TONE[''];
  const top = (icon || badge)
    ? h('div.kpi-card-top', {}, [
        icon ? h('div.kpi-icon', { class: t.iconTone }, [svg(h, icon, 'w-4 h-4')]) : h('span'),
        badge ? h('span.kpi-badge', { class: t.badge }, badge) : null,
      ])
    : null;
  return h('div.kpi-card', { class: t.border, 'data-kpi-label': label }, [
    top,
    h('div', {}, [
      h('div.kpi-value', { class: t.value, 'data-kpi-value': String(value) }, String(value)),
      h('div.kpi-label', {}, label),
    ]),
    hint ? h('div.kpi-hint', {}, hint) : null,
  ]);
}

/**
 * Renderiza el placeholder de carga (skeleton) de una tarjeta KPI mientras llegan los datos.
 * @returns {HTMLElement} nodo skeleton de KPI
 */
function kpiSkeleton() {
  return h('div.card.flex.flex-col.gap-3.border-l-4.border-l-surface-border', { 'aria-hidden': 'true' }, [
    h('div.flex.items-start.justify-between', {}, [
      h('div.w-9.h-9.rounded-lg.bg-slate-200.animate-pulse'),
      h('div.h-4.w-12.bg-slate-200.rounded.animate-pulse'),
    ]),
    h('div.h-7.bg-slate-200.rounded.animate-pulse', { class: 'w-1/2' }),
  ]);
}

/**
 * Renderiza el gráfico de tendencia de tickets creados en los últimos 30 días, con línea, área, promedio y tooltip interactivo.
 * @param {Array<Object>} data - serie diaria de tickets ({ day, c })
 * @returns {HTMLElement} nodo del gráfico (o estado vacío si no hay datos)
 */
function ticketsTrendChart(data) {
  if (!data || data.length === 0) {
    return emptyState({
      ...EMPTY_STATES.dashboard,
      message: 'No hay datos para los últimos 30 días.',
    });
  }
  const n = data.length;
  const values = data.map((d) => d.c || 0);
  const max = Math.max(1, ...values);
  const total = values.reduce((s, v) => s + v, 0);
  const avg = total / n;

  const fmtDay = (iso) => (iso || '').slice(5);
  const majorIdx = new Set(values.map((_, i) => (i % 5 === 0 ? i : -1)).filter((i) => i >= 0));
  majorIdx.add(n - 1);

  const VIEW_W = 600;
  const VIEW_H = 150;
  const padX = 6;
  const padTop = 16;
  const padBottom = 8;
  const plotW = VIEW_W - padX * 2;
  const plotH = VIEW_H - padTop - padBottom;
  const baselineY = padTop + plotH;
  const xAt = (i) => padX + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const yAt = (v) => padTop + plotH - (v / max) * plotH;

  const points = values.map((v, i) => [xAt(i), yAt(v)]);
  const linePath = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
  const lastPoint = points[n - 1];
  const areaPath = `${linePath} L${lastPoint[0].toFixed(2)},${baselineY} L${points[0][0].toFixed(2)},${baselineY} Z`;
  const avgY = yAt(avg);

  const area = h('path.dash-trend-area', { d: areaPath, 'aria-hidden': 'true' });
  const line = h('path.dash-trend-line', { d: linePath, 'aria-hidden': 'true' });
  const baseline = h('line.dash-trend-baseline', { x1: padX, y1: baselineY, x2: VIEW_W - padX, y2: baselineY, 'aria-hidden': 'true' });
  const avgLine = h('line.dash-trend-avg-line', { x1: padX, y1: avgY.toFixed(2), x2: VIEW_W - padX, y2: avgY.toFixed(2), 'aria-hidden': 'true' });
  const endDot = h('circle.dash-trend-end-dot', { cx: lastPoint[0].toFixed(2), cy: lastPoint[1].toFixed(2), r: 4.5, 'aria-hidden': 'true' });
  const crosshair = h('line.dash-trend-crosshair', { x1: lastPoint[0].toFixed(2), y1: padTop, x2: lastPoint[0].toFixed(2), y2: baselineY, 'aria-hidden': 'true' });
  const hoverDot = h('circle.dash-trend-hover-dot', { cx: lastPoint[0].toFixed(2), cy: lastPoint[1].toFixed(2), r: 5, 'aria-hidden': 'true' });
  const hitRect = h('rect', { x: 0, y: 0, width: VIEW_W, height: VIEW_H, fill: 'transparent', 'aria-hidden': 'true' });

  const svg = h('svg.dash-trend-svg', {
    viewBox: `0 0 ${VIEW_W} ${VIEW_H}`,
    preserveAspectRatio: 'none',
    'aria-hidden': 'true',
  }, [baseline, avgLine, area, line, endDot, crosshair, hoverDot, hitRect]);

  const tooltipDate = h('div.dash-trend-tooltip-date', {}, '');
  const tooltipValue = h('div.dash-trend-tooltip-value', {}, '');
  const tooltip = h('div.dash-trend-tooltip', {}, [tooltipDate, tooltipValue]);

  /**
   * Activa el estado hover/foco del gráfico en el índice dado: mueve crosshair, punto y tooltip.
   * @param {number} i - índice del punto de datos a activar
   * @returns {void}
   */
  function setActive(i) {
    const [x, y] = points[i];
    crosshair.setAttribute('x1', x.toFixed(2));
    crosshair.setAttribute('x2', x.toFixed(2));
    crosshair.classList.add('is-active');
    hoverDot.setAttribute('cx', x.toFixed(2));
    hoverDot.setAttribute('cy', y.toFixed(2));
    hoverDot.classList.add('is-active');
    tooltipDate.textContent = fmtDay(data[i].day || data[i].label);
    tooltipValue.textContent = `${values[i]} ticket${values[i] === 1 ? '' : 's'}`;
    tooltip.style.left = `${n === 1 ? 50 : (i / (n - 1)) * 100}%`;
    tooltip.classList.add('is-active');
  }
  /**
   * Limpia el estado hover/foco del gráfico (crosshair, punto y tooltip).
   * @returns {void}
   */
  function clearActive() {
    crosshair.classList.remove('is-active');
    hoverDot.classList.remove('is-active');
    tooltip.classList.remove('is-active');
  }
  /**
   * Convierte una coordenada X del puntero (viewport) en el índice de dato más cercano del gráfico.
   * @param {number} clientX - coordenada X del evento de puntero
   * @returns {number} índice del punto de datos correspondiente
   */
  function indexFromClientX(clientX) {
    const rect = svg.getBoundingClientRect();
    const relX = ((clientX - rect.left) / rect.width) * VIEW_W;
    const raw = ((relX - padX) / plotW) * (n - 1);
    return Math.min(n - 1, Math.max(0, Math.round(raw)));
  }
  /**
   * Handler de pointermove sobre el gráfico: activa el punto correspondiente a la posición del puntero.
   * @param {PointerEvent} e - evento de puntero
   * @returns {void}
   */
  const onMove = (e) => setActive(indexFromClientX(e.clientX));
  /**
   * Handler de pointerleave sobre el gráfico: limpia el estado activo.
   * @returns {void}
   */
  const onLeave = () => clearActive();
  svg.addEventListener('pointermove', onMove);
  svg.addEventListener('pointerleave', onLeave);

  const axis = h('div.dash-trend-axis', {}, data.map((d, i) =>
    h('span.dash-trend-axis-label', {}, majorIdx.has(i) ? fmtDay(d.day || d.label) : '')));

  const table = h('table.sr-only', {}, [
    h('caption', {}, `Tickets creados por día, últimos ${n} días. Promedio ${avg.toFixed(1)} por día.`),
    h('thead', {}, [h('tr', {}, [h('th', {}, 'Fecha'), h('th', {}, 'Tickets')])]),
    h('tbody', {}, data.map((d) => h('tr', {}, [
      h('td', {}, fmtDay(d.day || d.label)),
      h('td', {}, String(d.c || 0)),
    ]))),
  ]);

  const avgLabel = h('div.dash-trend-avg-label', {
    style: { top: `${(avgY / VIEW_H) * 100}%` },
  }, `Prom: ${avg.toFixed(1)}`);

  const wrap = h('div.dash-trend-wrap', {}, [svg, avgLabel, tooltip, axis, table]);
  wrap._trendChartCleanup = () => {
    svg.removeEventListener('pointermove', onMove);
    svg.removeEventListener('pointerleave', onLeave);
  };
  return wrap;
}

/**
 * Renderiza una barra de progreso horizontal proporcional a value/max.
 * @param {number} value - valor actual
 * @param {number} max - valor máximo de referencia
 * @param {string} [color] - clase Tailwind de color de relleno
 * @returns {HTMLElement} nodo de la barra de progreso
 */
function progressBar(value, max, color = 'bg-brand-ocean') {
  const pct = max ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return h('div.w-full.h-2.bg-slate-100.rounded.overflow-hidden', {}, [
    h('div.h-2.rounded.transition-all', { class: color, style: { width: `${pct}%` } }),
  ]);
}

const PRIORITY_BAR_COLOR = {
  urgente: 'bg-accent',
  alta: 'bg-brand',
  media: 'bg-brand-ocean',
  baja: 'bg-slate-300',
};
/**
 * Renderiza el desglose de tickets por prioridad con barras de progreso proporcionales.
 * @param {Array<Object>} byPriority - lista de { priority, c } con conteo por prioridad
 * @returns {HTMLElement} nodo con la lista de prioridades (o mensaje vacío si no hay datos)
 */
function priorityList(byPriority) {
  if (!byPriority || byPriority.length === 0) {
    return h('p.text-xs.text-slate-500', {}, 'Sin tickets para mostrar.');
  }
  const max = Math.max(1, ...byPriority.map((p) => p.c));
  return h('div.flex.flex-col', {}, byPriority.map((p) => {
    const isUrgent = p.priority === 'urgente';
    return h('div', { 'aria-label': `${PRIORITY_LABEL[p.priority] || p.priority}: ${p.c} tickets` }, [
      h('div.dash-prio-row', {}, [
        h(`span.${isUrgent ? 'dash-prio-dot-urgente' : 'dash-prio-dot-default'}`, { 'aria-hidden': 'true' }),
        h('span.text-xs.font-medium.text-brand-ink.flex-1', {}, PRIORITY_LABEL[p.priority] || p.priority),
        h('span.text-xs.text-slate-500.tabular-nums', {}, String(p.c)),
      ]),
      progressBar(p.c, max, PRIORITY_BAR_COLOR[p.priority] || 'bg-brand-ocean'),
    ]);
  }));
}

/**
 * Formatea una duración en horas a un texto legible (minutos, horas o días).
 * @param {number} hours - duración en horas
 * @returns {string} duración formateada (p. ej. "45 min", "3.2 h", "1.5 d") o "—" si no hay dato
 */
function formatDuration(hours) {
  if (hours == null || Number.isNaN(hours)) return '—';
  if (hours <= 0) return '0 min';
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  if (hours < 48) return `${hours.toFixed(1)} h`;
  return `${(hours / 24).toFixed(1)} d`;
}

/**
 * Renderiza el desglose de tickets por área operativa con barras de progreso proporcionales.
 * @param {Array<Object>} byArea - lista de { area, c } con conteo por área
 * @returns {HTMLElement} nodo con la lista de áreas (o mensaje vacío si no hay datos)
 */
function areaBreakdown(byArea) {
  if (!byArea || byArea.length === 0) {
    return h('p.text-xs.text-slate-500', {}, 'Sin datos para mostrar.');
  }
  const max = Math.max(1, ...byArea.map((a) => a.c));
  return h('div.flex.flex-col', {}, byArea.map((a) => h('div', {
    'aria-label': `${AREA_LABEL[a.area] || a.area}: ${a.c} tickets`,
  }, [
    h('div.dash-prio-row', {}, [
      h('span.dash-prio-dot-default', { 'aria-hidden': 'true' }),
      h('span.text-xs.font-medium.text-brand-ink.flex-1', {}, AREA_LABEL[a.area] || a.area),
      h('span.text-xs.text-slate-500.tabular-nums', {}, String(a.c)),
    ]),
    progressBar(a.c, max),
  ])));
}

/**
 * Renderiza una lista compacta genérica de ítems (nombre, meta opcional, contador, índice o avatar opcional).
 * @param {Array<Object>} items - ítems a listar
 * @param {Object} [opts] - opciones de renderizado (getName, getMeta, showIndex, showAvatar, max)
 * @returns {HTMLElement} nodo de la lista (o mensaje vacío si no hay datos)
 */
function denseList(items, opts = {}) {
  const { getName, getMeta, showIndex = true, showAvatar = false, max = 8 } = opts;
  if (!items || items.length === 0) {
    return h('p.text-xs.text-slate-500', {}, 'Sin datos para mostrar.');
  }
  const slice = items.slice(0, max);
  return h('ul.dash-list', { role: 'list' }, slice.map((it, i) => {
    const name = getName ? getName(it) : (it.name || it.full_name || '—');
    const meta = getMeta ? getMeta(it) : (it.area || '');
    return h('li.dash-list-row', {}, [
      showIndex
        ? h('span.dash-list-index', { 'aria-hidden': 'true' }, String(i + 1).padStart(2, '0'))
        : null,
      showAvatar ? renderAvatar(it, { className: 'w-7 h-7 rounded-full text-[11px] font-semibold text-white flex items-center justify-center flex-none' }) : null,
      h('span.dash-list-name', { title: name }, name),
      meta ? h('span.dash-list-meta', {}, meta) : null,
      h('span.dash-list-count', {}, String(it.c ?? '')),
    ]);
  }));
}

const CATEGORY_TONES = [
  { bg: 'bg-brand/10', text: 'text-brand' },
  { bg: 'bg-brand-ocean/10', text: 'text-brand-ocean' },
  { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  { bg: 'bg-amber-100', text: 'text-amber-700' },
  { bg: 'bg-violet-100', text: 'text-violet-700' },
  { bg: 'bg-slate-100', text: 'text-slate-600' },
];
/**
 * Renderiza el top de categorías con conteo de tickets, alternando tonos de color por fila.
 * @param {Array<Object>} categories - lista de { name, c } con conteo por categoría
 * @returns {HTMLElement} nodo con la lista de categorías (o mensaje vacío si no hay datos)
 */
function categoryChipList(categories) {
  if (!categories || categories.length === 0) {
    return h('p.text-xs.text-slate-500', {}, 'Sin categorías para mostrar.');
  }
  return h('div', {}, categories.slice(0, 6).map((c, i) => {
    const tone = CATEGORY_TONES[i % CATEGORY_TONES.length];
    return h('div.dash-cat-row', {}, [
      h('div.flex.items-center.gap-3.min-w-0', {}, [
        h('div.dash-cat-icon', { class: `${tone.bg} ${tone.text}`, 'aria-hidden': 'true' }, [svg(h, ICON.tag, 'w-4 h-4')]),
        h('span.dash-cat-name', { title: c.name }, c.name),
      ]),
      h('span.dash-cat-count', { class: `${tone.bg} ${tone.text}` }, `${c.c ?? 0} ticket${c.c === 1 ? '' : 's'}`),
    ]);
  }));
}

/**
 * Renderiza el ranking de encargados por carga de tickets asignados, con avatar y puesto.
 * @param {Array<Object>} agents - lista de agentes con { full_name, area, c, id }
 * @returns {HTMLElement} nodo con el ranking (o mensaje vacío si no hay datos)
 */
function rankingList(agents) {
  if (!agents || agents.length === 0) {
    return h('p.text-xs.text-slate-500', {}, 'Sin datos para mostrar.');
  }
  return h('div', {}, agents.slice(0, 6).map((a, i) => {
    const place = i + 1;
    const placeLabel = place <= 3 ? `${place}º puesto` : `${place}º`;
    return h('div.dash-rank-row', {}, [
      renderAvatar(a, { className: `dash-rank-avatar${place === 1 ? ' is-first' : ''}` }),
      h('div.dash-rank-body', {}, [
        h('div.dash-rank-top', {}, [
          h('span.dash-rank-name', { title: a.full_name || '' }, a.full_name || `Usuario #${a.id}`),
          h('span.dash-rank-place', { class: place > 3 ? 'is-muted' : '' }, placeLabel),
        ]),
        h('div.dash-rank-meta', {}, [
          a.area ? (AREA_LABEL[a.area] || a.area) : 'Sin área',
          ' · ',
          `${a.c} asignado${a.c === 1 ? '' : 's'}`,
        ].join('')),
      ]),
    ]);
  }));
}

/**
 * Renderiza una tarjeta con una cola de tickets (título, subtítulo, enlace "ver todos") o su estado vacío.
 * @param {Array<Object>} tickets - tickets a mostrar en la cola
 * @param {Object} opts - configuración de la sección (title, sub, linkToAll, linkLabel, emptyTitle, emptyMessage, emptyAction)
 * @returns {HTMLElement} nodo de la tarjeta de cola
 */
function queueList(
  tickets,
  { title, sub, linkToAll, linkLabel = 'Ver todos', emptyTitle, emptyMessage, emptyAction }
) {
  const head = h('div.dash-section-head.px-5.pt-4', {}, [
    h('div', {}, [
      h('div.dash-section-title', {}, title),
      sub ? h('div.dash-section-sub', {}, sub) : null,
    ]),
    linkToAll
      ? h('a.dash-section-link', { href: linkToAll, onclick: (e) => { e.preventDefault(); go(linkToAll); } }, [
          h('span', {}, linkLabel),
          h('span', { 'aria-hidden': 'true' }, '→'),
        ])
      : null,
  ]);

  if (!tickets || tickets.length === 0) {
    return h('div.card.p-0', {}, [
      head,
      h('div.px-5.pb-5', {}, [
        emptyState({
          ...EMPTY_STATES.tickets,
          title: emptyTitle || 'Sin tickets',
          message: emptyMessage || 'No hay tickets en este momento.',
          action: emptyAction || null,
        }),
      ]),
    ]);
  }

  return h('div.card.p-0', { 'aria-live': 'polite' }, [
    head,
    h('div.px-3.pb-3.flex.flex-col.gap-2', {}, tickets.map(ticketCard)),
  ]);
}

/**
 * Renderiza la grilla de accesos rápidos (tarjetas de navegación) para el rol dado.
 * @param {string} rol - rol funcional del dashboard
 * @returns {HTMLElement} nodo con la grilla de accesos rápidos
 */
function quickActions(rol) {
  const items = buildQuickActions(rol);
  return h('div.grid.grid-cols-1.gap-3', { class: 'sm:grid-cols-3' }, items.map((it) =>
    h('a.dash-quick', {
      href: it.href,
      onclick: (e) => { e.preventDefault(); go(it.href); },
      'aria-label': `${it.title}. ${it.sub}`,
    }, [
      h('span.dash-quick-icon', { class: it.tone || '', 'aria-hidden': 'true' }, [svg(h, it.icon, 'w-5 h-5')]),
      h('div.dash-quick-body', {}, [
        h('div.dash-quick-title', {}, it.title),
        h('div.dash-quick-sub', {}, it.sub),
      ]),
    ])
  ));
}

/**
 * Punto de entrada de la vista Dashboard: arma bienvenida, hero, KPIs y el panel específico del rol,
 * mostrando skeletons mientras carga y suscribiéndose a eventos en tiempo real para refrescar los datos.
 * @param {Object} params - parámetros de la vista
 * @param {Object} params.user - usuario autenticado
 * @returns {Promise<Object>} objeto con `view` (nodo raíz HTMLElement) y `cleanup` (función para cancelar la suscripción realtime)
 */
export async function renderDashboard({ user }) {
  const rol = ROL_FROM_USER(user);
  const root = h('div.flex.flex-col.gap-5', {});

  root.appendChild(welcomeStrip(user, new Date().toISOString()));

  const heroNode = heroAction(rol, {});
  const kpiNodes = buildKpis(rol, {}).map((k) => kpiSkeleton());
  const kpiRow = h('div.grid.grid-cols-2.gap-3', { class: 'md:grid-cols-4', 'aria-live': 'polite', 'aria-busy': 'true' }, kpiNodes);
  root.appendChild(heroNode);
  root.appendChild(kpiRow);

  const roleNode = h('div.flex.flex-col.gap-5', { 'aria-busy': 'true' }, [
    h('div.card.p-5', {}, [
      h('div.dash-section-head', {}, [
        h('div.h-3.bg-slate-200.rounded.animate-pulse', { class: 'w-1/3' }),
        h('div.h-3.bg-slate-200.rounded.animate-pulse', { class: 'w-1/6' }),
      ]),
      h('div.bg-slate-100.rounded.animate-pulse', { class: 'h-32 md:h-40' }),
    ]),
    h('div.grid.grid-cols-1.gap-3', { class: 'md:grid-cols-2' }, [
      h('div.card.flex.flex-col.gap-2', { 'aria-hidden': 'true' }, [
        h('div.h-3.bg-slate-200.rounded.animate-pulse', { class: 'w-1/3' }),
        h('div.h-3.bg-slate-200.rounded.animate-pulse', { class: 'w-3/4' }),
        h('div.h-3.bg-slate-200.rounded.animate-pulse', { class: 'w-2/3' }),
      ]),
      h('div.card.flex.flex-col.gap-2', { 'aria-hidden': 'true' }, [
        h('div.h-3.bg-slate-200.rounded.animate-pulse', { class: 'w-1/3' }),
        h('div.h-3.bg-slate-200.rounded.animate-pulse', { class: 'w-3/4' }),
        h('div.h-3.bg-slate-200.rounded.animate-pulse', { class: 'w-2/3' }),
      ]),
    ]),
  ]);
  root.appendChild(roleNode);

  try {
    let data;
    if (rol === 'sac') data = await api.stats.dashboard().catch(() => ({}));
    else                data = await api.stats.me().catch(() => ({}));

    applyHero(root, rol, data.totals || {});
    applyKpis(root, rol, data.totals || {});

    let realRoleNode;
    if (rol === 'sac')                       realRoleNode = await sacDashboard(data);
    else if (rol === 'jefe_inmediato')       realRoleNode = await jefeDashboard(data);
    else if (rol === 'admin_area')           realRoleNode = await adminDashboard(data);
    else                                     realRoleNode = await supervisorDashboard(data);

    root.replaceChild(realRoleNode, roleNode);
  } catch (e) {
    console.error('[dashboard] fallo al renderizar el panel del rol:', e);
    root.replaceChild(h('div.card.p-6.text-center.text-sm', { class: 'text-brand-ink/70' },
      ['No pudimos cargar tu panel ahora mismo. Intenta refrescar.']), roleNode);
  }

  let currentTotals = (() => {
    const row = root.children[2];
    if (!row) return {};
    const out = {};
    row.querySelectorAll('[data-kpi-label]').forEach((el) => {
      out[el.getAttribute('data-kpi-label')] = el.getAttribute('data-kpi-value');
    });
    return out;
  })();

  const evs = ['ticket:created', 'ticket:updated', 'ticket:assigned',
               'ticket:status_changed', 'ticket:commented', 'attachment:added'];
  const ac = subscribeToRealtimeEvents(evs, async () => {
    try {
      const fresh = rol === 'sac' ? await api.stats.dashboard().catch(() => ({}))
                                  : await api.stats.me().catch(() => ({}));
      const oldTotals = { ...currentTotals };
      currentTotals = applyHero(root, rol, fresh.totals || {});
      applyKpis(root, rol, fresh.totals || {}, oldTotals);

      const newRole = rol === 'sac'                       ? await sacDashboard(fresh)
                    : rol === 'jefe_inmediato'            ? await jefeDashboard(fresh)
                    : rol === 'admin_area'                ? await adminDashboard(fresh)
                                                          : await supervisorDashboard(fresh);
      const last = root.lastElementChild;
      if (last && last !== root.children[0] && last !== root.children[1] && last !== root.children[2]) {
        root.replaceChild(newRole, last);
      } else {
        root.appendChild(newRole);
      }
    } catch {}
  });

  return { view: root, cleanup: () => ac.abort() };
}

/**
 * Reemplaza el bloque hero del dashboard con datos actualizados, preservando el foco si estaba dentro.
 * @param {HTMLElement} rootEl - nodo raíz del dashboard
 * @param {string} r - rol funcional del dashboard
 * @param {Object} totals - totales agregados de tickets actualizados
 * @returns {Object} copia de los totales aplicados
 */
function applyHero(rootEl, r, totals) {
  const old = rootEl.children[1];
  if (!old) return {};
  const fresh = heroAction(r, totals);
  const wasFocused = old.contains(document.activeElement);
  rootEl.replaceChild(fresh, old);
  if (wasFocused) {
    const btn = fresh.querySelector('button');
    if (btn) btn.focus();
  }
  return (totals && typeof totals === 'object') ? { ...totals } : {};
}

/**
 * Reemplaza la fila de KPIs con datos actualizados y aplica una animación de pulso a los valores que cambiaron.
 * @param {HTMLElement} rootEl - nodo raíz del dashboard
 * @param {string} r - rol funcional del dashboard
 * @param {Object} totals - totales agregados de tickets actualizados
 * @param {Object} [oldTotals] - totales previos, usados para detectar cambios y animarlos
 * @returns {void}
 */
function applyKpis(rootEl, r, totals, oldTotals) {
  const row = rootEl.children[2];
  if (!row) return;
  const kpis = buildKpis(r, totals);
  const fresh = h('div.grid.grid-cols-2.gap-3', { class: 'md:grid-cols-4', 'aria-live': 'polite' },
    kpis.map((k) => kpi(k.label, k.value, k.hint, k.tone, k.icon, k.badge)));
  rootEl.replaceChild(fresh, row);

  if (oldTotals && Object.keys(oldTotals).length > 0) {
    fresh.querySelectorAll('[data-kpi-label]').forEach((el) => {
      const label = el.getAttribute('data-kpi-label');
      const oldV = oldTotals[label];
      const newV = el.getAttribute('data-kpi-value');
      if (oldV != null && String(oldV) !== String(newV)) {
        el.classList.add('dash-kpi-pulse');
        setTimeout(() => el.classList.remove('dash-kpi-pulse'), 650);
      }
    });
  }
}

/**
 * Arma el panel específico del rol SAC: tendencia de 30 días, prioridades, top categorías, ranking y áreas.
 * @param {Object} data - datos de estadísticas del dashboard
 * @returns {Promise<HTMLElement>} nodo con las secciones del panel SAC
 */
async function sacDashboard(data) {
  const root = h('div.flex.flex-col.gap-5', {});
  const t = data.totals || {};

  const primaryGrid = h('div.grid.grid-cols-1.gap-3', { class: 'lg:grid-cols-3' }, [
    h('div.card', { class: 'lg:col-span-2' }, [
      h('div.dash-section-head', {}, [
        h('div', {}, [
          h('div.dash-section-title', {}, 'Tickets creados en los últimos 30 días'),
          h('div.dash-section-sub', {}, 'Volumen diario y promedio del período'),
        ]),
        h('div.flex.flex-col.items-end', { class: 'gap-0.5' }, [
          h('span.dash-section-sub', {}, `${t.total ?? 0} en el mes`),
          data.avg_resolution_hours != null ? h('span.dash-section-sub', {}, `Prom. resolución: ${formatDuration(data.avg_resolution_hours)}`) : null,
        ]),
      ]),
      ticketsTrendChart(data.last_30_days),
    ]),
    h('div.card', {}, [
      h('div.dash-section-head', {}, [
        h('div.dash-section-title', {}, 'Por prioridad'),
        h('span.dash-section-sub', {}, 'Total por nivel'),
      ]),
      priorityList(data.by_priority),
    ]),
  ]);
  root.appendChild(primaryGrid);

  const secondaryGrid = h('div.grid.grid-cols-1.gap-3', { class: 'lg:grid-cols-3' }, [
    h('div.card', {}, [
      h('div.dash-section-head', {}, [
        h('div.dash-section-title', {}, 'Top categorías'),
        h('a.dash-section-link', { href: '/categories', onclick: (e) => { e.preventDefault(); go('/categories'); } }, [
          h('span', {}, 'Ver todas'),
          h('span', { 'aria-hidden': 'true' }, '→'),
        ]),
      ]),
      categoryChipList(data.top_categories),
    ]),
    h('div.card', {}, [
      h('div.dash-section-head', {}, [
        h('div.dash-section-title', {}, 'Ranking por encargado'),
        h('span.dash-section-sub', {}, 'Carga de trabajo'),
      ]),
      rankingList(data.by_assignee),
    ]),
    h('div.card', {}, [
      h('div.dash-section-head', {}, [
        h('div.dash-section-title', {}, 'Por área'),
        h('span.dash-section-sub', {}, 'Total por área operativa'),
      ]),
      areaBreakdown(data.by_area),
    ]),
  ]);
  root.appendChild(secondaryGrid);

  root.appendChild(quickActions('sac'));

  return root;
}

/**
 * Arma el panel específico del rol jefe inmediato: carga por administrador y distribución por estado del área.
 * @param {Object} data - datos de estadísticas del dashboard
 * @returns {Promise<HTMLElement>} nodo con las secciones del panel de jefe inmediato
 */
async function jefeDashboard(data) {
  const root = h('div.flex.flex-col.gap-5', {});
  const t = data.totals || {};

  const primaryGrid = h('div.grid.grid-cols-1.gap-3', { class: 'lg:grid-cols-2' }, [
    h('div.card', {}, [
      h('div.dash-section-head', {}, [
        h('div', {}, [
          h('div.dash-section-title', {}, 'Carga por administrador'),
          h('div.dash-section-sub', {}, 'Tickets asignados en el área'),
        ]),
        h('a.dash-section-link', { href: '/users', onclick: (e) => { e.preventDefault(); go('/users'); } }, [
          h('span', {}, 'Ver equipo'),
          h('span', { 'aria-hidden': 'true' }, '→'),
        ]),
      ]),
      denseList(data.by_assignee, {
        getName: (u) => u.full_name,
        getMeta: (u) => u.area || '',
        showAvatar: true,
        showIndex: false,
        max: 8,
      }),
    ]),
    h('div.card', {}, [
      h('div.dash-section-head', {}, [
        h('div', {}, [
          h('div.dash-section-title', {}, 'Distribución por estado'),
          h('div.dash-section-sub', {}, 'Lectura rápida del flujo'),
        ]),
      ]),
      statusBreakdown(t),
    ]),
  ]);
  root.appendChild(primaryGrid);

  root.appendChild(quickActions('jefe_inmediato'));

  return root;
}

/**
 * Arma el panel específico del rol admin de área: cola de trabajo asignada y desglose por prioridad.
 * @param {Object} data - datos de estadísticas del dashboard
 * @returns {Promise<HTMLElement>} nodo con las secciones del panel de admin de área
 */
async function adminDashboard(data) {
  const root = h('div.flex.flex-col.gap-5', {});

  let list = { tickets: [] };
  try { list = await api.tickets.list({ limit: 6, status: 'asignado,en_proceso' }); } catch {}

  const queue = queueList(list.tickets, {
    title: 'Mi cola de trabajo',
    sub: data.avg_resolution_hours != null ? `Prom. resolución: ${formatDuration(data.avg_resolution_hours)}` : null,
    linkToAll: '/tickets',
    linkLabel: 'Ver todos',
    emptyTitle: 'Cola al día',
    emptyMessage: 'No tienes tickets asignados en este momento.',
  });
  const primaryGrid = h('div.grid.grid-cols-1.gap-3', { class: 'lg:grid-cols-3' }, [
    h('div', { class: 'lg:col-span-2' }, [queue]),
    h('div.card', {}, [
      h('div.dash-section-head', {}, [
        h('div.dash-section-title', {}, 'Por prioridad'),
        h('span.dash-section-sub', {}, 'De tu cola'),
      ]),
      priorityList(data.by_priority),
    ]),
  ]);
  root.appendChild(primaryGrid);

  root.appendChild(quickActions('admin_area'));

  return root;
}

/**
 * Arma el panel específico del rol supervisor de campo: últimos tickets creados por el usuario.
 * @param {Object} data - datos de estadísticas del dashboard
 * @returns {Promise<HTMLElement>} nodo con las secciones del panel de supervisor de campo
 */
async function supervisorDashboard(data) {
  const root = h('div.flex.flex-col.gap-5', {});

  let list = { tickets: [] };
  try { list = await api.tickets.list({ limit: 3 }); } catch {}

  const queue = queueList(list.tickets, {
    title: 'Últimos creados',
    linkToAll: '/tickets',
    linkLabel: 'Ver todos',
    emptyTitle: 'Sin tickets aún',
    emptyMessage: 'Tus tickets reportados aparecerán aquí.',
    emptyAction: canCreateTicket({ role: 'supervisor_campo' })
      ? { label: 'Crear primer ticket', onclick: () => go('/tickets/new') }
      : null,
  });
  root.appendChild(queue);

  root.appendChild(quickActions('supervisor_campo'));

  return root;
}

/**
 * Renderiza el desglose de tickets por estado (recibido, asignado, en proceso, etc.) con barras de progreso.
 * @param {Object} t - totales agregados de tickets por estado
 * @returns {HTMLElement} nodo con la lista de estados
 */
function statusBreakdown(t) {
  const states = [
    { key: 'recibido',    label: 'Recibidos' },
    { key: 'asignado',    label: 'Asignados' },
    { key: 'en_proceso',  label: 'En proceso' },
    { key: 'solucionado', label: 'Solucionados' },
    { key: 'cerrado',     label: 'Cerrados' },
    { key: 'reabierto',   label: 'Reabiertos' },
  ];
  const max = Math.max(1, ...states.map((s) => t[s.key] || 0));
  return h('div.flex.flex-col', { class: 'gap-2.5', 'aria-label': 'Distribución por estado' },
    states.map((s) => {
      const v = t[s.key] || 0;
      return h('div', {}, [
        h('div.dash-prio-row', {}, [
          h('span.dash-prio-dot-default', { 'aria-hidden': 'true' }),
          h('span.text-xs.font-medium.text-brand-ink.flex-1', {}, s.label),
          h('span.text-xs.text-slate-500.tabular-nums', {}, String(v)),
        ]),
        progressBar(v, max),
      ]);
    })
  );
}

