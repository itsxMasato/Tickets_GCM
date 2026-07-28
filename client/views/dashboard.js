/* Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. */
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

// ─────────────────────────────────────────────────────────────────────────
// Identidad de rol: una sola fuente para todo el render. Cada rol expone
// su propio set de KPIs, copy del hero, quick actions y panel primario.
// El diseño sigue la regla "cada rol es una superficie distinta" de
// PRODUCT.md §Anti-references (no dashboards idénticos).
//
// Devolvemos la key real del backend (la misma que viene en user.role y
// la misma que getRoleLabel conoce), para no mantener un mapa paralelo.
const ROL_FROM_USER = (user) =>
  isSAC(user)          ? 'sac'
  : isJefe(user)       ? 'jefe_inmediato'
  : isAdmin(user)      ? 'admin_area'
  : isSupervisor(user) ? 'supervisor_campo'
  : 'supervisor_campo';

// ─────────────────────────────────────────────────────────────────────────
// KPI sets por rol. Cada entrada: { label, value, hint, tone? }.
// `tone: 'accent'` tiñe el value de rojo camarón (urgentes), `'ocean'`
// de brand-ocean (info). El resto usa brand-ink (default).
// ─────────────────────────────────────────────────────────────────────────
// Cada KPI trae `icon` (chip superior) y `badge` (etiqueta corta de estado,
// tipo "CRÍTICO"/"META" — mismo lenguaje que el hero, sin inventar datos:
// el badge es sólo un rótulo sobre el mismo `value` que ya se calculaba).
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

// ─────────────────────────────────────────────────────────────────────────
// Hero copy por rol. Devuelve { count, headline, sub, ctaLabel, ctaHref,
// icon } para el CTA primaria. Si count === 0, el caller renderiza la
// variante "verde / sin pendientes" (sin CTA, sin acento rojo).
// ─────────────────────────────────────────────────────────────────────────
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
        count: -1, // -1 = sin cuantificar, CTA permanente
        icon: ICON.plus,
        eyebrow: 'Captura',
        headline: 'Reportar una incidencia',
        sub: 'Levanta un ticket en menos de un minuto desde el campo. Adjunta fotos, asigna categoría y prioridad.',
        ctaLabel: 'Crear ticket',
        ctaHref: '/tickets/new',
        ctaRole: 'supervisor', // hint para el caller
      };
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Quick actions por rol (máximo 3, contextual a su trabajo real).
// ─────────────────────────────────────────────────────────────────────────
// `tone` tiñe el chip de ícono (is-brand | is-ocean | is-accent | is-emerald)
// — misma idea que CATEGORY_TONES: variedad visual determinística, no color
// aleatorio. Sin tone = ocean (default ya existente en CSS).
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

// ─────────────────────────────────────────────────────────────────────────
// Helpers de UI
// ─────────────────────────────────────────────────────────────────────────

// Welcome strip — identidad del usuario en una línea. El topbar ya tiene
// el saludo; aquí añadimos contexto de rol/área y freshness del realtime.
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

// Hero action — la única zona de acento rojo en toda la vista. Si count===0
// y la acción es cuantificable, renderiza la variante verde (sin CTA).
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

// Mapa de tono → clases de acento lateral / chip de ícono / badge / valor.
// Un solo lugar para las 4 superficies que se tiñen juntas por KPI.
const KPI_TONE = {
  accent: { border: 'border-l-accent',       iconTone: 'is-accent',  badge: 'bg-accent/10 text-accent',           value: 'dash-kpi-accent' },
  ocean:  { border: 'border-l-brand-ocean',  iconTone: 'is-ocean',   badge: 'bg-brand-ocean/10 text-brand-ocean', value: 'dash-kpi-ocean' },
  good:   { border: 'border-l-emerald-500',  iconTone: 'is-emerald', badge: 'bg-emerald-100 text-emerald-700',    value: '' },
  '':     { border: 'border-l-surface-border-strong', iconTone: '',  badge: '',                                   value: '' },
};

// KPI card — acento lateral + chip de ícono + badge contextual opcional.
// `tone`: '' | 'accent' | 'ocean' | 'good'. Las clases dinámicas van por la
// prop `class` (no interpoladas en el selector — interpolarlas ahí es lo
// que hacía que el tono del valor nunca se aplicara antes de este cambio).
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

// Skeleton para una KPI card (mismas dimensiones que la real, incl. chip)
function kpiSkeleton() {
  return h('div.card.flex.flex-col.gap-3.border-l-4.border-l-surface-border', { 'aria-hidden': 'true' }, [
    h('div.flex.items-start.justify-between', {}, [
      h('div.w-9.h-9.rounded-lg.bg-slate-200.animate-pulse'),
      h('div.h-4.w-12.bg-slate-200.rounded.animate-pulse'),
    ]),
    h('div.h-7.bg-slate-200.rounded.animate-pulse', { class: 'w-1/2' }),
  ]);
}

// Tendencia de tickets (30 días) — línea + área (una sola serie = un solo
// hue, brand-ocean). Reemplaza el chart de 30 barras: con 30 categorías
// angostas una barra por día lee como ruido; el volumen diario es una
// tendencia (trend over time), así que la forma correcta es línea/área,
// no columnas — ver skill de dataviz §choosing-a-form. Línea de promedio
// sólida (nunca punteada: el punteado se lee como grid/eje, no como dato,
// ver anti-patterns §Marks). Eje X sólo en las marcas mayores (cada 5 días)
// para no repetir el desborde de texto que tenía la versión de barras.
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

  const fmtDay = (iso) => (iso || '').slice(5); // "MM-DD"
  const majorIdx = new Set(values.map((_, i) => (i % 5 === 0 ? i : -1)).filter((i) => i >= 0));
  majorIdx.add(n - 1); // el eje siempre termina mostrando el día más reciente

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
    'aria-hidden': 'true', // decorativo — el dato accesible vive en la tabla oculta de abajo
  }, [baseline, avgLine, area, line, endDot, crosshair, hoverDot, hitRect]);

  // Tooltip HTML (crosshair + tooltip son la capa de hover; ver dataviz
  // skill §interaction — todo chart HTML es interactivo por defecto).
  const tooltipDate = h('div.dash-trend-tooltip-date', {}, '');
  const tooltipValue = h('div.dash-trend-tooltip-value', {}, '');
  const tooltip = h('div.dash-trend-tooltip', {}, [tooltipDate, tooltipValue]);

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
  function clearActive() {
    crosshair.classList.remove('is-active');
    hoverDot.classList.remove('is-active');
    tooltip.classList.remove('is-active');
  }
  function indexFromClientX(clientX) {
    const rect = svg.getBoundingClientRect();
    const relX = ((clientX - rect.left) / rect.width) * VIEW_W;
    const raw = ((relX - padX) / plotW) * (n - 1);
    return Math.min(n - 1, Math.max(0, Math.round(raw)));
  }
  const onMove = (e) => setActive(indexFromClientX(e.clientX));
  const onLeave = () => clearActive();
  svg.addEventListener('pointermove', onMove);
  svg.addEventListener('pointerleave', onLeave);

  // Eje X — sólo marcas mayores (cada 5 días + el último), mismo criterio
  // que evitó el desborde de texto en la versión de barras.
  const axis = h('div.dash-trend-axis', {}, data.map((d, i) =>
    h('span.dash-trend-axis-label', {}, majorIdx.has(i) ? fmtDay(d.day || d.label) : '')));

  // Tabla oculta — equivalente accesible completo (screen readers / zoom
  // de texto), el chart en sí es aria-hidden y decorativo.
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

// Progress bar monocromática
function progressBar(value, max, color = 'bg-brand-ocean') {
  const pct = max ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return h('div.w-full.h-2.bg-slate-100.rounded.overflow-hidden', {}, [
    h('div.h-2.rounded.transition-all', { class: color, style: { width: `${pct}%` } }),
  ]);
}

// Lista "Por prioridad" — dot de acento sólo en urgente; la barra se tiñe
// por nivel para que la lectura sea visual, no solo por el número.
const PRIORITY_BAR_COLOR = {
  urgente: 'bg-accent',
  alta: 'bg-brand',
  media: 'bg-brand-ocean',
  baja: 'bg-slate-300',
};
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

// Formatea horas (float) a una unidad legible — minutos si es menos de 1h,
// horas con un decimal si es menos de 2 días, días si es más.
function formatDuration(hours) {
  if (hours == null || Number.isNaN(hours)) return '—';
  if (hours <= 0) return '0 min';
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  if (hours < 48) return `${hours.toFixed(1)} h`;
  return `${(hours / 24).toFixed(1)} d`;
}

// Por área — mismo lenguaje visual que priorityList (barra + conteo), pero
// por área operativa. Dato real de getStats().by_area, antes calculado en
// el backend y nunca mostrado en el dashboard SAC.
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

// Lista densa (carga por administrador — jefe) — con índice 1-N
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
      // Avatar real (foto o iniciales) — dato ya disponible en by_assignee
      // (avatar_url) pero sin usar hasta ahora en esta lista.
      showAvatar ? renderAvatar(it, { className: 'w-7 h-7 rounded-full text-[11px] font-semibold text-white flex items-center justify-center flex-none' }) : null,
      h('span.dash-list-name', { title: name }, name),
      meta ? h('span.dash-list-meta', {}, meta) : null,
      h('span.dash-list-count', {}, String(it.c ?? '')),
    ]);
  }));
}

// Top categorías — chip de ícono + nombre + badge de conteo. El tono rota
// de forma determinística por posición (misma idea que avatarColor: no hay
// "color de categoría" en el modelo de datos, así que el índice decide).
const CATEGORY_TONES = [
  { bg: 'bg-brand/10', text: 'text-brand' },
  { bg: 'bg-brand-ocean/10', text: 'text-brand-ocean' },
  { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  { bg: 'bg-amber-100', text: 'text-amber-700' },
  { bg: 'bg-violet-100', text: 'text-violet-700' },
  { bg: 'bg-slate-100', text: 'text-slate-600' },
];
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

// Ranking por encargado — avatar real (o iniciales) + puesto + carga.
// `c` cuenta tickets ASIGNADOS en total, no resueltos — el copy lo refleja
// para no prometer un dato que no tenemos (ver stats.service.js:dashboard).
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

// Cola de trabajo (admin / supervisor) — lista de ticket-cards
function queueList(tickets, { title, sub, linkToAll, linkLabel = 'Ver todos', emptyTitle, emptyMessage, emptyAction }) {
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

// Quick actions — botones contextuales por rol
//
// Nota: `class` (prop) en vez de interpolar el breakpoint en el selector.
// `h()` sólo reconoce clases estáticas vía `.clase` en el selector; un
// `\\:` escapado ahí (p.ej. `.sm\\:grid-cols-3`) rompe la regex de
// parsing (el ":" corta el token) y la clase responsive nunca se aplica
// — el grid quedaba en 1 columna siempre, sin importar el viewport.
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

// ─────────────────────────────────────────────────────────────────────────
// Render principal
// ─────────────────────────────────────────────────────────────────────────

export async function renderDashboard({ user }) {
  const rol = ROL_FROM_USER(user);
  const root = h('div.flex.flex-col.gap-5', {});

  // 1) Welcome strip (siempre visible — primer foco del tab)
  root.appendChild(welcomeStrip(user, new Date().toISOString()));

  // 2) Hero placeholder + KPIs placeholder
  const heroNode = heroAction(rol, { /* totales vacíos al inicio */ });
  const kpiNodes = buildKpis(rol, {}).map((k) => kpiSkeleton());
  const kpiRow = h('div.grid.grid-cols-2.gap-3', { class: 'md:grid-cols-4', 'aria-live': 'polite', 'aria-busy': 'true' }, kpiNodes);
  root.appendChild(heroNode);
  root.appendChild(kpiRow);

  // 3) Container del dashboard por rol (con skeleton)
  const roleNode = h('div.flex.flex-col.gap-5', { 'aria-busy': 'true' }, [
    // skeletons de relleno — un card + lista
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

  // 4) Carga inicial por rol
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

  // 5) Realtime: actualización granular con pulse en KPIs que cambian
  let currentTotals = (() => {
    // Capturar totales actuales desde el DOM (los que el primer load pintó)
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

      // Re-mount del role node (último hijo de root)
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

// ── helpers internos (top-level) ──

function applyHero(rootEl, r, totals) {
  // El primer hijo (welcome) no se toca; el segundo es el hero.
  const old = rootEl.children[1];
  if (!old) return {};
  const fresh = heroAction(r, totals);
  // Conservar foco si el botón hero lo tenía, para no perderlo en realtime
  const wasFocused = old.contains(document.activeElement);
  rootEl.replaceChild(fresh, old);
  if (wasFocused) {
    const btn = fresh.querySelector('button');
    if (btn) btn.focus();
  }
  // Devuelve los totales aplicados (como mapa label→value) para que el caller
  // pueda comparar en el siguiente ciclo de realtime.
  return (totals && typeof totals === 'object') ? { ...totals } : {};
}

function applyKpis(rootEl, r, totals, oldTotals) {
  // El tercer hijo es la fila de KPIs
  const row = rootEl.children[2];
  if (!row) return;
  const kpis = buildKpis(r, totals);
  const fresh = h('div.grid.grid-cols-2.gap-3', { class: 'md:grid-cols-4', 'aria-live': 'polite' },
    kpis.map((k) => kpi(k.label, k.value, k.hint, k.tone, k.icon, k.badge)));
  rootEl.replaceChild(fresh, row);

  // Pulso en KPIs que cambiaron de valor
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

// ─────────────────────────────────────────────────────────────────────────
// Dashboards por rol — primaria y secundaria
// ─────────────────────────────────────────────────────────────────────────

async function sacDashboard(data) {
  const root = h('div.flex.flex-col.gap-5', {});
  const t = data.totals || {};

  // Primaria: chart 30d + prioridad (2 columnas en lg)
  const primaryGrid = h('div.grid.grid-cols-1.gap-3', { class: 'lg:grid-cols-3' }, [
    h('div.card', { class: 'lg:col-span-2' }, [
      h('div.dash-section-head', {}, [
        h('div', {}, [
          h('div.dash-section-title', {}, 'Tickets creados en los últimos 30 días'),
          h('div.dash-section-sub', {}, 'Volumen diario y promedio del período'),
        ]),
        h('div.flex.flex-col.items-end', { class: 'gap-0.5' }, [
          h('span.dash-section-sub', {}, `${t.total ?? 0} en el mes`),
          // Promedio de resolución — dato real ya calculado en getStats()
          // (avg_resolution_hours) pero sin usar hasta ahora en la UI.
          data.avg_resolution_hours != null
            ? h('span.dash-section-sub', {}, `Prom. resolución: ${formatDuration(data.avg_resolution_hours)}`)
            : null,
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

  // Secundaria: top categorías + ranking por encargado + por área (3
  // columnas en lg). "Por área" es dato real (by_area, ya calculado en
  // getStats()) que no se mostraba en ningún lado del dashboard SAC.
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

  // Quick actions (3)
  root.appendChild(quickActions('sac'));

  return root;
}

async function jefeDashboard(data) {
  const root = h('div.flex.flex-col.gap-5', {});
  const t = data.totals || {};

  // Primaria: carga por administrador + mini distribución
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
      // Mini progress por estado
      statusBreakdown(t),
    ]),
  ]);
  root.appendChild(primaryGrid);

  // Quick actions
  root.appendChild(quickActions('jefe_inmediato'));

  return root;
}

async function adminDashboard(data) {
  const root = h('div.flex.flex-col.gap-5', {});

  let list = { tickets: [] };
  try { list = await api.tickets.list({ limit: 6, status: 'asignado,en_proceso' }); } catch {}

  // Primaria: mi cola (2/3) + por prioridad (1/3). El breakdown por prioridad
  // es dato real (by_priority, ya calculado en getStatsForUser) que antes no
  // se mostraba en el dashboard de admin_area — sólo en el de SAC.
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

  // Quick actions
  root.appendChild(quickActions('admin_area'));

  return root;
}

async function supervisorDashboard(data) {
  const root = h('div.flex.flex-col.gap-5', {});

  let list = { tickets: [] };
  try { list = await api.tickets.list({ limit: 3 }); } catch {}

  // Primaria: últimos creados
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

  // Quick actions
  root.appendChild(quickActions('supervisor_campo'));

  return root;
}

// Mini breakdown de estado (para jefe) — progress bars pequeñas
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
