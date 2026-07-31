/* Documentado por: Miguel Flores */
import { h, escapeHtml } from '../utils/dom.js';
import { api } from '../api.js';
import { toast } from '../utils/toast.js';
import { go } from '../router.js';
import { setState, getState } from '../store.js';
import { relativeFromNow, formatDateTime } from '../utils/format.js';
import { ICON, svg } from '../utils/icons.js';
import { subscribeToRealtimeEvents } from '../utils/realtime.js';
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

const TYPE_CTA = {
  ticket_created:        'Abrir ticket',
  ticket_assigned:       'Abrir ticket',
  ticket_commented:      'Responder',
  ticket_status_changed: 'Ver estado',
  ticket_closed:         'Ver ticket',
  ticket_reopened:       'Revisar',
  ticket_transferred:    'Revisar',
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

const LOAD_STEP = 30;

/**
 * Arma la etiqueta (badge) visual correspondiente al tipo de notificación, con ícono y color según el tipo.
 * @param {string} type - tipo de notificación (ej. 'ticket_created')
 * @returns {HTMLElement} badge de tipo de notificación
 */
function pillFor(type) {
  const tone = TYPE_TONE[type] || 'bg-slate-100 text-slate-700';
  const iconPath = ICON[type];
  return h('span.badge.rounded-full.px-3.py-1.font-bold.uppercase.inline-flex.items-center.gap-1', { class: `${tone} text-[11px]` }, [
    iconPath ? svg(h, iconPath, 'w-3 h-3') : null,
    h('span', {}, TYPE_LABEL[type] || type),
  ]);
}

/**
 * Arma una tarjeta de indicador (KPI) para el panel de notificaciones, con variantes de color 'coral' y 'dark'.
 * @param {Object} params - configuración de la tarjeta
 * @param {string} params.label - etiqueta del indicador
 * @param {number|string} params.value - valor a mostrar
 * @param {string} [params.hint] - texto de ayuda debajo del valor
 * @param {string} params.icon - path del ícono a mostrar
 * @param {string} [params.variant] - variante visual ('default', 'coral', 'dark')
 * @returns {HTMLElement} tarjeta de indicador
 */
function kpiCard({ label, value, hint = '', icon, variant = 'default' }) {
  const isCoral = variant === 'coral';
  const isDark = variant === 'dark';
  return h('div.rounded-xl.p-4.flex.flex-col.justify-between.transition-shadow', {
    class: isCoral
      ? 'bg-white border-2 border-accent hover:shadow-md'
      : isDark
        ? 'bg-brand text-white border border-brand'
        : 'bg-white border border-surface-border hover:shadow-md',
  }, [
    h('div.flex.justify-between.items-start', {}, [
      h('span.text-xs.font-semibold.uppercase.tracking-wider', { class: isCoral ? 'text-accent' : isDark ? 'text-white/70' : 'text-slate-500' }, label),
      svg(h, icon, `w-5 h-5 ${isCoral ? 'text-accent' : isDark ? 'text-white/70' : 'text-slate-400'}`),
    ]),
    h('div', {}, [
      h('div.font-bold', { class: isDark ? 'text-xl' : `text-3xl ${isCoral ? 'text-accent' : 'text-brand'}` }, String(value)),
      hint ? h('div.text-xs.mt-1', { class: isDark ? 'text-white/60' : 'text-slate-500' }, hint) : null,
    ]),
  ]);
}

/**
 * Arma la vista del centro de notificaciones: filtros, KPIs, listado con paginación incremental y suscripción a eventos en tiempo real.
 * @param {Object} params - parámetros de la ruta
 * @param {Object} params.user - usuario autenticado
 * @returns {Promise<HTMLElement>} nodo raíz de la vista
 */
export async function renderNotifications({ user }) {
  const root = h('div.flex.flex-col.gap-4', {});
  let limit = LOAD_STEP;

  root.appendChild(h('div.flex.flex-col.justify-between.gap-4', { class: 'md:flex-row md:items-end' }, [
    h('div', {}, [
      h('div.flex.items-center.gap-2.flex-wrap', {}, [
        h('h1.text-2xl.font-bold.text-brand.tracking-tight', { class: 'md:text-3xl' }, 'Centro de notificaciones'),
        h('span.inline-flex.items-center.px-2.rounded-full.font-bold.uppercase.tracking-wider', { class: 'gap-1.5 py-0.5 bg-emerald-100 text-emerald-700 text-[11px]' }, [
          h('span.w-2.h-2.rounded-full.bg-emerald-500.animate-pulse'),
          h('span', {}, 'En vivo'),
        ]),
      ]),
      h('p.text-sm.text-slate-500.mt-1', {}, 'Actividad en tiempo real sobre tus tickets y operaciones de soporte.'),
    ]),
    h('div.flex.items-center.gap-2', {}, [
      h('button.btn.btn-secondary', { onclick: () => markAll(reload) }, [svg(h, ICON.check, 'w-4 h-4'), h('span', {}, 'Marcar todas como leídas')]),
      h('button.btn-icon-sm', { onclick: reload, title: 'Recargar', 'aria-label': 'Recargar notificaciones' }, [svg(h, ICON.refresh, 'w-4 h-4')]),
    ]),
  ]));

  const kpis = h('div.grid.grid-cols-2.gap-3', { class: 'lg:grid-cols-4' });
  const list = h('div.flex.flex-col.gap-3', {});
  const loadMoreWrap = h('div.flex.justify-center.mt-2', {});

  const filterWrap = h('div.flex.items-center.gap-1.bg-surface.rounded-xl.p-1.w-fit', {});
  const FILTERS = [
    { key: 'all',     label: 'Todas' },
    { key: 'unread',  label: 'No leídas' },
  ];
  let active = 'all';
  /**
   * Activa el filtro indicado (todas / no leídas), actualiza el estilo de los botones y recarga la lista.
   * @param {string} k - clave del filtro a activar
   * @returns {void}
   */
  function setActive(k) {
    active = k;
    limit = LOAD_STEP;
    [...filterWrap.children].forEach((c, i) => {
      const isActive = FILTERS[i].key === k;
      c.classList.toggle('bg-white', isActive);
      c.classList.toggle('shadow-soft', isActive);
      c.classList.toggle('text-brand', isActive);
      c.classList.toggle('font-bold', isActive);
      c.classList.toggle('text-slate-500', !isActive);
      c.classList.toggle('font-medium', !isActive);
      c.setAttribute('aria-pressed', String(isActive));
    });
    reload();
  }
  FILTERS.forEach((f) => {
    const b = h('button.px-4.py-2.rounded-lg.text-sm.transition', {
      class: 'focus:outline-none focus:ring-2 focus:ring-brand-ocean/60',
      onclick: () => setActive(f.key),
      'aria-pressed': 'false',
    }, f.label);
    filterWrap.appendChild(b);
  });
  setActive('all');
  root.appendChild(filterWrap);

  root.appendChild(kpis);
  root.appendChild(list);
  root.appendChild(loadMoreWrap);

  /**
   * Recarga las notificaciones desde la API según el filtro activo y el límite actual, y las dibuja.
   * @returns {Promise<void>}
   */
  async function reload() {
    list.innerHTML = '<div class="card flex items-center justify-center gap-2 py-10 text-sm text-slate-600" role="status" aria-live="polite"><svg class="animate-spin w-4 h-4 text-brand-ocean" fill="none" viewBox="0 0 24 24" aria-hidden="true"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path></svg><span>Cargando notificaciones…</span></div>';
    loadMoreWrap.innerHTML = '';
    try {
      const { notifications } = await api.notifications.list({
        limit,
        unread: active === 'unread' ? 'true' : 'false',
      });
      draw(notifications);
    } catch (e) {
      list.innerHTML = `<div class="card p-6 text-center text-sm text-red-600">${escapeHtml(e.message)}</div>`;
    }
  }

  /**
   * Marca todas las notificaciones como leídas y refresca el contador global antes de ejecutar el callback dado.
   * @param {Function} fn - callback a ejecutar tras marcar todas como leídas (normalmente reload)
   * @returns {Promise<void>}
   */
  async function markAll(fn) {
    try {
      await api.notifications.markRead({ all: true });
      toast('Notificaciones marcadas como leídas', 'success');
      setState({ unreadCount: 0 });
      fn();
    } catch (e) { toast(e.message, 'error'); }
  }

  /**
   * Calcula y dibuja los KPIs de la vista (total, no leídas, últimas 24 h, tipo más frecuente) a partir de las notificaciones cargadas.
   * @param {Array<Object>} items - notificaciones cargadas
   * @returns {void}
   */
  function drawKpis(items) {
    kpis.innerHTML = '';
    const total = items.length;
    const unread = items.filter((n) => !n.read).length;
    const byType = items.reduce((acc, n) => { acc[n.type] = (acc[n.type] || 0) + 1; return acc; }, {});
    const topType = Object.entries(byType).sort((a, b) => b[1] - a[1])[0];
    const topPct = topType && total ? Math.round((topType[1] / total) * 100) : 0;
    const last24h = items.filter((n) => Date.now() - new Date(n.created_at.replace(' ', 'T') + 'Z').getTime() < 24 * 3600 * 1000).length;

    kpis.appendChild(kpiCard({ label: 'Total (vista)', value: total, icon: ICON.eye }));
    kpis.appendChild(kpiCard({ label: 'No leídas', value: unread, hint: unread ? 'requieren atención' : 'todo al día', icon: ICON.bell, variant: 'coral' }));
    kpis.appendChild(kpiCard({ label: 'Últimas 24 h', value: last24h, icon: ICON.clock }));
    kpis.appendChild(kpiCard({
      label: 'Tipo frecuente',
      value: topType ? (TYPE_LABEL[topType[0]] || topType[0]) : '—',
      hint: topType ? `${topPct}% del volumen visible` : '',
      icon: ICON.report,
      variant: 'dark',
    }));
  }

  /**
   * Arma la tarjeta de una notificación individual, con su badge de tipo, hora relativa y acción de apertura.
   * @param {Object} n - notificación a mostrar
   * @returns {HTMLElement} tarjeta de notificación
   */
  function notificationCard(n) {
    const card = h('button.text-left.w-full.flex.flex-col.gap-3.p-4.rounded-2xl.transition.cursor-pointer', {
      class: [
        'md:flex-row md:items-start',
        n.read
          ? 'bg-white border border-surface-border opacity-60 hover:opacity-100'
          : 'bg-accent/[0.03] border-2 border-accent/20 hover:bg-accent/[0.06]',
      ].join(' '),
      onclick: () => onClick(n),
    }, [
      h(
        'div.flex.flex-row.items-center.gap-2.flex-wrap',
        { class: 'md:flex-col md:items-start md:min-w-[130px] md:flex-none' },
        [
          pillFor(n.type),
          h('span.text-slate-500', { class: 'text-[11px]', title: formatDateTime(n.created_at) }, relativeFromNow(n.created_at)),
          n.read ? null : h('span.rounded-full.bg-accent', { class: 'w-1.5 h-1.5' }),
        ]
      ),
      h('div.flex-1.min-w-0.space-y-1', {}, [
        h('div.flex.items-start.justify-between.gap-2.flex-wrap', {}, [
          h('h4.font-bold.text-brand-ink', { class: n.read ? 'font-semibold' : '' }, n.title),
          n.ticket_id ? h('span.font-mono.text-slate-500.bg-surface.px-2.rounded.flex-none', { class: 'text-[11px] py-0.5' }, `#${n.ticket_id}`) : null,
        ]),
        n.body ? h('p.text-sm.text-slate-600.line-clamp-2.leading-relaxed', {}, n.body) : null,
        n.ticket_id ? h('div.pt-1', {}, [
          h('span.inline-flex.items-center.gap-1.font-bold', { class: `text-sm ${n.read ? 'text-brand' : 'text-accent'}` }, [
            h('span', {}, TYPE_CTA[n.type] || 'Abrir'),
            svg(h, ICON.arrowR, 'w-4 h-4'),
          ]),
        ]) : null,
      ]),
    ]);
    return card;
  }

  /**
   * Dibuja los KPIs y el listado de notificaciones separado en "Recientes" y "Anteriores", o el estado vacío si no hay resultados.
   * @param {Array<Object>} items - notificaciones a mostrar
   * @returns {void}
   */
  function draw(items) {
    drawKpis(items);

    list.innerHTML = '';
    loadMoreWrap.innerHTML = '';
    if (!items.length) {
      list.appendChild(emptyState({
        ...EMPTY_STATES.notifications,
        message: active === 'unread'
          ? 'No tienes notificaciones sin leer.'
          : 'Aún no tienes notificaciones. Te avisaremos en tiempo real cuando haya actividad en tus tickets.',
      }));
      return;
    }

    const unreadItems = items.filter((n) => !n.read);
    const readItems = items.filter((n) => n.read);

    list.appendChild(h('h3.font-bold.text-brand-ink.px-1', {}, unreadItems.length ? 'Recientes' : 'Notificaciones'));
    for (const n of unreadItems) list.appendChild(notificationCard(n));

    if (unreadItems.length && readItems.length) {
      list.appendChild(h('div.flex.items-center.gap-3.py-2', {}, [
        h('div.flex-1.h-px.bg-surface-border'),
        h('span.font-bold.uppercase.tracking-widest.text-slate-500', { class: 'text-[11px]' }, 'Anteriores'),
        h('div.flex-1.h-px.bg-surface-border'),
      ]));
    }
    for (const n of readItems)
      list.appendChild(notificationCard(n));

    if (items.length >= limit) {
      loadMoreWrap.appendChild(h('button.btn.btn-ghost', {
        onclick: () => { limit += LOAD_STEP; reload(); },
      }, [h('span', {}, 'Cargar notificaciones antiguas'), svg(h, ICON.chevronD, 'w-4 h-4')]));
    }
  }

  /**
   * Maneja el click sobre una notificación: la marca como leída, actualiza el contador global y navega al ticket asociado (o recarga la lista).
   * @param {Object} n - notificación clickeada
   * @returns {Promise<void>}
   */
  async function onClick(n) {
    try { await api.notifications.markRead({ ids: [n.id] }); } catch {}
    setState({ unreadCount: Math.max(0, (getState().unreadCount || 0) - (n.read ? 0 : 1)) });
    if (n.ticket_id) go(`/tickets/${n.ticket_id}`);
    else reload();
  }

  await reload();

  const ac1 = subscribeToRealtimeEvents(['notification:new'], () => reload());
  const ac2 = subscribeToRealtimeEvents(['ticket:created', 'ticket:assigned', 'ticket:status_changed', 'ticket:commented', 'attachment:added', 'ticket:updated'], () => reload());

  root._cleanup = () => { ac1.abort(); ac2.abort(); };
  root._gcmCleanup = root._cleanup;

  return root;
}

