// Iconos centralizados (SVG paths, 24x24, stroke-based)
export const ICON = {
  // Navegación
  back:      'M19 12H5M12 19l-7-7 7-7',
  menu:      'M4 6h16M4 12h16M4 18h16',
  close:     'M6 6l12 12M18 6L6 18',
  arrow:     'M5 12h14M13 5l7 7-7 7',

  // Acciones
  plus:      'M12 5v14M5 12h14',
  refresh:   'M4 4v6h6M20 20v-6h-6M4 10a8 8 0 0114-3M20 14a8 8 0 01-14 3',
  edit:      'M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4 9.5-9.5z',
  download:  'M12 3v12m0 0l-4-4m4 4l4-4M5 21h14',
  search:    'M21 21l-4.3-4.3M17 10a7 7 0 11-14 0 7 7 0 0114 0z',
  attach:    'M21 12.8l-8.5 8.5a5.5 5.5 0 11-7.8-7.8l8.5-8.5a3.7 3.7 0 015.2 5.2L10 18.7',
  send:      'M5 12h14M13 5l7 7-7 7',
  
  // Notificaciones & Comunicación
  bell:      'M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2a2 2 0 01-.6 1.4L4 17h5m6 0a3 3 0 11-6 0',
  inbox:     'M3 8h18M3 8l2 12h14l2-12M9 12h6',
  user:      'M16 11a4 4 0 10-8 0 4 4 0 008 0zM4 21a8 8 0 0116 0',
  users:     'M16 11a4 4 0 10-8 0 4 4 0 008 0zM4 21a8 8 0 0116 0',
  logout:    'M15 17l5-5-5-5M20 12H9M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4',
  help:      'M9.1 9a3 3 0 015.8 1c0 2-3 2-3 4M12 17h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',

  // Dashboard & Navegación
  dashboard: 'M3 12l9-9 9 9M5 10v10h14V10',
  home:      'M3 12l9-9 9 9M5 10v10h14V10',
  ticket:    'M3 7h18M3 12h18M3 17h12',
  tag:       'M20 12l-8 8-8-8 8-8h8v8z',
  report:    'M4 19V5m6 14V9m6 10v-6m4 6V3',
  folder:    'M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z',
  layers:    'M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5M3 18l9 5 9-5',

  // Estados (ticket notifications)
  ticket_created:        'M12 4v16m8-8H4',
  ticket_assigned:       'M16 11a4 4 0 10-8 0 4 4 0 008 0zM4 21a8 8 0 0116 0',
  ticket_commented:      'M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z',
  ticket_status_changed: 'M4 4v6h6M20 20v-6h-6M4 10a8 8 0 0114-3M20 14a8 8 0 01-14 3',
  ticket_closed:         'M5 13l4 4L19 7',
  ticket_reopened:       'M4 4v6h6M20 20v-6h-6M4 10a8 8 0 0114-3M20 14a8 8 0 01-14 3',
  ticket_transferred:    'M4 12h16M14 6l6 6-6 6',
  reopen:                'M4 4v6h6M20 20v-6h-6M4 10a8 8 0 0114-3M20 14a8 8 0 01-14 3',

  // Archivos & Multimedia (chat composer)
  image:     'M3 5a2 2 0 012-2h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5zM8 11a2 2 0 100-4 2 2 0 000 4zM21 15l-5-5L5 21',
  file:      'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zM14 2v6h6',
  spinner:   'M12 2a10 10 0 100 20 10 10 0 000-20zM12 6v6l4 2',
};

// Renderizar SVG con path del ICON (usar con: import { ICON, svg } from '../utils/icons.js')
export function svg(h, nameOrPath, cls = 'w-4 h-4') {
  const path = typeof nameOrPath === 'string' && nameOrPath in ICON ? ICON[nameOrPath] : nameOrPath;
  return h(`svg.${cls}`, {
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '1.8',
    viewBox: '0 0 24 24',
    'aria-hidden': 'true',
    html: `<path stroke-linecap="round" stroke-linejoin="round" d="${path}" />`,
  });
}
