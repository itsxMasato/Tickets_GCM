import { h } from '../utils/dom.js';
import { go } from '../router.js';
import { subscribe, getState } from '../store.js';
import { ROLE_LABEL } from '../utils/format.js';
import { ICON } from '../utils/icons.js';

let mountedRoot = null;
let mobileMenuHandler = null;

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
function renderSearch() {
  const input = h('input.flex-1.bg-transparent.border-0.outline-none.text-sm.placeholder\\:text-slate-400', {
    type: 'search',
    placeholder: 'Buscar tickets, usuarios… (presiona /)',
    'aria-label': 'Buscar',
  });
  const wrap = h('div.topbar-search', {}, [
    icon(ICON.search, 'w-4 h-4 text-slate-400'),
    input,
    h('kbd.hidden.md\\:inline-flex.items-center.justify-center.text-[10px].font-medium.text-slate-500.bg-white.border.border-surface-border.rounded.px-1.5.h-5', {}, '/'),
  ]);

  // Interceptar teclado global
  if (!window.__gcmSearchHooked) {
    window.__gcmSearchHooked = true;
    document.addEventListener('keydown', (e) => {
      const t = e.target;
      const isTyping = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
      if (!isTyping && e.key === '/') {
        e.preventDefault();
        input.focus();
      } else if (isTyping && t === input && e.key === 'Enter') {
        const q = input.value.trim();
        if (q) go(`/tickets?q=${encodeURIComponent(q)}`);
      } else if (e.key === 'Escape' && t === input) {
        input.value = '';
        input.blur();
      }
    });
  }
  return wrap;
}

// ── Campana + dropdown de notificaciones (topbar) ────────────────────────────
function renderBell() {
  const { unreadCount } = getState();
  const btn = h('button.btn-icon.relative', {
    onclick: () => go('/notifications'),
    'aria-label': 'Notificaciones',
    title: 'Notificaciones',
  }, [
    icon(ICON.bell),
    unreadCount > 0
      ? h('span.absolute.top-1.right-1.bg-accent.text-white.text-[10px].rounded-full.px-1.min-w-[16px].h-4.flex.items-center.justify-center.font-semibold', {},
          String(unreadCount > 99 ? '99+' : unreadCount))
      : null,
  ]);
  return btn;
}

// ── Menú de usuario ──────────────────────────────────────────────────────────
function renderUserMenu({ user, onLogout }) {
  const root = h('div.relative', {});
  const menu = h('div.absolute.right-0.top-full.mt-2.w-60.bg-white.rounded-lg.shadow-pop.border.border-surface-border.py-1.hidden.z-40', {}, [
    h('div.px-3.py-2.5.border-b.border-surface-border', {}, [
      h('div.text-sm.font-semibold.text-brand-ink.truncate', {}, user.full_name),
      h('div.text-xs.text-slate-500.truncate', {}, ROLE_LABEL[user.role] || user.role),
    ]),
    h('button.flex.items-center.gap-2.w-full.px-3.py-2.text-sm.text-brand-ink.hover\\:bg-surface', { onclick: () => { closeMenu(); go('/dashboard'); } }, [
      icon(ICON.home, 'w-4 h-4 text-slate-500'), 'Mi inicio',
    ]),
    h('button.flex.items-center.gap-2.w-full.px-3.py-2.text-sm.text-brand-ink.hover\\:bg-surface', { onclick: () => { closeMenu(); go('/notifications'); } }, [
      icon(ICON.bell, 'w-4 h-4 text-slate-500'), 'Notificaciones',
    ]),
    h('div.border-t.border-surface-border.my-1'),
    h('button.flex.items-center.gap-2.w-full.px-3.py-2.text-sm.text-accent.hover\\:bg-accent/5', { onclick: () => { closeMenu(); onLogout(); } }, [
      icon(ICON.logout, 'w-4 h-4'), 'Cerrar sesión',
    ]),
  ]);
  const trigger = h('button.flex.items-center.gap-2.pl-1.pr-2.py-1.rounded-md.hover\\:bg-surface.transition', {
    onclick: (e) => { e.stopPropagation(); toggleMenu(); },
    'aria-haspopup': 'menu',
    'aria-expanded': 'false',
  }, [
    h('span.avatar.ring-2.ring-white', { style: { backgroundColor: avatarColor(user.id) } }, initials(user.full_name)),
    h('div.text-left.hidden.md\\:block', {}, [
      h('div.text-sm.font-medium.text-brand-ink.leading-tight.max-w-[140px].truncate', {}, user.full_name),
      h('div.text-[11px].text-slate-500.leading-tight', {}, ROLE_LABEL[user.role] || user.role),
    ]),
    h('svg.w-4.h-4.text-slate-400', { fill: 'none', stroke: 'currentColor', 'stroke-width': '2', viewBox: '0 0 24 24', html: '<path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />' }),
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

// ── Botón de menú móvil (togglea la sidebar en <md) ──────────────────────────
function renderMobileMenu() {
  const btn = h('button.btn-icon.md\\:hidden', {
    'aria-label': 'Abrir menú',
    onclick: () => window.dispatchEvent(new CustomEvent('gcm:toggle-sidebar')),
  }, [icon(ICON.menu)]);
  return btn;
}

// ── Componente principal ─────────────────────────────────────────────────────
export function renderTopbar({ user, onLogout }) {
  const { title, subtitle } = topbarContext(user);

  const root = h('header.topbar', {});

  // Izquierda: menú móvil + contexto
  const left = h('div.flex.items-center.gap-3.min-w-0', {}, [
    renderMobileMenu(),
    h('div.min-w-0', {}, [
      h('div.text-[11px].uppercase.tracking-wider.text-slate-400.leading-none.mb-0.5', {}, 'GCM Tickets'),
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
  const right = h('div.flex.items-center.gap-1\\.5.md\\:gap-2', {}, [
    renderQuickActions(user),
    h('button.btn.btn-ghost.gap-1.5.hidden.sm\\:inline-flex', {
      'aria-label': 'Ayuda', title: 'Ayuda',
      onclick: () => window.dispatchEvent(new CustomEvent('gcm:help')),
    }, [icon(ICON.help, 'w-4 h-4'), h('span.text-sm', {}, 'Ayuda')]),
    h('div.w-px.h-6.bg-surface-border.hidden.sm\\:block'),
    renderBell(),
    h('div.w-px.h-6.bg-surface-border.hidden.sm\\:block'),
    userMenu,
  ]);
  root.appendChild(right);

  mountedRoot = root;
  // Re-render del badge de la campana al cambiar el store (limpiar al desmontar)
  const unsubscribe = subscribe((s) => {
    if (!mountedRoot) return;
    const newBell = renderBell();
    const oldBell = mountedRoot.querySelector('button[aria-label="Notificaciones"]');
    if (oldBell) oldBell.replaceWith(newBell);
  });

  // Exponer cleanup de los listeners de este topbar (document click/keydown del menú + subscribe).
  // El wrapper de layout del router lo invoca al desmontar la vista.
  root._gcmCleanup = () => {
    if (typeof userMenu._userMenuCleanup === 'function') userMenu._userMenuCleanup();
    if (typeof unsubscribe === 'function') unsubscribe();
  };

  return root;
}
