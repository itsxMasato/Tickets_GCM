/* Documentado por: Miguel Flores */
import { h } from '../utils/dom.js';
import { go } from '../router.js';
import {
  isSAC, isJefe, isAdmin, isSupervisor,
  canManageUsers, canManageCategories, canManageCompanies,
} from '../utils/permissions.js';
import { ICON } from '../utils/icons.js';

/**
 * Crea el ícono SVG de un ítem de navegación del sidebar.
 * @param {string} path - definición del atributo `d` del path SVG
 * @param {string} [cls='sidebar-icon'] - clases CSS del ícono
 * @returns {HTMLElement} elemento svg
 */
function icon(path, cls = 'sidebar-icon') {
  return h(`svg.${cls}`, {
    xmlns: 'http://www.w3.org/2000/svg',
    fill: 'none', stroke: 'currentColor', 'stroke-width': '2',
    viewBox: '0 0 24 24',
    html: `<path stroke-linecap="round" stroke-linejoin="round" d="${path}" />`,
  });
}

/**
 * Crea el ícono SVG pequeño que acompaña el título de una sección del sidebar.
 * @param {string} path - definición del atributo `d` del path SVG
 * @returns {HTMLElement} elemento svg
 */
function sectionIcon(path) {
  return h('svg.flex-none.opacity-70', {
    class: 'w-3.5 h-3.5',
    xmlns: 'http://www.w3.org/2000/svg',
    fill: 'none', stroke: 'currentColor', 'stroke-width': '2',
    viewBox: '0 0 24 24',
    'aria-hidden': 'true',
    html: `<path stroke-linecap="round" stroke-linejoin="round" d="${path}" />`,
  });
}

const SECTION_ICON = {
  'Operación':       ICON.section_operation,
  'Administración':  ICON.section_admin,
  'Notificaciones':  ICON.section_notifications,
  'Cuenta':          ICON.section_account,
};

/**
 * Obtiene la ruta actual de la app a partir del hash de la URL.
 * @returns {string} ruta actual (ej. '/dashboard')
 */
function path() {
  return (location.hash || '').replace(/^#/, '') || '/dashboard';
}

/**
 * Arma la estructura de navegación (secciones e ítems) del sidebar según el rol
 * del usuario (supervisor_campo, admin_area, jefe_inmediato o sac).
 * @param {Object} user - usuario actual, usado para determinar su rol
 * @returns {Array<Object>} lista de secciones con título e ítems de navegación
 */
function navFor(user) {
  if (isSupervisor(user)) {
    return [
      {
        title: 'Operación',
        items: [
          { to: '/dashboard',     label: 'Inicio',        icon: ICON.dashboard, match: (p) => p === '/dashboard' || p === '/' },
          { to: '/tickets',       label: 'Mis tickets',   icon: ICON.ticket,    match: (p) => p.startsWith('/tickets') },
          { to: '/calendar',      label: 'Calendario',    icon: ICON.calendar,  match: (p) => p === '/calendar' },
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

  if (isAdmin(user)) {
    return [
      {
        title: 'Operación',
        items: [
          { to: '/dashboard',     label: 'Inicio',       icon: ICON.dashboard, match: (p) => p === '/dashboard' || p === '/' },
          { to: '/tickets',       label: 'Mi área',      icon: ICON.ticket,    match: (p) => p.startsWith('/tickets') },
          { to: '/calendar',      label: 'Calendario',   icon: ICON.calendar,  match: (p) => p === '/calendar' },
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

  if (isJefe(user)) {
    return [
      {
        title: 'Operación',
        items: [
          { to: '/dashboard',     label: 'Inicio',          icon: ICON.dashboard, match: (p) => p === '/dashboard' || p === '/' },
          { to: '/tickets',       label: 'Tickets del área', icon: ICON.ticket,   match: (p) => p.startsWith('/tickets') },
          { to: '/reports',       label: 'Reportes',         icon: ICON.report,   match: (p) => p === '/reports' },
          { to: '/calendar',      label: 'Calendario',       icon: ICON.calendar, match: (p) => p === '/calendar' },
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

  if (isSAC(user)) {
    return [
      {
        title: 'Operación',
        items: [
          { to: '/dashboard',     label: 'Inicio',         icon: ICON.dashboard, match: (p) => p === '/dashboard' || p === '/' },
          { to: '/tickets',       label: 'Todos los tickets', icon: ICON.ticket, match: (p) => p.startsWith('/tickets') },
          { to: '/calendar',      label: 'Calendario',     icon: ICON.calendar, match: (p) => p === '/calendar' },
        ],
      },
      {
        title: 'Administración',
        items: [
          { to: '/users',         label: 'Usuarios',       icon: ICON.users,  match: (p) => p === '/users',      visible: canManageUsers },
          { to: '/roles',         label: 'Roles',          icon: ICON.shield, match: (p) => p === '/roles',      visible: canManageUsers },
          { to: '/categories',    label: 'Categorías',     icon: ICON.tag,    match: (p) => p === '/categories', visible: canManageCategories },
          { to: '/companies',     label: 'Empresas',       icon: ICON.building, match: (p) => p === '/companies' || p.startsWith('/companies/'), visible: canManageCompanies },
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

  return [
    {
      title: 'Operación',
      items: [
        { to: '/dashboard', label: 'Inicio', icon: ICON.dashboard, match: (p) => p === '/dashboard' || p === '/' },
      ],
    },
  ];
}

/**
 * Renderiza el sidebar de navegación completo: marca/logo, secciones de menú
 * filtradas por permisos del usuario y resaltado del ítem activo según la ruta actual.
 * @param {Object} params - parámetros de renderizado
 * @param {Object} params.user - usuario actual (determina rol y permisos visibles)
 * @param {Function} [params.onClose] - callback invocado al navegar (ej. cerrar el drawer móvil)
 * @returns {HTMLElement} elemento aside con el sidebar
 */
export function renderSidebar({ user, onClose }) {
  const p = path();
  const sections = navFor(user);

  return h('aside.sidebar', {}, [
    h('div.sidebar-brand', {}, [
      h('div.w-10.h-10.rounded-lg.bg-white.flex.items-center.justify-center.shadow-soft.flex-none', {}, [
        h('img.w-8.h-8.object-contain', { src: '/img/Logo.png', alt: 'Logo GCM' }),
      ]),
      h('div.sidebar-brand-meta.min-w-0', {}, [
        h('div.font-bold.leading-tight.truncate', {}, 'GCM Tickets'),
        h('div.leading-tight.truncate', { class: 'text-[11px] text-white/60' }, 'Servicio al cliente'),
      ]),
    ]),

    h('nav.flex-1.overflow-y-auto.py-2', {}, sections.map((section) => {
      const items = section.items.filter((i) => i.visible?.(user) !== false);
      if (!items.length) return null;
      const sectionIconPath = SECTION_ICON[section.title];
      return h('div.mb-1', {}, [
        h('div.sidebar-section', {}, [
          sectionIconPath ? sectionIcon(sectionIconPath) : null,
          h('span', {}, section.title),
        ]),
        h('div.flex.flex-col.px-2', { class: 'gap-0.5' }, items.map((item) => {
          const active = item.match(p);
          return h('button', {
            class: ['sidebar-link', active ? 'active' : ''],
            onclick: () => {
              if (typeof onClose === 'function') onClose();
              go(item.to);
            },
            'aria-current': active ? 'page' : null,
          }, [
            icon(item.icon),
            h('span', {}, item.label),
          ]);
        })),
      ]);
    })),
  ]);
}
