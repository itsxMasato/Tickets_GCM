import { h, escapeHtml } from '../utils/dom.js';
import { api } from '../api.js';
import { toast } from '../utils/toast.js';
import { go } from '../router.js';
import { setState, getState } from '../store.js';
import { relativeFromNow, formatDateTime } from '../utils/format.js';
import { ICON } from '../utils/icons.js';
import { emptyState, EMPTY_STATES } from '../components/empty-state.js';

const TYPE_LABEL = {
  ticket_created:        'Ticket creado',
  ticket_assigned:       'Asignación',
  ticket_commented:      'Comentario',
  ticket_status_changed: 'Cambio de estado',
  ticket_closed:         'Cerrado',
  ticket_reopened:       'Reabierto',
  ticket_transferred:    'Para tu revisión',
};

const TYPE_TONE = {
  ticket_created:        'bg-blue-100 text-blue-800',
  ticket_assigned:       'bg-brand/10 text-brand',
  ticket_commented:      'bg-slate-100 text-slate-700',
  ticket_status_changed: 'bg-amber-100 text-amber-800',
  ticket_closed:         'bg-emerald-100 text-emerald-800',
  ticket_reopened:       'bg-orange-100 text-orange-800',
  ticket_transferred:    'bg-brand-ocean/10 text-brand-ocean',
};

function pillFor(type) {
  const tone = TYPE_TONE[type] || 'bg-slate-100 text-slate-700';
  const cls = tone.replace(/\s+/g, '.');
  const iconPath = ICON[type];
  const iconHtml = iconPath
    ? `<svg class="w-3 h-3 mr-1 inline" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="${iconPath}"/></svg>`
    : '';
  return h(`span.badge.${cls}.inline-flex.items-center`, { html: `${iconHtml}${escapeHtml(TYPE_LABEL[type] || type)}` });
}

// Mini-resumen (KPIs) sobre la lista
function kpi(label, value, tone = 'text-brand-ink') {
  return h('div.card.flex.flex-col.gap-1', {}, [
    h('div.text-xs.uppercase.tracking-wider.text-slate-500.font-medium', {}, label),
    h(`div.text-2xl.font-bold.${tone}`, {}, String(value)),
  ]);
}

export async function renderNotifications({ user }) {
  const root = h('div.flex.flex-col.gap-4', {});

  // Header
  root.appendChild(h('div.flex.items-center.justify-between.flex-wrap.gap-3', {}, [
    h('div', {}, [
      h('h1.text-2xl.font-bold.text-brand-ink', {}, 'Centro de notificaciones'),
      h('p.text-sm.text-slate-500', {}, 'Actividad en tiempo real sobre tus tickets.'),
    ]),
    h('div.flex.items-center.gap-2', {}, [
      h('span.live-dot.hidden.sm\\:inline-flex.items-center.gap-1\\.5.text-xs.text-emerald-700', {}, [
        h('span.w-1.5.h-1.5.rounded-full.bg-emerald-500.animate-pulse'),
        'En vivo',
      ]),
      h('button.btn.btn-secondary', { onclick: () => markAll(reload) }, 'Marcar todas como leídas'),
      h('button.btn.btn-ghost', { onclick: reload, title: 'Recargar', 'aria-label': 'Recargar notificaciones' }, [
        h('svg.w-4.h-4', { fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', viewBox: '0 0 24 24', 'aria-hidden': 'true', html: '<path stroke-linecap="round" stroke-linejoin="round" d="M4 4v6h6M20 20v-6h-6M4 10a8 8 0 0114-3M20 14a8 8 0 01-14 3" />' }),
      ]),
    ]),
  ]));

  // Filtros
  const filterWrap = h('div.flex.items-center.gap-1.bg-white.border.border-surface-border.rounded-lg.p-1.shadow-soft.w-fit', {});
  const FILTERS = [
    { key: 'all',     label: 'Todas' },
    { key: 'unread',  label: 'No leídas' },
  ];
  let active = 'all';
  function setActive(k) {
    active = k;
    [...filterWrap.children].forEach((c, i) => {
      c.classList.toggle('bg-brand', FILTERS[i].key === k);
      c.classList.toggle('text-white', FILTERS[i].key === k);
      c.classList.toggle('text-brand-ink', FILTERS[i].key !== k);
    });
    reload();
  }
  FILTERS.forEach((f) => {
    const b = h('button.px-3.py-1\\.5.text-sm.rounded-md.font-medium', {
      onclick: () => setActive(f.key),
    }, f.label);
    filterWrap.appendChild(b);
  });
  setActive('all');
  root.appendChild(filterWrap);

  // KPIs (rellenados tras la primera carga)
  const kpis = h('div.grid.grid-cols-2.md\\:grid-cols-4.gap-3', {});
  root.appendChild(kpis);

  // Lista
  const list = h('div.flex.flex-col.gap-2', {});
  root.appendChild(list);

  async function reload() {
    list.innerHTML = '<div class="card text-center text-sm text-slate-500 py-12">Cargando…</div>';
    try {
      const { notifications } = await api.notifications.list({
        limit: 100,
        unread: active === 'unread' ? 'true' : 'false',
      });
      draw(notifications);
    } catch (e) {
      list.innerHTML = `<div class="card text-center text-sm text-red-600">${escapeHtml(e.message)}</div>`;
    }
  }

  async function markAll(fn) {
    try {
      await api.notifications.markRead({ all: true });
      toast('Notificaciones marcadas como leídas', 'success');
      setState({ unreadCount: 0 });
      fn();
    } catch (e) { toast(e.message, 'error'); }
  }

  function draw(items) {
    // KPIs
    kpis.innerHTML = '';
    const total = items.length;
    const unread = items.filter((n) => !n.read).length;
    const byType = items.reduce((acc, n) => { acc[n.type] = (acc[n.type] || 0) + 1; return acc; }, {});
    const topType = Object.entries(byType).sort((a, b) => b[1] - a[1])[0];
    kpis.appendChild(kpi('Total (vista)', total));
    kpis.appendChild(kpi('No leídas (vista)', unread, unread > 0 ? 'text-accent' : 'text-brand-ink'));
    kpis.appendChild(kpi('Última 24 h', items.filter((n) => Date.now() - new Date(n.created_at.replace(' ', 'T') + 'Z').getTime() < 24*3600*1000).length));
    kpis.appendChild(kpi('Tipo frecuente', topType ? (TYPE_LABEL[topType[0]] || topType[0]) : '—', 'text-brand'));

    // Lista
    list.innerHTML = '';
    if (!items.length) {
      list.appendChild(emptyState({
        ...EMPTY_STATES.notifications,
        message: active === 'unread'
          ? 'No tienes notificaciones sin leer.'
          : 'Aún no tienes notificaciones. Te avisaremos en tiempo real cuando haya actividad en tus tickets.',
      }));
      return;
    }

    for (const n of items) {
      const card = h('button.text-left.card.flex.items-start.gap-3.transition.hover\\:border-brand-ocean',
        { onclick: () => onClick(n) },
        [
          // Columna izquierda: tipo + estado
          h('div.flex.flex-col.items-center.gap-1.w-20.flex-none', {}, [
            pillFor(n.type),
            h('div.text-[10px].text-slate-400', { title: formatDateTime(n.created_at) }, relativeFromNow(n.created_at)),
            n.read ? null : h('span.dot.bg-accent', { title: 'No leída' }),
          ]),
          // Cuerpo
          h('div.flex-1.min-w-0', {}, [
            h('div.font-semibold.text-brand-ink.truncate', {}, n.title),
            n.body ? h('div.text-sm.text-slate-600.line-clamp-2.mt-0\\.5', {}, n.body) : null,
            h('div.flex.items-center.gap-2.mt-2.text-xs', {}, [
              h('span.text-slate-500', {}, n.ticket_id ? `Ticket #${n.ticket_id}` : ''),
              n.read ? null : h('span.text-accent.font-medium', {}, 'No leída'),
            ]),
          ]),
          // Acción rápida
          n.ticket_id
            ? h('span.text-xs.text-brand.font-medium.flex-none', {}, 'Abrir →')
            : null,
        ],
      );
      if (n.read) card.classList.add('opacity-60');
      else card.classList.add('border-l-4', 'border-l-accent');
      list.appendChild(card);
    }
  }

  async function onClick(n) {
    try { await api.notifications.markRead({ ids: [n.id] }); } catch {}
    setState({ unreadCount: Math.max(0, (getState().unreadCount || 0) - (n.read ? 0 : 1)) });
    if (n.ticket_id) go(`/tickets/${n.ticket_id}`);
    else reload();
  }

  await reload();

  // ── Tiempo real ─────────────────────────────────────────────────────────────
  const ac1 = subscribeToRealtimeEvents(['notification:new'], () => reload());
  const ac2 = subscribeToRealtimeEvents(['ticket:created', 'ticket:assigned', 'ticket:status_changed', 'ticket:commented', 'attachment:added', 'ticket:updated'], () => reload());

  // Cleanup al desmontar la vista
  root._cleanup = () => { ac1.abort(); ac2.abort(); };
  // Guardar referencia para que el router la limpie
  root._gcmCleanup = root._cleanup;

  return root;
}
