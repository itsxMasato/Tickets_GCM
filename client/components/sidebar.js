import { h } from '../utils/dom.js';
import { go } from '../router.js';
import {
  isSAC, isJefe, isAdmin, isSupervisor,
  canManageUsers, canManageCategories,
} from '../utils/permissions.js';
import { AREA_LABEL } from '../utils/format.js';
import { getRoleLabel, subscribe as subscribeRoleLabel } from '../utils/role-labels.js';
import { ICON } from '../utils/icons.js';
import { avatarColor, initials } from '../utils/avatar.js';

function icon(path, cls = 'sidebar-icon') {
  return h(`svg.${cls}`, {
    xmlns: 'http://www.w3.org/2000/svg',
    fill: 'none', stroke: 'currentColor', 'stroke-width': '2',
    viewBox: '0 0 24 24',
    html: `<path stroke-linecap="round" stroke-linejoin="round" d="${path}" />`,
  });
}

function sectionIcon(path) {
  // Icono más pequeño y de menor opacidad para headers de sección.
  return h('svg.w-3.5.h-3.5.flex-none.opacity-70', {
    xmlns: 'http://www.w3.org/2000/svg',
    fill: 'none', stroke: 'currentColor', 'stroke-width': '2',
    viewBox: '0 0 24 24',
    'aria-hidden': 'true',
    html: `<path stroke-linecap="round" stroke-linejoin="round" d="${path}" />`,
  });
}

// Mapea cada título de sección a su icono. Si el sistema crece a más
// secciones, agregar aquí. Mantener en sync con navFor() abajo.
const SECTION_ICON = {
  'Operación':       ICON.section_operation,
  'Administración':  ICON.section_admin,
  'Notificaciones':  ICON.section_notifications,
  'Cuenta':          ICON.section_account,
};

// ── Definición de navegación por rol ─────────────────────────────────────────
// Cada rol tiene su propio arreglo: secciones -> items.
// path: ruta destino, label, icon, active: (pathActual) => bool, visible: (user) => bool

function path() {
  return (location.hash || '').replace(/^#/, '') || '/dashboard';
}

function navFor(user) {
  // === Supervisor de campo ===
  if (isSupervisor(user)) {
    return [
      {
        title: 'Operación',
        items: [
          { to: '/dashboard',     label: 'Inicio',        icon: ICON.dashboard, match: (p) => p === '/dashboard' || p === '/' },
          { to: '/tickets',       label: 'Mis tickets',   icon: ICON.ticket,    match: (p) => p.startsWith('/tickets') },
        ],
      },
      {
        title: 'Cuenta',
        items: [
          { to: '/notifications', label: 'Notificaciones', icon: ICON.bell, match: (p) => p === '/notifications' },
        ],
      },
    ];
  }

  // === Administrador de área ===
  if (isAdmin(user)) {
    return [
      {
        title: 'Operación',
        items: [
          { to: '/dashboard',     label: 'Inicio',       icon: ICON.dashboard, match: (p) => p === '/dashboard' || p === '/' },
          { to: '/tickets',       label: 'Mi área',      icon: ICON.ticket,    match: (p) => p.startsWith('/tickets') },
        ],
      },
      {
        title: 'Notificaciones',
        items: [
          { to: '/notifications', label: 'Bandeja',      icon: ICON.bell, match: (p) => p === '/notifications' },
        ],
      },
    ];
  }

  // === Jefe inmediato ===
  if (isJefe(user)) {
    return [
      {
        title: 'Operación',
        items: [
          { to: '/dashboard',     label: 'Inicio',          icon: ICON.dashboard, match: (p) => p === '/dashboard' || p === '/' },
          { to: '/tickets',       label: 'Tickets del área', icon: ICON.ticket,   match: (p) => p.startsWith('/tickets') },
          { to: '/reports',       label: 'Reportes',         icon: ICON.report,   match: (p) => p === '/reports' },
        ],
      },
      {
        title: 'Notificaciones',
        items: [
          { to: '/notifications', label: 'Bandeja',          icon: ICON.bell,     match: (p) => p === '/notifications' },
        ],
      },
    ];
  }

  // === SAC (admin global) ===
  if (isSAC(user)) {
    return [
      {
        title: 'Operación',
        items: [
          { to: '/dashboard',     label: 'Inicio',         icon: ICON.dashboard, match: (p) => p === '/dashboard' || p === '/' },
          { to: '/tickets',       label: 'Todos los tickets', icon: ICON.ticket, match: (p) => p.startsWith('/tickets') },
        ],
      },
      {
        title: 'Administración',
        items: [
          { to: '/users',         label: 'Usuarios',       icon: ICON.users,  match: (p) => p === '/users',      visible: canManageUsers },
          { to: '/roles',         label: 'Roles',          icon: ICON.shield, match: (p) => p === '/roles',      visible: canManageUsers },
          { to: '/categories',    label: 'Categorías',     icon: ICON.tag,    match: (p) => p === '/categories', visible: canManageCategories },
          { to: '/reports',       label: 'Reportes',       icon: ICON.report, match: (p) => p === '/reports' },
          { to: '/audit',         label: 'Auditoría',      icon: ICON.shield, match: (p) => p === '/audit' },
        ],
      },
      {
        title: 'Notificaciones',
        items: [
          { to: '/notifications', label: 'Bandeja',        icon: ICON.bell,   match: (p) => p === '/notifications' },
        ],
      },
    ];
  }

  // fallback
  return [
    {
      title: 'Operación',
      items: [
        { to: '/dashboard', label: 'Inicio', icon: ICON.dashboard, match: (p) => p === '/dashboard' || p === '/' },
      ],
    },
  ];
}

// ── Sidebar export ───────────────────────────────────────────────────────────
export function renderSidebar({ user, onLogout, onClose }) {
  const p = path();
  const sections = navFor(user);
  const roleLabelEl = h('span', {}, getRoleLabel(user.role) || user.role);
  const areaLabel = user.area ? AREA_LABEL[user.area] : null;
  // Si el SAC renombra el rol del usuario actual mientras el sidebar
  // está montado, actualizamos el texto en vivo sin re-render del shell.
  const unsub = subscribeRoleLabel((e) => {
    if (e.detail?.role === user.role) {
      roleLabelEl.textContent = e.detail.label || user.role;
    }
  });

  return h('aside.sidebar', {}, [
    // Brand
    h('div.sidebar-brand', {}, [
      h('div.w-10.h-10.rounded-lg.bg-white.flex.items-center.justify-center.shadow-soft.flex-none', {}, [
        h('img.w-8.h-8.object-contain', { src: '/img/Logo.png', alt: 'Logo GCM' }),
      ]),
      h('div.sidebar-brand-meta.min-w-0', {}, [
        h('div.font-bold.leading-tight.truncate', {}, 'GCM Tickets'),
        h('div.text-[11px].text-white/60.leading-tight.truncate', {}, 'Servicio al cliente'),
      ]),
    ]),

    // Nav por secciones
    h('nav.flex-1.overflow-y-auto.py-2', {}, sections.map((section) => {
      const items = section.items.filter((i) => i.visible?.(user) !== false);
      if (!items.length) return null;
      const sectionIconPath = SECTION_ICON[section.title];
      return h('div.mb-1', {}, [
        h('div.sidebar-section', {}, [
          sectionIconPath ? sectionIcon(sectionIconPath) : null,
          h('span', {}, section.title),
        ]),
        h('div.flex.flex-col.gap-0.5.px-2', {}, items.map((item) => {
          const active = item.match(p);
          return h('button', {
            class: ['sidebar-link', active ? 'active' : ''],
            // Cierre optimista del drawer mobile antes de la navegación.
            // Evita el frame visible donde el drawer queda sobre la nueva vista
            // (cierre por hashchange tiene 1 frame de delay perceptible).
            onclick: () => {
              if (typeof onClose === 'function') onClose();
              go(item.to);
            },
            'aria-current': active ? 'page' : null,
          }, [
            icon(item.icon),
            h('span', {}, item.label),
            active ? h('span.sidebar-active-dot.ml-auto.w-1.5.h-1.5.rounded-full.bg-brand-ocean') : null,
          ]);
        })),
      ]);
    })),

    // Pie: usuario + cerrar sidebar (mobile) + logout
    h('div.sidebar-foot', {}, [
      h('div.sidebar-user.flex.items-center.gap-3.px-2.py-2.rounded-md.bg-white/10', {}, [
        h('div.avatar', { style: { backgroundColor: avatarColor(user.id) } }, initials(user.full_name)),
        h('div.sidebar-foot-meta.flex-1.min-w-0', {}, [
          h('div.text-sm.font-semibold.truncate', {}, user.full_name),
          h('div.text-[11px].text-white/60.truncate', {}, [roleLabelEl, areaLabel ? ` · ${areaLabel}` : ''].join('')),
        ]),
        h('button.btn-logout', {
          onclick: (e) => { e.stopPropagation(); if (typeof onLogout === 'function') onLogout(); },
          'aria-label': 'Cerrar sesión',
          title: 'Cerrar sesión',
        }, [icon(ICON.logout, 'w-4 h-4')]),
      ]),
    ]),
  ]);
}