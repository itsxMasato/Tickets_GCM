/* Documentado por: Miguel Flores */
import { h, escapeHtml } from '../utils/dom.js';
import { go } from '../router.js';
import { subscribe, getState, setState } from '../store.js';
import { ROLE_LABEL, AREA_LABEL, relativeFromNow, formatDateTime } from '../utils/format.js';
import { ICON, svg } from '../utils/icons.js';
import { api } from '../api.js';
import { toast } from '../utils/toast.js';
import { subscribeToRealtimeEvents } from '../utils/realtime.js';
import { renderCompanySwitcher } from './company-switcher.js';
import { renderAvatar } from '../utils/avatar.js';

let mountedRoot = null;

function icon(path, cls = 'w-5 h-5') {
  return h('svg', {
    class: cls,
    fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8',
    viewBox: '0 0 24 24',
    html: `<path stroke-linecap="round" stroke-linejoin="round" d="${path}" />`,
  });
}

function topbarContext(user) {
  const raw = (location.hash || '').replace(/^#/, '') || '/dashboard';
  const [pathname, qs] = raw.split('?');
  const query = Object.fromEntries(new URLSearchParams(qs || ''));

  if (pathname === '/dashboard' || pathname === '/') {
    const first = (user.full_name || '').split(' ')[0] || 'equipo';
    return { title: `Hola, ${first}`, subtitle: subtitleByRole(user) };
  }
  if (pathname === '/tickets' && query.status) {
    return { title: 'Tickets', subtitle: `Filtro: ${query.status}` };
  }
  if (pathname === '/tickets')        return { title: 'Tickets',         subtitle: 'Listado y filtros' };
  if (pathname === '/tickets/new')    return { title: 'Nuevo ticket',    subtitle: 'Reportar incidencia' };
  if (pathname.startsWith('/tickets/'))return { title: 'Detalle de ticket', subtitle: 'Historial y evidencias' };
  if (pathname === '/users')          return { title: 'Usuarios',        subtitle: 'Gestión de cuentas y roles' };
  if (pathname === '/roles')          return { title: 'Roles',           subtitle: 'Matriz de permisos del sistema' };
  if (pathname === '/categories')     return { title: 'Categorías',      subtitle: 'Catálogo de incidencias' };
  if (pathname === '/notifications')  return { title: 'Notificaciones',  subtitle: 'Bandeja de entrada' };
  if (pathname === '/reports')        return { title: 'Reportes',        subtitle: 'Exportes a Excel y PDF' };
  return { title: 'GCM Tickets', subtitle: 'Sistema interno' };
}

function subtitleByRole(user) {
  switch (user.role) {
    case 'supervisor_campo': return 'Tus tickets reportados y su estado';
    case 'sac':              return 'Resumen global de tickets y operación';
    case 'admin_area':       return 'Tu cola de trabajo y el estado del área';
    case 'jefe_inmediato':   return 'Tickets del área pendientes por cierre';
    default:                 return 'Resumen de actividad';
  }
}

function quickActions(user) {
  const raw = (location.hash || '').replace(/^#/, '') || '/dashboard';
  const isTickets = raw.startsWith('/tickets') && raw !== '/tickets/new';
  const canCreate = user.role === 'sac' || user.role === 'supervisor_campo';

  if (canCreate && (raw === '/dashboard' || raw === '/' || raw === '/tickets')) {
    return [
      { label: 'Refrescar', icon: ICON.refresh, kind: 'ghost',  onclick: () => window.dispatchEvent(new CustomEvent('gcm:refresh')) },
      { label: 'Nuevo ticket', icon: ICON.plus, kind: 'accent', onclick: () => go('/tickets/new') },
    ];
  }
  if (isTickets) {
    return [
      { label: 'Refrescar', icon: ICON.refresh, kind: 'ghost', onclick: () => window.dispatchEvent(new CustomEvent('gcm:refresh')) },
    ];
  }
  if (raw === '/reports') {
    return [
      { label: 'Exportar', icon: ICON.download, kind: 'secondary', onclick: () => window.dispatchEvent(new CustomEvent('gcm:export')) },
    ];
  }
  return [];
}

const BELL_TYPE_TONE = {
  ticket_created:        'bg-blue-100 text-blue-800',
  ticket_assigned:       'bg-brand/10 text-brand',
  ticket_commented:      'bg-slate-100 text-slate-700',
  ticket_status_changed: 'bg-amber-100 text-amber-800',
  ticket_closed:         'bg-emerald-100 text-emerald-800',
  ticket_reopened:       'bg-orange-100 text-orange-800',
  ticket_transferred:    'bg-brand-ocean/10 text-brand-ocean',
};
const BELL_TYPE_LABEL = {
  ticket_created:        'Ticket creado',
  ticket_assigned:       'Asignación',
  ticket_commented:      'Comentario',
  ticket_status_changed: 'Cambio de estado',
  ticket_closed:         'Cerrado',
  ticket_reopened:       'Reabierto',
  ticket_transferred:    'Para tu revisión',
};
function bellPill(type) {
  const tone = BELL_TYPE_TONE[type] || 'bg-slate-100 text-slate-700';
  const cls = tone.replace(/\s+/g, '.');
  const iconPath = ICON[type];
  const iconHtml = iconPath
    ? `<svg class="w-3 h-3 mr-1 inline" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="${iconPath}"/></svg>`
    : '';
  return h(`span.badge.${cls}.inline-flex.items-center`, { html: `${iconHtml}${escapeHtml(BELL_TYPE_LABEL[type] || type)}` });
}
function bellCheckIcon() {
  return h('svg.text-slate-400.transition-colors', { class: 'w-3.5 h-3.5 group-hover:text-accent', fill: 'none', stroke: 'currentColor', 'stroke-width': '2.5', viewBox: '0 0 24 24', 'aria-hidden': 'true', html: `<path stroke-linecap="round" stroke-linejoin="round" d="${ICON.check}" />` });
}

function renderBell() {
  const { unreadCount } = getState();
  const hasUnread = unreadCount > 0;

  const listEl = h('div.max-h-96.overflow-y-auto.py-1', {});
  const emptyEl = h('div.px-4.py-8.text-center.text-sm.text-slate-500', {}, 'Sin notificaciones pendientes');

  const dropdown = h('div.absolute.right-0.top-full.mt-2.w-80.bg-white.rounded-xl.shadow-pop.border.border-surface-border.z-40.hidden.origin-top-right.overflow-hidden', {
    role: 'menu',
    'aria-label': 'Notificaciones',
  }, [
    h('div.flex.items-center.justify-between.px-4.py-3.border-b.border-surface-border.bg-surface-alt', {}, [
      h('div.text-sm.font-bold.text-brand-ink', {}, 'Notificaciones'),
      hasUnread
        ? h('button.font-semibold.text-brand-ocean.transition-colors', {
            class: 'text-xs hover:text-brand-deep',
            role: 'menuitem',
            onclick: () => markAll(),
          }, 'Marcar todas')
        : null,
    ]),
    listEl,
    h('div.border-t.border-surface-border', {}, [
      h('button.flex.items-center.justify-center.gap-1.5.w-full.px-4.font-semibold.text-brand-ocean.transition-colors', {
        class: 'hover:bg-surface hover:text-brand-deep py-2.5 text-sm',
        role: 'menuitem',
        onclick: () => { closeDropdown(); go('/notifications'); },
      }, [h('span', {}, 'Ver todas las notificaciones'), svg(h, ICON.arrowR, 'w-3.5 h-3.5')]),
    ]),
  ]);

  const trigger = h('button.topbar-icon-btn.relative', {
    onclick: (e) => { e.stopPropagation(); toggleDropdown(); },
    'aria-label': hasUnread ? `Notificaciones — ${unreadCount} sin leer` : 'Notificaciones',
    'aria-haspopup': 'menu',
    'aria-expanded': 'false',
    title: 'Notificaciones',
  }, [
    h('svg.w-5.h-5', {
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '2',
      viewBox: '0 0 24 24',
      'aria-hidden': 'true',
      html: `<path stroke-linecap="round" stroke-linejoin="round" d="${ICON.bell}" />`,
    }),
    hasUnread
      ? h('span.absolute.bg-accent.text-white.rounded-full.px-1.h-4.flex.items-center.justify-center.font-semibold.leading-none.ring-2.ring-white',
          { class: 'top-1.5 right-1.5 text-[10px] min-w-[16px]' },
          String(unreadCount > 99 ? '99+' : unreadCount))
      : null,
  ]);

  const root = h('div.relative.inline-flex', {}, [trigger, dropdown]);

  let open = false;
  let realtimeAc = null;
  let fetched = false;

  function isOpen() { return open; }
  function openDropdown() {
    open = true;
    dropdown.classList.remove('hidden');
    trigger.setAttribute('aria-expanded', 'true');
    loadList();
    realtimeAc = subscribeToRealtimeEvents(['notification:new'], () => {
      loadList();
    });
  }
  function closeDropdown() {
    open = false;
    dropdown.classList.add('hidden');
    trigger.setAttribute('aria-expanded', 'false');
    if (realtimeAc) { realtimeAc.abort(); realtimeAc = null; }
  }
  function toggleDropdown() { open ? closeDropdown() : openDropdown(); }

  async function loadList() {
    try {
      const { notifications } = await api.notifications.list({ unread: 'true', limit: 10 });
      fetched = true;
      drawList(notifications);
    } catch (e) {
      console.error('[diag:bell] loadList failed:', e);
      listEl.innerHTML = '';
      listEl.appendChild(h('div.px-4.py-6.text-center.text-sm.text-red-600', {}, e.message || 'Error al cargar'));
    }
  }

  function drawList(items) {
    listEl.innerHTML = '';
    if (!items.length) {
      listEl.appendChild(emptyEl);
      return;
    }
    for (const n of items) {
      const unread = !n.read;
      const checkBtn = h('button.group.flex-none.w-7.h-7.rounded-full.border.transition.flex.items-center.justify-center', {
        class: unread
          ? 'border-accent/30 bg-white hover:bg-accent/10 hover:border-accent focus:outline-none focus:ring-2 focus:ring-accent/60'
          : 'border-surface-border bg-white hover:bg-surface focus:outline-none focus:ring-2 focus:ring-accent/60',
        role: 'menuitem',
        'aria-label': 'Marcar como leída',
        title: 'Marcar como leída',
        onclick: (e) => { e.stopPropagation(); markOne(n); },
      }, [bellCheckIcon()]);

      const item = h('button.group.relative.flex.items-start.gap-3.w-full.text-left.transition.rounded-lg', {
        class: unread
          ? 'bg-accent/[0.04] hover:bg-accent/[0.07] mx-2 my-1 p-3'
          : 'hover:bg-surface mx-2 my-1 p-3',
        role: 'menuitem',
        onclick: () => onItemClick(n),
      }, [
        checkBtn,
        h('div.flex-1.min-w-0', {}, [
          h('div.flex.items-center.gap-2.mb-1', {}, [
            bellPill(n.type),
            unread ? h('span.flex-none.rounded-full.bg-accent', { class: 'w-1.5 h-1.5' }) : null,
          ]),
          h('div.text-sm.text-brand-ink.truncate', { class: unread ? 'font-bold' : 'font-semibold' }, n.title || BELL_TYPE_LABEL[n.type] || n.type),
          n.body ? h('div.text-xs.text-slate-600.line-clamp-2.mt-0.5', {}, n.body) : null,
          h('div.flex.items-center.gap-2.mt-1.5', {}, [
            n.ticket_id ? h('span.font-mono.text-slate-500.bg-surface.px-1.5.rounded', { class: 'text-[11px] py-0.5' }, `#${n.ticket_id}`) : null,
            h('span.text-slate-500', { class: 'text-[11px]', title: formatDateTime(n.created_at) }, relativeFromNow(n.created_at)),
          ]),
        ]),
      ]);
      listEl.appendChild(item);
    }
  }

  async function onItemClick(n) {
    await markOne(n, { silent: true, openTicket: !!n.ticket_id });
  }

  async function markOne(n, opts = {}) {
    const wasUnread = !n.read;
    if (wasUnread) {
      const cur = getState().unreadCount || 0;
      setState({ unreadCount: Math.max(0, cur - 1) });
    }
    try {
      await api.notifications.markRead({ ids: [n.id] });
      if (opts.openTicket && n.ticket_id) {
        closeDropdown();
        go(`/tickets/${n.ticket_id}`);
      } else if (open) {
        loadList();
        if (!opts.silent) toast('Marcada como leída', 'success');
      }
    } catch (e) {
      if (wasUnread) {
        const cur = getState().unreadCount || 0;
        setState({ unreadCount: cur + 1 });
      }
      toast(e.message || 'No se pudo marcar como leída', 'error');
    }
  }

  async function markAll() {
    try {
      await api.notifications.markRead({ all: true });
      setState({ unreadCount: 0 });
      toast('Notificaciones marcadas como leídas', 'success');
      listEl.innerHTML = '';
      listEl.appendChild(emptyEl);
    } catch (e) {
      toast(e.message || 'No se pudieron marcar', 'error');
    }
  }

  const onDocClick = (e) => {
    if (!open) return;
    if (!root.contains(e.target)) closeDropdown();
  };
  const onKey = (e) => {
    if (e.key === 'Escape' && open) closeDropdown();
  };
  document.addEventListener('click', onDocClick, { capture: true });
  document.addEventListener('keydown', onKey);

  root._bellDropdownCleanup = () => {
    document.removeEventListener('click', onDocClick, { capture: true });
    document.removeEventListener('keydown', onKey);
    if (realtimeAc) realtimeAc.abort();
  };

  return root;
}

function renderUserMenu({ user, onLogout }) {
  const root = h('div.relative', {});
  const roleLabel = ROLE_LABEL[user.role] || user.role;
  const areaLabel = user.area ? AREA_LABEL[user.area] : null;

  const menu = h('div.absolute.right-0.top-full.mt-2.w-60.bg-white.rounded-xl.shadow-pop.border.border-surface-border.py-1.hidden.z-40.overflow-hidden', {}, [
    h('div.px-3.border-b.border-surface-border', { class: 'py-2.5' }, [
      h('div.text-sm.font-semibold.text-brand-ink.truncate', {}, user.full_name),
      h('div.text-xs.text-slate-500.truncate', {}, [roleLabel, areaLabel ? ` · ${areaLabel}` : ''].join('')),
    ]),
    h('button.flex.items-center.gap-2.w-full.px-3.py-2.text-sm.text-brand-ink', { class: 'hover:bg-surface', onclick: () => { closeMenu(); go('/dashboard'); } }, [
      icon(ICON.home, 'w-4 h-4 text-slate-500'), 'Mi inicio',
    ]),
    h('button.flex.items-center.gap-2.w-full.px-3.py-2.text-sm.text-brand-ink', { class: 'hover:bg-surface', onclick: () => { closeMenu(); go('/profile'); } }, [
      icon(ICON.user, 'w-4 h-4 text-slate-500'), 'Mi perfil',
    ]),
    h('button.flex.items-center.gap-2.w-full.px-3.py-2.text-sm.text-brand-ink', { class: 'hover:bg-surface', onclick: () => { closeMenu(); go('/notifications'); } }, [
      h('svg.w-4.h-4.text-slate-500', { fill: 'none', stroke: 'currentColor', 'stroke-width': '2', viewBox: '0 0 24 24', html: `<path stroke-linecap="round" stroke-linejoin="round" d="${ICON.bell}" />` }),
      'Notificaciones',
    ]),
    h('div.border-t.border-surface-border.my-1'),
    h('button.flex.items-center.gap-2.w-full.px-3.py-2.text-sm.text-accent', { class: 'hover:bg-accent/5', onclick: () => { closeMenu(); onLogout(); } }, [
      h('svg.w-4.h-4', { fill: 'none', stroke: 'currentColor', 'stroke-width': '2', viewBox: '0 0 24 24', html: `<path stroke-linecap="round" stroke-linejoin="round" d="${ICON.logout}" />` }),
      'Cerrar sesión',
    ]),
  ]);
  const trigger = h('button.topbar-user-trigger.flex.items-center.gap-2.pl-1.pr-2.py-1.rounded-md.transition', {
    class: 'hover:bg-surface',
    onclick: (e) => { e.stopPropagation(); toggleMenu(); },
    'aria-haspopup': 'menu',
    'aria-expanded': 'false',
  }, [
    renderAvatar(user, { className: 'avatar ring-2 ring-white' }),
    h('div.text-left.flex.flex-col.justify-center', {}, [
      h('div.text-sm.font-semibold.text-brand-ink.leading-tight.truncate', { class: 'max-w-[160px]' }, user.full_name),
      h('div.font-medium.text-slate-500.leading-tight.truncate', { class: 'text-[11px]' }, [roleLabel, areaLabel ? ` · ${areaLabel}` : ''].join('')),
    ]),
    h('svg.w-4.h-4.text-slate-500.flex-none', { fill: 'none', stroke: 'currentColor', 'stroke-width': '2', viewBox: '0 0 24 24', html: '<path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />' }),
  ]);

  function isOpen() { return !menu.classList.contains('hidden'); }
  function openMenu() { menu.classList.remove('hidden'); trigger.setAttribute('aria-expanded', 'true'); }
  function closeMenu() { menu.classList.add('hidden'); trigger.setAttribute('aria-expanded', 'false'); }
  function toggleMenu() { isOpen() ? closeMenu() : openMenu(); }

  const onDocClick = () => { if (isOpen()) closeMenu(); };
  const onKey = (e) => { if (e.key === 'Escape' && isOpen()) closeMenu(); };
  document.addEventListener('click', onDocClick, { capture: true });
  document.addEventListener('keydown', onKey);

  root._userMenuCleanup = () => {
    document.removeEventListener('click', onDocClick, { capture: true });
    document.removeEventListener('keydown', onKey);
  };

  root.appendChild(trigger);
  root.appendChild(menu);
  return root;
}

function renderQuickActions(user) {
  const actions = quickActions(user);
  if (!actions.length) return null;
  return h('div.hidden.items-center.gap-2', { class: 'md:flex' }, actions.map((a) => {
    const cls = a.kind === 'accent' ? 'btn-accent' : a.kind === 'secondary' ? 'btn-secondary' : 'btn-ghost';
    return h(`button.${cls}`, { onclick: a.onclick }, [icon(a.icon, 'w-4 h-4'), h('span', {}, a.label)]);
  }));
}

function renderSidebarToggle() {
  const collapsed = document.body.classList.contains('gcm-sidebar-collapsed');
  const isMobile  = window.matchMedia('(max-width: 767.95px)').matches;
  let iconPath, label;
  if (isMobile) {
    const open = document.body.classList.contains('gcm-sidebar-open');
    iconPath = open ? ICON.close : ICON.menu;
    label = open ? 'Cerrar barra lateral' : 'Abrir barra lateral';
  } else {
    iconPath = collapsed ? ICON.panelOpen : ICON.panelClose;
    label = collapsed ? 'Expandir barra lateral' : 'Colapsar barra lateral';
  }

  return h('button.topbar-icon-btn', {
    'aria-label': label,
    title: label,
    'aria-expanded': isMobile ? String(document.body.classList.contains('gcm-sidebar-open')) : String(!collapsed),
    onclick: () => window.dispatchEvent(new CustomEvent('gcm:toggle-sidebar')),
  }, [
    h('svg.w-5.h-5', {
      fill: 'none', stroke: 'currentColor', 'stroke-width': '2',
      viewBox: '0 0 24 24', 'aria-hidden': 'true',
      html: `<path stroke-linecap="round" stroke-linejoin="round" d="${iconPath}" />`,
    }),
  ]);
}

export function renderTopbar({ user, onLogout }) {
  const { title, subtitle } = topbarContext(user);

  const root = h('header.topbar', {});

  const left = h('div.flex.items-center.gap-3.min-w-0', {}, [
    renderSidebarToggle(),
    h('div.min-w-0', {}, [
      h('h1.text-base.font-semibold.text-brand-ink.leading-tight.truncate', {}, title),
      subtitle ? h('p.text-xs.text-slate-500.leading-tight.truncate', {}, subtitle) : null,
    ]),
  ]);
  root.appendChild(left);

  const userMenu = renderUserMenu({ user, onLogout });
  let bellWrapper = renderBell();
  let companySwitcher = renderCompanySwitcher({ user });
  const right = h('div.flex.items-center', { class: 'gap-1.5 md:gap-2' }, [
    renderQuickActions(user),
    h('button.topbar-icon-btn.hidden', {
      class: 'sm:inline-flex',
      'aria-label': 'Ayuda', title: 'Ayuda',
      onclick: () => window.dispatchEvent(new CustomEvent('gcm:help')),
    }, [
      h('svg.w-5.h-5', { fill: 'none', stroke: 'currentColor', 'stroke-width': '2', viewBox: '0 0 24 24', 'aria-hidden': 'true', html: `<path stroke-linecap="round" stroke-linejoin="round" d="${ICON.help}" />` }),
    ]),
    h('div.w-px.h-6.bg-surface-border.hidden', { class: 'sm:block' }),
    companySwitcher,
    companySwitcher ? h('div.w-px.h-6.bg-surface-border.hidden', { class: 'sm:block' }) : null,
    bellWrapper,
    h('div.w-px.h-6.bg-surface-border.hidden', { class: 'sm:block' }),
    userMenu,
  ]);
  root.appendChild(right);

  mountedRoot = root;

  const refreshToggle = () => {
    if (!mountedRoot) return;
    const oldToggle = mountedRoot.querySelector('button[aria-label*="barra lateral"], button[aria-label*="menú"]');
    if (oldToggle) oldToggle.replaceWith(renderSidebarToggle());
  };
  const refreshBell = () => {
    if (!mountedRoot || !bellWrapper.parentNode) return;
    if (typeof bellWrapper._bellDropdownCleanup === 'function') bellWrapper._bellDropdownCleanup();
    const next = renderBell();
    bellWrapper.parentNode.replaceChild(next, bellWrapper);
    bellWrapper = next;
  };

  window.addEventListener('gcm:sidebar-state-changed', refreshToggle);
  const unsubscribe = subscribe((s) => {
    refreshBell();
  });

  root._gcmCleanup = () => {
    if (typeof userMenu._userMenuCleanup === 'function') userMenu._userMenuCleanup();
    if (typeof bellWrapper._bellDropdownCleanup === 'function') bellWrapper._bellDropdownCleanup();
    if (companySwitcher && typeof companySwitcher._companySwitcherCleanup === 'function') companySwitcher._companySwitcherCleanup();
    if (typeof unsubscribe === 'function') unsubscribe();
    window.removeEventListener('gcm:sidebar-state-changed', refreshToggle);
  };

  return root;
}

