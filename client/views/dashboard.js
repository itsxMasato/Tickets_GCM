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
function buildKpis(rol, totals) {
  const t = totals || {};
  switch (rol) {
    case 'sac':
      return [
        { label: 'Abiertos',      value: t.open  ?? 0, hint: 'Tickets sin cerrar' },
        { label: 'Sin asignar',   value: t.recibido ?? 0, hint: 'Esperan triage', tone: 'ocean' },
        { label: 'Urgentes',      value: t.urgent ?? 0, hint: 'Prioridad elevada', tone: 'accent' },
        { label: 'Cerrados hoy',  value: t.closed_today ?? 0, hint: 'Resueltos en el día' },
      ];
    case 'admin_area':
      return [
        { label: 'Asignados a mí', value: t.total ?? 0, hint: 'Tu cola activa' },
        { label: 'En proceso',     value: t.en_proceso ?? 0, hint: 'En curso ahora', tone: 'ocean' },
        { label: 'Solucionados',   value: t.solucionado ?? 0, hint: 'Listos para cerrar' },
        { label: 'Reabiertos',     value: t.reabierto ?? 0, hint: 'Volvieron a tu cola', tone: 'accent' },
      ];
    case 'jefe_inmediato':
      return [
        { label: 'Total área',     value: t.total ?? 0, hint: 'Tickets del área' },
        { label: 'Abiertos',       value: t.open ?? 0, hint: 'No cerrados' },
        { label: 'Por cerrar',     value: t.por_cerrar ?? 0, hint: 'En estado solucionado', tone: 'ocean' },
        { label: 'Reabiertos',     value: t.reopened ?? 0, hint: 'Volvieron al área', tone: 'accent' },
      ];
    case 'supervisor_campo':
    default:
      return [
        { label: 'Mis tickets',     value: t.total ?? 0, hint: 'Reportados por ti' },
        { label: 'Abiertos',        value: t.open ?? 0, hint: 'En curso', tone: 'ocean' },
        { label: 'Cerrados este mes',  value: t.closed_month ?? 0, hint: 'Resueltos este mes' },
        { label: 'Tasa de cierre',  value: t.closure_rate != null ? `${t.closure_rate}%` : '—', hint: 'Sobre el total reportado' },
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
function buildQuickActions(rol) {
  switch (rol) {
    case 'sac':
      return [
        { icon: ICON.inbox,     title: 'Bandeja de recibidos', sub: 'Tickets sin asignar',          href: '/tickets?status=recibido' },
        { icon: ICON.reopen,    title: 'Reabiertos',           sub: 'Tickets que volvieron al flujo', href: '/tickets?status=reabierto' },
        { icon: ICON.report,    title: 'Reportes',             sub: 'Exportes Excel y PDF',          href: '/reports' },
      ];
    case 'admin_area':
      return [
        { icon: ICON.ticket,    title: 'Mi área',              sub: 'Todos los tickets del área',     href: '/tickets' },
        { icon: ICON.bell,      title: 'Notificaciones',       sub: 'Bandeja de entrada',            href: '/notifications' },
        { icon: ICON.users,     title: 'Equipo',               sub: 'Compañeros de área',            href: '/users' },
      ];
    case 'jefe_inmediato':
      return [
        { icon: ICON.report,    title: 'Reportes',             sub: 'Métricas y exportes',           href: '/reports' },
        { icon: ICON.ticket,    title: 'Tickets del área',     sub: 'Vista global del área',          href: '/tickets' },
        { icon: ICON.bell,      title: 'Notificaciones',       sub: 'Bandeja de entrada',            href: '/notifications' },
      ];
    case 'supervisor_campo':
    default:
      return [
        { icon: ICON.ticket,    title: 'Mis tickets',          sub: 'Tus tickets reportados',        href: '/tickets' },
        { icon: ICON.bell,      title: 'Notificaciones',       sub: 'Bandeja de entrada',            href: '/notifications' },
        { icon: ICON.plus,      title: 'Crear nuevo',          sub: 'Reportar una incidencia',       href: '/tickets/new' },
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
    h('span.dash-welcome-name', {}, `Hola, ${firstName}`),
    h('span.dash-welcome-dot', { 'aria-hidden': 'true' }),
    h('span.dash-welcome-role', {}, roleLabel),
    areaLabel && h('span.dash-welcome-dot', { 'aria-hidden': 'true' }),
    areaLabel && h('span.dash-welcome-meta', {}, areaLabel),
    h('span.dash-welcome-dot', { 'aria-hidden': 'true' }),
    h('span.dash-welcome-time', { 'aria-live': 'polite' }, `Actualizado ${fresh}`),
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
    h('div.flex.items-start.gap-4.min-w-0', {}, [
      h('span.dash-quick-icon.flex-none', { 'aria-hidden': 'true' }, [
        svg(h, h_.icon, 'w-5 h-5'),
      ]),
      h('div.min-w-0', {}, [
        h('div.dash-hero-eyebrow', {}, h_.eyebrow),
        h('div.dash-hero-title', {}, h_.headline),
        h('div.dash-hero-sub', {}, h_.sub),
      ]),
    ]),
    h('div.flex-none', {}, [
      h('button.btn.btn-accent.gap-1.5', {
        onclick: () => go(h_.ctaHref),
        'aria-label': `${h_.ctaLabel}. ${h_.headline}`,
      }, [
        h('span', {}, h_.ctaLabel),
        h('span', { 'aria-hidden': 'true' }, '→'),
      ]),
    ]),
  ]);
}

// KPI card — extendida con `tone` opcional ('accent' | 'ocean').
function kpi(label, value, hint = '', tone = '') {
  const valueClass = `kpi-value${tone === 'accent' ? ' dash-kpi-accent' : tone === 'ocean' ? ' dash-kpi-ocean' : ''}`;
  return h('div.kpi-card', { 'data-kpi-label': label }, [
    h('div.kpi-label', {}, label),
    h(`div.${valueClass}`, { 'data-kpi-value': String(value) }, String(value)),
    hint ? h('div.kpi-hint', {}, hint) : null,
  ]);
}

// Skeleton para una KPI card (mismas dimensiones que la real)
function kpiSkeleton() {
  return h('div.card.flex.flex-col.gap-2', { 'aria-hidden': 'true' }, [
    h('div.h-3.w-1\\/3.bg-slate-200.rounded.animate-pulse'),
    h('div.h-7.w-1\\/2.bg-slate-200.rounded.animate-pulse'),
  ]);
}

// Chart de barras (30 días) — versión con axis, average y hovers limpios.
function chartBars(data) {
  if (!data || data.length === 0) {
    return emptyState({
      ...EMPTY_STATES.dashboard,
      message: 'No hay datos para los últimos 30 días.',
    });
  }
  const values = data.map((d) => d.c || 0);
  const max = Math.max(1, ...values);
  const total = values.reduce((s, v) => s + v, 0);
  const avg = total / values.length;
  const avgPct = (avg / max) * 100;

  // Etiqueta: día-mes formato corto
  const fmtDay = (iso) => (iso || '').slice(5); // "MM-DD"
  // Etiquetas principales: cada 5 (0, 5, 10…)
  const majorIdx = new Set(values.map((_, i) => (i % 5 === 0 ? i : -1)).filter((i) => i >= 0));

  const bars = data.map((d, i) => {
    const v = d.c || 0;
    const pct = v === 0 ? 0 : Math.max(2, Math.round((v / max) * 100));
    const intensity = pct / 100;
    const fillStyle = v === 0
      ? { height: '2px', opacity: 1, backgroundColor: 'rgb(214, 222, 232)' /* surface-border */ }
      : {
        height: `${pct}%`,
        minHeight: '16px',
        opacity: 0.7 + 0.3 * intensity,
        backgroundColor: 'rgb(22, 172, 228)',
      };
    const labelMajor = majorIdx.has(i) ? ' is-major' : '';
    const labelText = fmtDay(d.day || d.label);
    return h('div.dash-chart-bar.group', {
      title: `${labelText}: ${v} ticket${v === 1 ? '' : 's'}`,
      tabindex: '0',
      role: 'img',
      'aria-label': `${labelText}: ${v} tickets`,
    }, [
      h('div.dash-chart-bar-value', {}, String(v)),
      h('div.dash-chart-bar-fill', { style: fillStyle }),
      h(`div.dash-chart-bar-label${labelMajor}`, {}, labelText),
    ]);
  });

  // Línea de promedio (oculta si max es muy bajo)
  const avgMarker = max <= 1
    ? null
    : [
        h('div.dash-chart-avg', { style: { bottom: `${avgPct}%` } }),
        h('div.dash-chart-avg-label', { style: { bottom: `${avgPct}%` } }, `Prom: ${avg.toFixed(1)}`),
      ];

  // sr-only summary
  const summary = `Gráfico de ${data.length} días. Máximo ${max}, promedio ${avg.toFixed(1)}.`;

  return h('div', { role: 'img', 'aria-label': summary }, [
    h('div.dash-chart', {}, [
      ...avgMarker,
      ...bars,
    ]),
  ]);
}

// Progress bar monocromática
function progressBar(value, max, color = 'bg-brand-ocean') {
  const pct = max ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return h('div.w-full.h-2.bg-slate-100.rounded.overflow-hidden', {}, [
    h('div.h-2.rounded.transition-all', { class: color, style: { width: `${pct}%` } }),
  ]);
}

// Lista "Por prioridad" — dot de acento sólo en urgente, bar ocean siempre
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
      progressBar(p.c, max),
    ]);
  }));
}

// Lista densa (categorías, ranking por encargado) — con índice 1-N
function denseList(items, opts = {}) {
  const { getName, getMeta, showIndex = true, max = 8 } = opts;
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
      h('span.dash-list-name', { title: name }, name),
      meta ? h('span.dash-list-meta', {}, meta) : null,
      h('span.dash-list-count', {}, String(it.c ?? '')),
    ]);
  }));
}

// Cola de trabajo (admin / supervisor) — lista de ticket-cards
function queueList(tickets, { title, linkToAll, linkLabel = 'Ver todos', emptyTitle, emptyMessage, emptyAction }) {
  const head = h('div.dash-section-head.px-5.pt-4', {}, [
    h('div', {}, [
      h('div.dash-section-title', {}, title),
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
function quickActions(rol) {
  const items = buildQuickActions(rol);
  return h('div.grid.grid-cols-1.sm\\:grid-cols-3.gap-3', {}, items.map((it) =>
    h('a.dash-quick', {
      href: it.href,
      onclick: (e) => { e.preventDefault(); go(it.href); },
      'aria-label': `${it.title}. ${it.sub}`,
    }, [
      h('span.dash-quick-icon', { 'aria-hidden': 'true' }, [svg(h, it.icon, 'w-5 h-5')]),
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
  const kpiNodes = buildKpis(rol, {}).map((k) => kpi(k.label, '0', k.hint, k.tone));
  const kpiRow = h('div.grid.grid-cols-2.md\\:grid-cols-4.gap-3', { 'aria-live': 'polite', 'aria-busy': 'true' }, kpiNodes);
  root.appendChild(heroNode);
  root.appendChild(kpiRow);

  // 3) Container del dashboard por rol (con skeleton)
  const roleNode = h('div.flex.flex-col.gap-5', { 'aria-busy': 'true' }, [
    // skeletons de relleno — un card + lista
    h('div.card.p-5', {}, [
      h('div.dash-section-head', {}, [
        h('div.h-3.w-1\\/3.bg-slate-200.rounded.animate-pulse'),
        h('div.h-3.w-1\\/6.bg-slate-200.rounded.animate-pulse'),
      ]),
      h('div.h-32.md\\:h-40.bg-slate-100.rounded.animate-pulse'),
    ]),
    h('div.grid.grid-cols-1.md\\:grid-cols-2.gap-3', {}, [
      h('div.card.flex.flex-col.gap-2', { 'aria-hidden': 'true' }, [
        h('div.h-3.w-1\\/3.bg-slate-200.rounded.animate-pulse'),
        h('div.h-3.w-3\\/4.bg-slate-200.rounded.animate-pulse'),
        h('div.h-3.w-2\\/3.bg-slate-200.rounded.animate-pulse'),
      ]),
      h('div.card.flex.flex-col.gap-2', { 'aria-hidden': 'true' }, [
        h('div.h-3.w-1\\/3.bg-slate-200.rounded.animate-pulse'),
        h('div.h-3.w-3\\/4.bg-slate-200.rounded.animate-pulse'),
        h('div.h-3.w-2\\/3.bg-slate-200.rounded.animate-pulse'),
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
    root.replaceChild(h('div.card.p-6.text-center.text-sm.text-brand-ink\\/70', {},
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
  const fresh = h('div.grid.grid-cols-2.md\\:grid-cols-4.gap-3', { 'aria-live': 'polite' },
    kpis.map((k) => kpi(k.label, k.value, k.hint, k.tone)));
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
  const primaryGrid = h('div.grid.grid-cols-1.lg\\:grid-cols-3.gap-3', {}, [
    h('div.card.lg\\:col-span-2', {}, [
      h('div.dash-section-head', {}, [
        h('div', {}, [
          h('div.dash-section-title', {}, 'Tickets creados en los últimos 30 días'),
          h('div.dash-section-sub', {}, 'Volumen diario y promedio del período'),
        ]),
        h('span.dash-section-sub', {}, `${t.total ?? 0} en el mes`),
      ]),
      chartBars(data.last_30_days),
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

  // Secundaria: top categorías + ranking por encargado
  const secondaryGrid = h('div.grid.grid-cols-1.lg\\:grid-cols-2.gap-3', {}, [
    h('div.card', {}, [
      h('div.dash-section-head', {}, [
        h('div.dash-section-title', {}, 'Top categorías'),
        h('a.dash-section-link', { href: '/categories', onclick: (e) => { e.preventDefault(); go('/categories'); } }, [
          h('span', {}, 'Ver todas'),
          h('span', { 'aria-hidden': 'true' }, '→'),
        ]),
      ]),
      denseList(data.top_categories, {
        getName: (c) => c.name,
        getMeta: () => null,
        max: 6,
      }),
    ]),
    h('div.card', {}, [
      h('div.dash-section-head', {}, [
        h('div.dash-section-title', {}, 'Ranking por encargado'),
        h('span.dash-section-sub', {}, 'Carga de trabajo'),
      ]),
      denseList(data.by_assignee, {
        getName: (u) => u.full_name,
        getMeta: (u) => u.area || '',
        max: 6,
      }),
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
  const primaryGrid = h('div.grid.grid-cols-1.lg\\:grid-cols-2.gap-3', {}, [
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
  root.appendChild(quickActions('jefe'));

  return root;
}

async function adminDashboard(data) {
  const root = h('div.flex.flex-col.gap-5', {});

  let list = { tickets: [] };
  try { list = await api.tickets.list({ limit: 6, status: 'asignado,en_proceso' }); } catch {}

  // Primaria: mi cola
  const queue = queueList(list.tickets, {
    title: 'Mi cola de trabajo',
    linkToAll: '/tickets',
    linkLabel: 'Ver todos',
    emptyTitle: 'Cola al día',
    emptyMessage: 'No tienes tickets asignados en este momento.',
  });
  root.appendChild(queue);

  // Quick actions
  root.appendChild(quickActions('admin'));

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
  root.appendChild(quickActions('supervisor'));

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
  return h('div.flex.flex-col.gap-2.5', { 'aria-label': 'Distribución por estado' },
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
