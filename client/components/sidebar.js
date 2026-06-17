import { h } from '../utils/dom.js';
import { go } from '../router.js';
import {
  isSAC, isJefe, isAdmin, isSupervisor,
  canCreateTicket, canViewReports, canManageUsers, canManageCategories, canViewAllTickets,
} from '../utils/permissions.js';
import { ROLE_LABEL, AREA_LABEL } from '../utils/format.js';
import { ICON } from '../utils/icons.js';

function icon(path, cls = 'sidebar-icon') {
  return h(`svg.${cls}`, {
    fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8',
    viewBox: '0 0 24 24',
    html: `<path stroke-linecap="round" stroke-linejoin="round" d="${path}" />`,
  });
}

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
          { to: '/categories',    label: 'Categorías',     icon: ICON.tag,    match: (p) => p === '/categories', visible: canManageCategories },
          { to: '/reports',       label: 'Reportes',       icon: ICON.report, match: (p) => p === '/reports' },
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
export function renderSidebar({ user, onLogout }) {
  const p = path();
  const sections = navFor(user);
  const roleLabel = ROLE_LABEL[user.role] || user.role;
  const areaLabel = user.area ? AREA_LABEL[user.area] : null;

  return h('aside.sidebar', {}, [
    // Brand
    h('div.sidebar-brand', {}, [
      h('div.w-10.h-10.rounded-lg.bg-white/15.flex.items-center.justify-center.font-bold.text-lg', {}, 'G'),
      h('div', {}, [
        h('div.font-bold.leading-tight', {}, 'GCM Tickets'),
        h('div.text-[11px].text-white/60.leading-tight', {}, 'Servicio al cliente'),
      ]),
    ]),

    // Nav por secciones
    h('nav.flex-1.overflow-y-auto.py-2', {}, sections.map((section) => {
      const items = section.items.filter((i) => i.visible?.(user) !== false);
      if (!items.length) return null;
      return h('div.mb-1', {}, [
        h('div.sidebar-section', {}, section.title),
        h('div.flex.flex-col.gap-0.5.px-2', {}, items.map((item) => {
          const active = item.match(p);
          return h('button', {
            class: ['sidebar-link', active ? 'active' : ''],
            onclick: () => go(item.to),
            'aria-current': active ? 'page' : null,
          }, [
            icon(item.icon),
            h('span', {}, item.label),
            active ? h('span.ml-auto.w-1.5.h-1.5.rounded-full.bg-brand-ocean') : null,
          ]);
        })),
      ]);
    })),

    // Acción rápida (sólo quien puede crear)
    canCreateTicket(user)
      ? h('div.px-3.pb-2', {}, [
          h('button.btn.btn-accent.w-full.justify-center', {
            onclick: () => go('/tickets/new'),
          }, [icon(ICON.plus, 'w-4.h-4'), h('span', {}, 'Nuevo ticket')]),
        ])
      : null,

    // Pie: usuario + logout
    h('div.sidebar-foot', {}, [
      h('div.flex.items-center.gap-3.px-2.py-2.rounded-md.bg-white/5', {}, [
        h('div.avatar.bg-white/20', {}, initials(user.full_name)),
        h('div.flex-1.min-w-0', {}, [
          h('div.text-sm.font-semibold.truncate', {}, user.full_name),
          h('div.text-[11px].text-white/60.truncate', {}, [roleLabel, areaLabel ? ` · ${areaLabel}` : ''].join('')),
        ]),
        (() => {
          const btn = h('button.btn.btn-ghost.gap-1.5.text-white/70.hover\\:bg-white\\/10.px-2.py-1', {
            onclick: onLogout,
            'aria-label': 'Cerrar sesión',
            title: 'Cerrar sesión',
          }, [icon(ICON.logout, 'w-4 h-4'), h('span.text-sm', {}, 'Cerrar')]);
          return btn;
        })(),
      ]),
    ]),
  ]);
}

function initials(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?';
}
