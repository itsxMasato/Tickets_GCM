/* Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. */
// Iconos centralizados (SVG paths, 24x24, stroke-based).
//
// Un solo set canónico. Todos los componentes y vistas importan `svg()` o
// el mapa `ICON` desde acá. No usar SVG inline hardcodeados con html: '<path d="…">'
// — para eso existe `svg(name)`.
//
// El sidebar y los iconos grandes pueden usar `ICON.<name>` directamente;
// para iconos inline usar `svg(h, ICON.plus, 'w-4 h-4')` o `svg(h, 'plus', 'w-4 h-4')`.
export const ICON = {
  // Navegación
  back:      'M19 12H5M12 19l-7-7 7-7',
  menu:      'M4 6h16M4 12h16M4 18h16',
  close:     'M6 6l12 12M18 6L6 18',
  x:         'M6 6l12 12M18 6L6 18',
  arrow:     'M5 12h14M13 5l7 7-7 7',
  arrowR:    'M5 12h14M13 5l7 7-7 7',
  arrowL:    'M19 12H5M12 5l-7 7 7 7',
  chevronR:  'M9 18l6-6-6-6',
  chevronL:  'M15 18l-6-6 6-6',
  chevronD:  'M19 9l-7 7-7-7',

  // Sidebar toggle
  // expandido -> colapsar (mostrar flecha hacia el sidebar, sugiriendo "esconder")
  panelClose:'M11 4l-6 6 6 6M4 10h12M20 4v16',
  // colapsado -> expandir (mostrar flecha desde el sidebar hacia fuera)
  panelOpen: 'M13 4l6 6-6 6M20 10H8M4 4v16',

  // Acciones
  plus:      'M12 5v14M5 12h14',
  refresh:   'M4 4v6h6M20 20v-6h-6M4 10a8 8 0 0114-3M20 14a8 8 0 01-14 3',
  edit:      'M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4 9.5-9.5z',
  trash:     'M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6M10 11v6M14 11v6',
  download:  'M12 3v12m0 0l-4-4m4 4l4-4M5 21h14',
  search:    'M21 21l-4.3-4.3M17 10a7 7 0 11-14 0 7 7 0 0114 0z',
  attach:    'M21 12.8l-8.5 8.5a5.5 5.5 0 11-7.8-7.8l8.5-8.5a3.7 3.7 0 015.2 5.2L10 18.7',
  send:      'M5 12h14M13 5l7 7-7 7',
  link:      'M10 13a5 5 0 007 0l4-4a5 5 0 00-7-7l-1 1M14 11a5 5 0 00-7 0l-4 4a5 5 0 007 7l1-1',
  drag:      'M8 6h.01M8 12h.01M8 18h.01M16 6h.01M16 12h.01M16 18h.01',
  calendar:  'M3 7a2 2 0 012-2h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V7zM3 11h18M8 3v4M16 3v4',
  gantt:     'M4 4h16M4 9h10M4 14h6M4 19h8',
  clock:     'M12 22a10 10 0 100-20 10 10 0 000 20zM12 6v6l4 2',

  // Notificaciones & Comunicación
  bell:      'M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2a2 2 0 01-.6 1.4L4 17h5m6 0a3 3 0 11-6 0',
  inbox:     'M3 8h18M3 8l2 12h14l2-12M9 12h6',
  user:      'M16 11a4 4 0 10-8 0 4 4 0 008 0zM4 21a8 8 0 0116 0',
  users:     'M16 11a4 4 0 10-8 0 4 4 0 008 0zM4 21a8 8 0 0116 0',

  // Auth
  login:     'M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4M10 17l5-5-5-5M15 12H3',
  logout:    'M15 17l5-5-5-5M20 12H9M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4',
  lock:      'M7 11V7a5 5 0 0110 0v4M5 11h14a2 2 0 012 2v7a2 2 0 01-2 2H5a2 2 0 01-2-2v-7a2 2 0 012-2z',
  lockOpen:  'M7 11V7a5 5 0 019.9-1M5 11h14a2 2 0 012 2v7a2 2 0 01-2 2H5a2 2 0 01-2-2v-7a2 2 0 012-2z',
  eye:       'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 100-6 3 3 0 000 6z',
  eyeOff:    'M3 3l18 18M10.6 6.1A10 10 0 0112 6c6.5 0 10 6 10 6a14 14 0 01-3.1 4M6.6 6.6A14 14 0 002 12s3.5 6 10 6c1.5 0 2.9-.3 4.1-.8M9.9 9.9a3 3 0 004.2 4.2',
  capsLock:  'M5 13l-2 2M19 13l2 2M9 11l3-6 3 6M3 19h18',
  alert:     'M12 9v4m0 4h.01M10.3 3.86 1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z',
  check:     'M5 13l4 4L19 7',
  shield:    'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  // 'audit' — clipboard con check, distinto de 'shield' (Roles) para que
  // el sidebar no mezcle los dos en el menú Administración.
  audit:     'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4',
  key:       'M21 2l-2 2m-7.6 7.6a5 5 0 11-7 7 5 5 0 017-7L19 8l-3 3 2 2 3-3 2 2-2 2',
  copy:      'M8 4h10a2 2 0 012 2v10M4 8h10a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V10a2 2 0 012-2z',
  extLink:   'M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3',
  help:      'M9.1 9a3 3 0 015.8 1c0 2-3 2-3 4M12 17h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',

  // Contacto / Institucional
  mail:      'M4 4h16a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2zM2 6l10 7L22 6',
  phone:     'M22 16.92V21a1 1 0 01-1.11 1A19 19 0 012 4.11 1 1 0 013 3h4.09a1 1 0 011 .75l1 4a1 1 0 01-.27 1L7 10.5a16 16 0 006.5 6.5l1.75-1.82a1 1 0 011-.27l4 1a1 1 0 01.75 1z',
  building:  'M3 21h18M5 21V5a2 2 0 012-2h10a2 2 0 012 2v16M9 7h.01M9 11h.01M9 15h.01M15 7h.01M15 11h.01M15 15h.01',
  globe:     'M12 22a10 10 0 100-20 10 10 0 000 20zM2 12h20M12 2a15 15 0 010 20M12 2a15 15 0 000 20',

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

  // Sidebar section headers
  section_operation:      'M4 6h6v6H4zM14 6h6v6h-6zM4 16h6v6H4zM14 16h6v6h-6z',
  section_admin:          'M12 2l3 6 6 1-4.5 4.5L18 20l-6-3-6 3 1.5-6.5L3 9l6-1z',
  section_notifications:  'M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2a2 2 0 01-.6 1.4L4 17h5m6 0a3 3 0 11-6 0',
  section_account:        'M16 11a4 4 0 10-8 0 4 4 0 008 0zM4 21a8 8 0 0116 0',
};

// Render helper — un solo punto de entrada para todos los iconos del sistema.
// Uso: `svg(h, 'plus', 'w-5 h-5')` o `svg(h, ICON.plus, 'w-5 h-5')`.
//
// El stroke-width se centraliza en 1.8 para que el sidebar, topbar, vistas
// y modales dibujen con el mismo grosor (antes había 1.8 vs 2 mezclado).
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
