import { h } from '../utils/dom.js';
import { api } from '../api.js';
import { ticketCard } from '../components/ticket-card.js';
import { go } from '../router.js';
import { isSAC, isJefe, isAdmin, isSupervisor } from '../utils/permissions.js';
import { formatDateTime, PRIORITY_LABEL } from '../utils/format.js';
import { ICON } from '../utils/icons.js';
import { emptyState, EMPTY_STATES } from '../components/empty-state.js';
import { subscribeToRealtimeEvents } from '../utils/realtime.js';

function kpi(label, value, hint = '') {
  return h('div.kpi-card', {}, [
    h('div.kpi-label', {}, label),
    h('div.kpi-value', {}, String(value)),
    hint ? h('div.kpi-hint', {}, hint) : null,
  ]);
}

// Resumen compacto para los 3 KPI del header, calculado a partir de
// los totales que ya devuelve el endpoint por rol. Devuelve { open, pending, urgent }.
function headerKpisFromTotals(totals) {
  const t = totals || {};
  // Distintos endpoints definen totales ligeramente distintos; cubrimos ambos.
  const open = t.open ?? ((t.total || 0) - (t.closed || 0));
  // Pendientes de revisión: tickets en estados que requieren acción del usuario.
  // Para SAC/admin/jefe = "no cerrados" y aún no resueltos; para supervisor = sus abiertos.
  const pending = (t.open != null)
    ? t.open
    : (t.total || 0) - (t.closed || 0);
  const urgent = t.urgent ?? 0;
  return {
    open: open || 0,
    pending: pending || 0,
    urgent,
  };
}

function chartBars(data, valueKey = 'c') {
  // data: [{ day, c }] o [{ label, c }]
  const max = Math.max(1, ...data.map((d) => d[valueKey] || 0));
  return h('div.flex.items-end.gap-1.h-32', { role: 'img', 'aria-label': 'Gráfica de barras de tickets creados en los últimos 30 días' }, data.map((d) => {
    const v = d[valueKey] || 0;
    const pct = v === 0 ? 0 : Math.max(2, Math.round((v / max) * 100));
    const label = (d.day || d.label || '').slice(5);
    return h('div.flex-1.flex.flex-col.items-center.justify-end.group', { title: `${label}: ${v}` }, [
      h('div.text-\\[10px\\].font-medium.text-slate-600.mb-0\\.5', {}, String(v)),
      h('div.w-full.bg-brand-ocean.rounded-t.transition-all.group-hover\\:bg-brand-deep', { style: { height: `${pct}%`, minHeight: '2px' } }),
      h('div.text-\\[10px\\].text-slate-500.mt-1', {}, label),
    ]);
  }));
}

function progressBar(value, max, color = 'bg-brand-ocean') {
  const pct = max ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return h('div.w-full.h-2.bg-slate-100.rounded.overflow-hidden', {}, [
    h('div.h-2.rounded.transition-all', { class: color, style: { width: `${pct}%` } }),
  ]);
}

export async function renderDashboard({ user }) {
  const root = h('div.flex.flex-col.gap-6', {});

  // KPIs del header: refs a las cards para poder actualizarlas al recibir realtime.
  const headerKpiOpen = kpi('Tickets abiertos', '0', 'Monitoriza tu cola activa');
  const headerKpiPending = kpi('Pendientes de revisión', '0', 'Actualizado en tiempo real');
  const headerKpiUrgent = kpi('Alertas críticas', '0', 'Prioridad elevada');
  const headerKpiCards = h('div.grid.grid-cols-1.sm:grid-cols-3.gap-3.mt-6', {}, [
    headerKpiOpen, headerKpiPending, headerKpiUrgent,
  ]);

  function applyHeaderKpis(totals) {
    const k = headerKpisFromTotals(totals);
    headerKpiOpen.querySelector('.kpi-value').textContent = String(k.open);
    headerKpiPending.querySelector('.kpi-value').textContent = String(k.pending);
    headerKpiUrgent.querySelector('.kpi-value').textContent = String(k.urgent);
  }

  root.appendChild(h('div.card.bg-white.p-6', {}, [
    h('div.flex.flex-col.gap-4.lg:flex-row.lg:items-center.lg:justify-between', {}, [
      h('div.max-w-2xl', {}, [
      h('div.flex.items-center.gap-2.flex-wrap', {}, [
        h('p.text-xs.font-semibold.uppercase.tracking-[0.3em].text-brand-ink/70', {}, 'Resumen ejecutivo'),
        h('span.inline-flex.items-center.gap-1.5.px-2.py-0.5.rounded-full.bg-emerald-50.text-emerald-700.text-\\[11px\\].font-medium', {}, [
          h('span.w-1\\.5.h-1\\.5.rounded-full.bg-emerald-500.animate-pulse', { 'aria-hidden': 'true' }),
          'En vivo',
        ]),
      ]),
      h('h1.text-3xl.font-bold.text-slate-900', {}, `Hola, ${user.full_name.split(' ')[0]}`),
        h('p.text-sm.text-slate-500.mt-3', {}, 'Tus métricas clave, accesos rápidos y estado actual de tickets en un solo lugar.'),
      ]),
      h('div.flex.flex-wrap.items-center.gap-2', {}, [
        h('button.btn.btn-secondary', { onclick: () => go('/tickets') }, 'Ver tickets'),
        (isSAC(user) || isSupervisor(user)) ? h('button.btn.btn-primary', { onclick: () => go('/tickets/new') }, '+ Nuevo ticket') : null,
      ]),
    ]),
    headerKpiCards,
  ]));

  // Carga inicial: datos del dashboard por rol (incluye totales) y rellena los KPIs del header.
  let roleNode;
  if (isSAC(user)) {
    const data = await api.stats.dashboard().catch(() => ({}));
    applyHeaderKpis(data.totals);
    roleNode = await sacDashboard();
  } else if (isJefe(user)) {
    const data = await api.stats.me().catch(() => ({}));
    applyHeaderKpis(data.totals);
    roleNode = await jefeDashboard(user);
  } else if (isAdmin(user)) {
    const data = await api.stats.me().catch(() => ({}));
    applyHeaderKpis(data.totals);
    roleNode = await adminDashboard(user);
  } else {
    const data = await api.stats.me().catch(() => ({}));
    applyHeaderKpis(data.totals);
    roleNode = await supervisorDashboard(user);
  }
  root.appendChild(roleNode);

  // ── Tiempo real: refrescar KPIs del header y del dashboard al cambiar algo.
  const evs = ['ticket:created', 'ticket:updated', 'ticket:assigned',
               'ticket:status_changed', 'ticket:commented', 'attachment:added'];
  const ac = subscribeToRealtimeEvents(evs, async (detail) => {
    try {
      // Re-leer totales del endpoint que corresponde al rol.
      const fresh = isSAC(user) ? await api.stats.dashboard().catch(() => ({}))
                    : await api.stats.me().catch(() => ({}));
      applyHeaderKpis(fresh.totals);
      // Re-montar el dashboard por rol con datos frescos.
      const newRole = isSAC(user) ? await sacDashboard()
                    : isJefe(user) ? await jefeDashboard(user)
                    : isAdmin(user) ? await adminDashboard(user)
                    : await supervisorDashboard(user);
      if (root.children[1]) root.replaceChild(newRole, root.children[1]);
      else root.appendChild(newRole);
    } catch {}
  });

  return { view: root, cleanup: () => ac.abort() };
}

async function sacDashboard() {
  let data;
  try { data = await api.stats.dashboard(); } catch { data = { totals: {} }; }
  const root = h('div.flex.flex-col.gap-6', {});

  // KPIs
  const t = data.totals || {};
  root.appendChild(h('div.grid.grid-cols-2.md\\:grid-cols-4.gap-3', {}, [
    kpi('Total', t.total || 0),
    kpi('Abiertos', t.open || 0, 'No cerrados'),
    kpi('Cerrados', t.closed || 0),
    kpi('Tiempo prom. cierre', `${(data.avg_resolution_hours || 0).toFixed(1)} h`),
  ]));

  // Charts: 30 días + prioridades
  const row = h('div.grid.grid-cols-1.lg\\:grid-cols-3.gap-3', {}, [
    h('div.card.lg\\:col-span-2', {}, [
      h('h3.text-sm.font-semibold.text-slate-700.mb-3', {}, 'Tickets creados (últimos 30 días)'),
      data.last_30_days?.length ? chartBars(data.last_30_days) : emptyState({
        ...EMPTY_STATES.dashboard,
        message: 'No hay datos para los últimos 30 días.',
      }),
    ]),
    h('div.card', {}, [
      h('h3.text-sm.font-semibold.text-slate-700.mb-3', {}, 'Por prioridad'),
      h('div.flex.flex-col.gap-2', {}, (data.by_priority || []).map((p) => {
        const max = Math.max(1, ...data.by_priority.map((x) => x.c));
        return h('div', {}, [
          h('div.flex.items-center.justify-between.text-xs.mb-1', {}, [
            h('span', {}, PRIORITY_LABEL[p.priority] || p.priority),
            h('span.text-slate-500', {}, String(p.c)),
          ]),
          progressBar(p.c, max, p.priority === 'urgente' ? 'bg-accent' : p.priority === 'alta' ? 'bg-amber-500' : 'bg-brand-ocean'),
        ]);
      })),
    ]),
  ]);
  root.appendChild(row);

  // Top categorías + Ranking por encargado
  root.appendChild(h('div.grid.grid-cols-1.lg\\:grid-cols-2.gap-3', {}, [
    h('div.card', {}, [
      h('h3.text-sm.font-semibold.text-slate-700.mb-3', {}, 'Top categorías'),
      h('ul.flex.flex-col.gap-1.text-sm', {}, (data.top_categories || []).map((c) => h('li.flex.items-center.justify-between', {}, [
        h('span.text-slate-700', {}, c.name),
        h('span.badge.bg-slate-100.text-slate-700', {}, String(c.c)),
      ]))),
    ]),
    h('div.card', {}, [
      h('h3.text-sm.font-semibold.text-slate-700.mb-3', {}, 'Ranking por encargado'),
      h('ul.flex.flex-col.gap-1.text-sm', {}, (data.by_assignee || []).slice(0, 8).map((u) => h('li.flex.items-center.justify-between', {}, [
        h('span.text-slate-700', {}, u.full_name),
        h('span.text-slate-500.text-xs', {}, u.area || ''),
        h('span.badge.bg-brand\\/10.text-brand', {}, String(u.c)),
      ]))),
    ]),
  ]));

  // Accesos rápidos (ligeros, como pidió el usuario)
  function svg(path, cls = 'w-4 h-4') {
    return h(`svg.${cls}`, { fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', viewBox: '0 0 24 24', 'aria-hidden': 'true', html: `<path stroke-linecap="round" stroke-linejoin="round" d="${path}" />` });
  }
  root.appendChild(h('div.card', {}, [
    h('h3.text-sm.font-semibold.text-slate-700.mb-3', {}, 'Acciones rápidas'),
    h('div.grid.grid-cols-2.sm\\:grid-cols-4.gap-2', {}, [
      h('button.btn.btn-secondary.justify-start.gap-2', { onclick: () => go('/tickets?status=recibido') }, [svg(ICON.inbox), 'Bandeja de recibidos']),
      h('button.btn.btn-secondary.justify-start.gap-2', { onclick: () => go('/tickets?status=reabierto') }, [svg(ICON.reopen), 'Reabiertos']),
      h('button.btn.btn-secondary.justify-start.gap-2', { onclick: () => go('/users') }, [svg(ICON.users), 'Gestionar usuarios']),
      h('button.btn.btn-secondary.justify-start.gap-2', { onclick: () => go('/reports') }, [svg(ICON.report), 'Ver reportes']),
    ]),
  ]));

  return root;
}

async function jefeDashboard(user) {
  let data;
  try { data = await api.stats.me(); } catch { data = { totals: {} }; }
  const root = h('div.flex.flex-col.gap-6', {});
  const t = data.totals || {};
  root.appendChild(h('div.grid.grid-cols-2.md\\:grid-cols-5.gap-3', {}, [
    kpi('Total área', t.total || 0),
    kpi('Abiertos', t.open || 0),
    kpi('Cerrados', t.closed || 0),
    kpi('Solucionados', t.solved || 0),
    kpi('Reabiertos', t.reopened || 0),
  ]));
  root.appendChild(h('div.grid.grid-cols-1.lg\\:grid-cols-2.gap-3', {}, [
    h('div.card', {}, [
      h('h3.text-sm.font-semibold.text-slate-700.mb-3', {}, 'Carga por administrador'),
      h('ul.flex.flex-col.gap-2.text-sm', {}, (data.by_assignee || []).map((u) => h('li.flex.items-center.gap-2', {}, [
        h('span.flex-1.text-slate-700', {}, u.full_name),
        h('span.badge.bg-slate-100', {}, String(u.c)),
      ]))),
    ]),
    h('div.card', {}, [
      h('h3.text-sm.font-semibold.text-slate-700.mb-3', {}, 'Tickets por cerrar'),
      h('button.btn.btn-primary', { onclick: () => go('/tickets?status=solucionado') }, 'Ir a tickets en “Solucionado”'),
    ]),
  ]));
  return root;
}

async function adminDashboard(user) {
  let data;
  try { data = await api.stats.me(); } catch { data = { totals: {} }; }
  const root = h('div.flex.flex-col.gap-6', {});
  const t = data.totals || {};
  root.appendChild(h('div.grid.grid-cols-2.md\\:grid-cols-4.gap-3', {}, [
    kpi('Asignados a mí', t.total || 0),
    kpi('En proceso', t.en_proceso || 0),
    kpi('Solucionados', t.solucionado || 0),
    kpi('Reabiertos', t.reabierto || 0),
  ]));
  root.appendChild(h('div.card', {}, [
    h('h3.text-sm.font-semibold.text-slate-700.mb-3', {}, 'Tickets activos'),
    h('button.btn.btn-primary', { onclick: () => go('/tickets') }, 'Abrir mi lista'),
  ]));
  return root;
}

async function supervisorDashboard(user) {
  let data;
  try { data = await api.stats.me(); } catch { data = { totals: {} }; }
  const t = data.totals || {};
  let list = { tickets: [] };
  try { list = await api.tickets.list({ limit: 5 }); } catch {}
  const root = h('div.flex.flex-col.gap-6', {});
  root.appendChild(h('div.grid.grid-cols-3.gap-3', {}, [
    kpi('Mis tickets', t.total || 0),
    kpi('Abiertos', t.open || 0),
    kpi('Cerrados', t.closed || 0),
  ]));
  root.appendChild(h('div.card', {}, [
    h('div.flex.items-center.justify-between.mb-3', {}, [
      h('h3.text-sm.font-semibold.text-slate-700', {}, 'Últimos creados'),
      h('button.btn.btn-secondary.btn-sm', { onclick: () => go('/tickets') }, 'Ver todos'),
    ]),
    h('div.grid.grid-cols-1.md\\:grid-cols-2.lg\\:grid-cols-3.gap-2', {}, list.tickets.map(ticketCard)),
  ]));
  return root;
}
