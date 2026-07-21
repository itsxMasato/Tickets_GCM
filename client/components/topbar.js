/* Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. */
import { h, escapeHtml } from '../utils/dom.js';
import { go } from '../router.js';
import { subscribe, getState, setState } from '../store.js';
import { ROLE_LABEL, AREA_LABEL, relativeFromNow, formatDateTime } from '../utils/format.js';
import { ICON } from '../utils/icons.js';
import { api } from '../api.js';
import { toast } from '../utils/toast.js';
import { subscribeToRealtimeEvents } from '../utils/realtime.js';

let mountedRoot = null;

function avatarColor(seed) {
  const colors = ['#071D4C', '#44497B', '#16ACE4', '#CF301D', '#8b5cf6', '#0ea5e9', '#14b8a6', '#7c3aed', '#f97316', '#243447'];
  return colors[(seed || 0) % colors.length];
}

function initials(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?';
}

function icon(path, cls = 'w-5 h-5') {
  return h(`svg.${cls}`, {
    fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8',
    viewBox: '0 0 24 24',
    html: `<path stroke-linecap="round" stroke-linejoin="round" d="${path}" />`,
  });
}

// ── Contexto del topbar según ruta + rol ─────────────────────────────────────
// Devuelve: { title, subtitle }
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

// Acciones rápidas (botón "+ Nuevo ticket" / "Refrescar") según rol y ruta
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

// ── Buscador (atajo "/") ─────────────────────────────────────────────────────
// El listener se registra UNA SOLA VEZ en window (atajo global) y consulta
// el input actual del topbar en cada pulsación. Antes capturaba el `input`
// del primer topbar en closure — si ese nodo se desmontaba, `input.focus()`
// fallaba silenciosamente. Ahora la referencia se actualiza por re-mount.
function renderSearch() {
  const input = h('input.flex-1.bg-transparent.border-0.outline-none.text-sm.placeholder\\:text-slate-500', {
    type: 'search',
    placeholder: 'Buscar tickets, usuarios… presiona "/"',
    'aria-label': 'Buscar',
  });
  const wrap = h('div.topbar-search', {}, [
    icon(ICON.search, 'w-4 h-4 text-slate-500'),
    input,
    h('kbd.hidden.md\\:inline-flex.items-center.justify-center.text-[10px].font-medium.text-slate-500.bg-white.border.border-surface-border.rounded.px-1.5.h-5', {}, '/'),
  ]);

  if (window.__gcmSearchHooked) {
    // Re-mount: el input anterior ya no está en DOM. Actualizamos la
    // referencia que el handler global usa para focus() y para detectar
    // que la tecla pulsada es "dentro" de este input.
    window.__gcmSearchInput = input;
  } else {
    window.__gcmSearchHooked = true;
    window.__gcmSearchInput = input;
    document.addEventListener('keydown', (e) => {
      const t = e.target;
      const isTyping = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
      const current = window.__gcmSearchInput;
      // El input actual puede estar detached (entre navegaciones) — comprobamos.
      const currentLive = current && document.body.contains(current);
      if (!isTyping && e.key === '/') {
        e.preventDefault();
        if (currentLive) current.focus();
      } else if (isTyping && t === current && e.key === 'Enter') {
        const q = current.value.trim();
        if (q) go(`/tickets?q=${encodeURIComponent(q)}`);
      } else if (e.key === 'Escape' && t === current) {
        current.value = '';
        current.blur();
      }
    });
  }
  return wrap;
}

// ── Campana + dropdown de notificaciones (topbar) ────────────────────────────
// Antes la campana navegaba a /notifications. Ahora abre un dropdown con las
// no-leídas (lazy fetch on open), con check por item para marcar como leídas
// y link "Ver todas" al fondo que sí navega a la bandeja completa.
// Cargar realtime SOLO cuando el dropdown está abierto evita fetches pasivos.
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
  return h('svg.w-3.5.h-3.5', { fill: 'none', stroke: 'currentColor', 'stroke-width': '2.5', viewBox: '0 0 24 24', 'aria-hidden': 'true', html: `<path stroke-linecap="round" stroke-linejoin="round" d="${ICON.check}" />` });
}

function renderBell() {
  const { unreadCount } = getState();
  const hasUnread = unreadCount > 0;

  // ── Dropdown (panel) ────────────────────────────────────────────────────
  const listEl = h('div.max-h-96.overflow-y-auto', {});
  const emptyEl = h('div.px-4.py-8.text-center.text-sm.text-slate-500', {}, 'Sin notificaciones pendientes');

  const dropdown = h('div.absolute.right-0.top-full.mt-2.w-80.bg-white.rounded-lg.shadow-pop.border.border-surface-border.z-40.hidden.origin-top-right', {
    role: 'menu',
    'aria-label': 'Notificaciones',
  }, [
    h('div.flex.items-center.justify-between.px-4.py-3.border-b.border-surface-border', {}, [
      h('div.text-sm.font-semibold.text-brand-ink', {}, 'Notificaciones'),
      hasUnread
        ? h('button.text-xs.font-medium.text-brand-ocean.hover\\:text-brand-deep', {
            role: 'menuitem',
            onclick: () => markAll(),
          }, 'Marcar todas')
        : null,
    ]),
    listEl,
    h('div.border-t.border-surface-border', {}, [
      h('button.flex.items-center.justify-center.w-full.px-4.py-2.5.text-sm.font-medium.text-brand-ocean.hover\\:bg-surface.transition', {
        role: 'menuitem',
        onclick: () => { closeDropdown(); go('/notifications'); },
      }, 'Ver todas las notificaciones →'),
    ]),
  ]);

  // ── Trigger (botón campana) ─────────────────────────────────────────────
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
      ? h('span.absolute.top-1\\.5.right-1\\.5.bg-accent.text-white.text-[10px].rounded-full.px-1.min-w-[16px].h-4.flex.items-center.justify-center.font-semibold.leading-none.ring-2.ring-white',
          {},
          String(unreadCount > 99 ? '99+' : unreadCount))
      : null,
  ]);

  // Wrap relativo para anclar el dropdown.
  const root = h('div.relative.inline-flex', {}, [trigger, dropdown]);

  // ── Estado del dropdown ─────────────────────────────────────────────────
  let open = false;
  let realtimeAc = null;  // AbortController de la suscripción realtime (sólo mientras abierto).
  let fetched = false;    // ¿ya hicimos el primer fetch?

  function isOpen() { return open; }
  function openDropdown() {
    open = true;
    dropdown.classList.remove('hidden');
    trigger.setAttribute('aria-expanded', 'true');
    loadList();
    // Realtime: refresca la lista cuando llegan nuevas no-leídas mientras
    // el usuario tiene el panel abierto. Al cerrar, se aborta.
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
      // [DIAG-2026-07-15] Temporal: ver el error en consola del navegador.
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
      const checkBtn = h('button.flex-none.w-7.h-7.rounded-full.border.border-surface-border-strong.text-white.bg-white.hover\\:bg-accent\\/10.hover\\:border-accent.transition.flex.items-center.justify-center.focus\\:outline-none.focus\\:ring-2.focus\\:ring-accent\\/60', {
        role: 'menuitem',
        'aria-label': 'Marcar como leída',
        title: 'Marcar como leída',
        onclick: (e) => { e.stopPropagation(); markOne(n); },
      }, [bellCheckIcon()]);

      const item = h('button.flex.items-start.gap-3.w-full.px-4.py-3.text-left.hover\\:bg-surface.transition.border-b.border-surface-border\\/60.last\\:border-b-0', {
        role: 'menuitem',
        onclick: () => onItemClick(n),
      }, [
        checkBtn,
        h('div.flex-1.min-w-0', {}, [
          h('div.flex.items-center.gap-2.mb-1', {}, [bellPill(n.type)]),
          h('div.text-sm.font-semibold.text-brand-ink.truncate', {}, n.title || BELL_TYPE_LABEL[n.type] || n.type),
          n.body ? h('div.text-xs.text-slate-600.line-clamp-2', {}, n.body) : null,
          h('div.flex.items-center.gap-2.mt-1.text-[11px].text-slate-500', {}, [
            n.ticket_id ? h('span', {}, `Ticket #${n.ticket_id}`) : null,
            h('span', { title: formatDateTime(n.created_at) }, relativeFromNow(n.created_at)),
          ]),
        ]),
      ]);
      listEl.appendChild(item);
    }
  }

  async function onItemClick(n) {
    // Click en el cuerpo: marcar como leída y abrir el ticket (mismo flujo
    // que la vista completa /notifications).
    await markOne(n, { silent: true, openTicket: !!n.ticket_id });
  }

  async function markOne(n, opts = {}) {
    const wasUnread = !n.read;
    // Optimistic: baja el contador y recarga la lista silenciosamente.
    // (No removemos la fila del DOM por id para evitar inconsistencias; un
    // refetch es lo más simple y mantiene la lista en sync con el server.)
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
        // Refresca silenciosamente para mantener la lista coherente.
        loadList();
        if (!opts.silent) toast('Marcada como leída', 'success');
      }
    } catch (e) {
      // Reversión si la API falla.
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
      // El botón "Marcar todas" se va a ocultar al re-render del bell
      // cuando el store emita (unreadCount=0).
    } catch (e) {
      toast(e.message || 'No se pudieron marcar', 'error');
    }
  }

  // ── Cierre al click fuera o Esc ─────────────────────────────────────────
  const onDocClick = (e) => {
    if (!open) return;
    if (!root.contains(e.target)) closeDropdown();
  };
  const onKey = (e) => {
    if (e.key === 'Escape' && open) closeDropdown();
  };
  document.addEventListener('click', onDocClick, { capture: true });
  document.addEventListener('keydown', onKey);

  // Exponer cleanup al topbar (root._gcmCleanup lo llama al desmontar).
  root._bellDropdownCleanup = () => {
    document.removeEventListener('click', onDocClick, { capture: true });
    document.removeEventListener('keydown', onKey);
    if (realtimeAc) realtimeAc.abort();
  };

  return root;
}

// ── Menú de usuario ──────────────────────────────────────────────────────────
function renderUserMenu({ user, onLogout }) {
  const root = h('div.relative', {});
  const roleLabel = ROLE_LABEL[user.role] || user.role;
  const areaLabel = user.area ? AREA_LABEL[user.area] : null;

  const menu = h('div.absolute.right-0.top-full.mt-2.w-60.bg-white.rounded-lg.shadow-pop.border.border-surface-border.py-1.hidden.z-40', {}, [
    h('div.px-3.py-2.5.border-b.border-surface-border', {}, [
      h('div.text-sm.font-semibold.text-brand-ink.truncate', {}, user.full_name),
      h('div.text-xs.text-slate-500.truncate', {}, [roleLabel, areaLabel ? ` · ${areaLabel}` : ''].join('')),
    ]),
    h('button.flex.items-center.gap-2.w-full.px-3.py-2.text-sm.text-brand-ink.hover\\:bg-surface', { onclick: () => { closeMenu(); go('/dashboard'); } }, [
      icon(ICON.home, 'w-4 h-4 text-slate-500'), 'Mi inicio',
    ]),
    h('button.flex.items-center.gap-2.w-full.px-3.py-2.text-sm.text-brand-ink.hover\\:bg-surface', { onclick: () => { closeMenu(); go('/notifications'); } }, [
      h('svg.w-4.h-4.text-slate-500', { fill: 'none', stroke: 'currentColor', 'stroke-width': '2', viewBox: '0 0 24 24', html: `<path stroke-linecap="round" stroke-linejoin="round" d="${ICON.bell}" />` }),
      'Notificaciones',
    ]),
    h('div.border-t.border-surface-border.my-1'),
    h('button.flex.items-center.gap-2.w-full.px-3.py-2.text-sm.text-accent.hover\\:bg-accent/5', { onclick: () => { closeMenu(); onLogout(); } }, [
      h('svg.w-4.h-4', { fill: 'none', stroke: 'currentColor', 'stroke-width': '2', viewBox: '0 0 24 24', html: `<path stroke-linecap="round" stroke-linejoin="round" d="${ICON.logout}" />` }),
      'Cerrar sesión',
    ]),
  ]);
  const trigger = h('button.topbar-user-trigger.flex.items-center.gap-2.pl-1.pr-2.py-1.rounded-md.hover\\:bg-surface.transition', {
    onclick: (e) => { e.stopPropagation(); toggleMenu(); },
    'aria-haspopup': 'menu',
    'aria-expanded': 'false',
  }, [
    h('span.avatar.ring-2.ring-white', { style: { backgroundColor: avatarColor(user.id) } }, initials(user.full_name)),
    // El nombre y rol del usuario se muestran en TODOS los viewports — el
    // usuario pidió explícitamente que estén siempre visibles. Antes
    // usaba `hidden md:block`, lo que dejaba al usuario anónimo en mobile.
    h('div.text-left.flex.flex-col.justify-center', {}, [
      h('div.text-sm.font-semibold.text-brand-ink.leading-tight.max-w-[160px].truncate', {}, user.full_name),
      h('div.text-[11px].font-medium.text-slate-500.leading-tight.truncate', {}, [roleLabel, areaLabel ? ` · ${areaLabel}` : ''].join('')),
    ]),
    h('svg.w-4.h-4.text-slate-500.flex-none', { fill: 'none', stroke: 'currentColor', 'stroke-width': '2', viewBox: '0 0 24 24', html: '<path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />' }),
  ]);

  function isOpen() { return !menu.classList.contains('hidden'); }
  function openMenu() { menu.classList.remove('hidden'); trigger.setAttribute('aria-expanded', 'true'); }
  function closeMenu() { menu.classList.add('hidden'); trigger.setAttribute('aria-expanded', 'false'); }
  function toggleMenu() { isOpen() ? closeMenu() : openMenu(); }

  // Cerrar al clicar fuera (suscripción única por instancia, limpiada en cleanup).
  const onDocClick = () => { if (isOpen()) closeMenu(); };
  const onKey = (e) => { if (e.key === 'Escape' && isOpen()) closeMenu(); };
  document.addEventListener('click', onDocClick, { capture: true });
  document.addEventListener('keydown', onKey);

  // Exponer cleanup al topbar (que lo propaga al wrapper).
  root._userMenuCleanup = () => {
    document.removeEventListener('click', onDocClick, { capture: true });
    document.removeEventListener('keydown', onKey);
  };

  root.appendChild(trigger);
  root.appendChild(menu);
  return root;
}

// ── Acciones rápidas ─────────────────────────────────────────────────────────
function renderQuickActions(user) {
  const actions = quickActions(user);
  if (!actions.length) return null;
  return h('div.hidden.md\\:flex.items-center.gap-2', {}, actions.map((a) => {
    const cls = a.kind === 'accent' ? 'btn-accent' : a.kind === 'secondary' ? 'btn-secondary' : 'btn-ghost';
    return h(`button.${cls}`, { onclick: a.onclick }, [icon(a.icon, 'w-4 h-4'), h('span', {}, a.label)]);
  }));
}

// ── Toggle del sidebar (universal: mobile push + desktop collapse) ───────────
// El estado inicial del sidebar es responsabilidad de layout.js (lee
// localStorage y abre por defecto). Este botón sólo DISPARA el evento
// gcm:toggle-sidebar; la decisión de toggle (push mobile / collapse desktop)
// la toma layout.js según window.innerWidth.
function renderSidebarToggle() {
  const collapsed = document.body.classList.contains('gcm-sidebar-collapsed');
  const isMobile  = window.matchMedia('(max-width: 767.95px)').matches;
  // En mobile: el icono refleja el estado del push (panelOpen = "abierto
  // se muestra", panelClose = "abierto se cierra"). En desktop refleja el
  // colapso del rail.
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

// ── Componente principal ─────────────────────────────────────────────────────
export function renderTopbar({ user, onLogout }) {
  const { title, subtitle } = topbarContext(user);

  const root = h('header.topbar', {});

  // Izquierda: toggle del sidebar (universal) + contexto
  const left = h('div.flex.items-center.gap-3.min-w-0', {}, [
    renderSidebarToggle(),
    h('div.min-w-0', {}, [
      h('h1.text-base.font-semibold.text-brand-ink.leading-tight.truncate', {}, title),
      subtitle ? h('p.text-xs.text-slate-500.leading-tight.truncate', {}, subtitle) : null,
    ]),
  ]);
  root.appendChild(left);

  // Centro: buscador
  const center = h('div.flex-1.max-w-xl.hidden.md\\:block', {}, [renderSearch()]);
  root.appendChild(center);

  // Derecha: acciones + campana + usuario
  const userMenu = renderUserMenu({ user, onLogout });
  // renderBell devuelve un wrapper div.relative.inline-flex que contiene
  // el botón campana y el dropdown. Necesitamos la referencia al wrapper
  // para (1) reemplazarlo en refresh y (2) limpiar sus listeners al desmontar.
  let bellWrapper = renderBell();
  const right = h('div.flex.items-center.gap-1\\.5.md\\:gap-2', {}, [
    renderQuickActions(user),
    h('button.topbar-icon-btn.hidden.sm\\:inline-flex', {
      'aria-label': 'Ayuda', title: 'Ayuda',
      onclick: () => window.dispatchEvent(new CustomEvent('gcm:help')),
    }, [
      h('svg.w-5.h-5', { fill: 'none', stroke: 'currentColor', 'stroke-width': '2', viewBox: '0 0 24 24', 'aria-hidden': 'true', html: `<path stroke-linecap="round" stroke-linejoin="round" d="${ICON.help}" />` }),
    ]),
    h('div.w-px.h-6.bg-surface-border.hidden.sm\\:block'),
    bellWrapper,
    h('div.w-px.h-6.bg-surface-border.hidden.sm\\:block'),
    userMenu,
  ]);
  root.appendChild(right);

  mountedRoot = root;

  // Re-render del toggle del sidebar al colapsar.
  const refreshToggle = () => {
    if (!mountedRoot) return;
    const oldToggle = mountedRoot.querySelector('button[aria-label*="barra lateral"], button[aria-label*="menú"]');
    if (oldToggle) oldToggle.replaceWith(renderSidebarToggle());
  };
  // Re-render de la campana cuando cambia el sidebar (no frecuente) o
  // cuando cambia el unreadCount del store (frecuente). Importante:
  // cada re-render del bell crea un nuevo wrapper con sus propios listeners;
  // hay que limpiar el anterior y guardar el nuevo en `bellWrapper`.
  const refreshBell = () => {
    if (!mountedRoot || !bellWrapper.parentNode) return;
    if (typeof bellWrapper._bellDropdownCleanup === 'function') bellWrapper._bellDropdownCleanup();
    const next = renderBell();
    bellWrapper.parentNode.replaceChild(next, bellWrapper);
    bellWrapper = next;
  };

  // Escuchamos el evento de cambio de estado que dispara layout.js al colapsar.
  window.addEventListener('gcm:sidebar-state-changed', refreshToggle);
  // Y la campana se re-renderiza al cambiar el store (unreadCount, user, etc).
  const unsubscribe = subscribe((s) => {
    refreshBell();
  });

  // Cleanup: remover listeners de este topbar.
  root._gcmCleanup = () => {
    if (typeof userMenu._userMenuCleanup === 'function') userMenu._userMenuCleanup();
    if (typeof bellWrapper._bellDropdownCleanup === 'function') bellWrapper._bellDropdownCleanup();
    if (typeof unsubscribe === 'function') unsubscribe();
    window.removeEventListener('gcm:sidebar-state-changed', refreshToggle);
  };

  return root;
}
