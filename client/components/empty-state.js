/* Documentado por: Miguel Flores */
import { h } from '../utils/dom.js';

const ICON = {
  ticket:    'M3 7h18M3 12h18M3 17h12',
  bell:      'M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2a2 2 0 01-.6 1.4L4 17h5m6 0a3 3 0 11-6 0',
  users:     'M16 11a4 4 0 10-8 0 4 4 0 008 0zM4 21a8 8 0 0116 0M22 21a6 6 0 00-12 0',
  tag:       'M20 12l-8 8-8-8 8-8h8v8z',
  chart:     'M4 19V5m6 14V9m6 10v-6m4 6V3',
  search:    'M21 21l-4.3-4.3M17 10a7 7 0 11-14 0 7 7 0 0114 0z',
  inbox:     'M3 8h18M3 8l2 12h14l2-12M9 12h6',
};

/**
 * Crea un ícono SVG a partir del path definido en ICON, con el ticket como ícono por defecto.
 * @param {string} name - clave del ícono dentro de ICON
 * @param {string} [cls='w-10 h-10'] - clases CSS de tamaño para el SVG
 * @returns {HTMLElement} elemento svg
 */
function svgIcon(name, cls = 'w-10 h-10') {
  return h(`svg.${cls}`, {
    fill: 'none', stroke: 'currentColor', 'stroke-width': '1.6',
    viewBox: '0 0 24 24', 'aria-hidden': 'true',
    html: `<path stroke-linecap="round" stroke-linejoin="round" d="${ICON[name] || ICON.ticket}" />`,
  });
}

/**
 * Arma un bloque de "estado vacío" con ícono, título, mensaje y un botón de
 * acción opcional, usado cuando una lista o panel no tiene datos que mostrar.
 * @param {Object} [options] - opciones de configuración
 * @param {string} [options.icon='ticket'] - clave del ícono a mostrar
 * @param {string} [options.title='Sin datos'] - título del estado vacío
 * @param {string} [options.message] - mensaje descriptivo
 * @param {{onclick: Function, label: string}|null} [options.action=null] - acción opcional con callback y texto de botón
 * @param {string} [options.className=''] - clases CSS adicionales para el contenedor
 * @returns {HTMLElement} elemento div con el estado vacío
 */
export function emptyState(
  {
    icon = 'ticket',
    title = 'Sin datos',
    message = 'No hay información para mostrar',
    action = null,
    className = '',
  } = {}
) {
  const content = [
    h('div.flex.items-center.justify-center.w-16.h-16.mx-auto.mb-4.rounded-full.bg-surface.text-brand-ocean', {}, [svgIcon(icon)]),
    h('h3.text-base.font-semibold.text-brand-ink.mb-1', {}, title),
    h('p.text-sm.text-slate-500.max-w-md.mx-auto.mb-4', {}, message),
  ];

  if (action) {
    content.push(
      h('button.btn.btn-primary.btn-sm', { onclick: action.onclick }, action.label)
    );
  }

  return h(`div.flex.flex-col.items-center.justify-center.py-12.px-6.text-center.${className}`, {}, content);
}

export const EMPTY_STATES = {
  tickets: {
    icon: 'ticket',
    title: 'Sin tickets',
    message: 'No hay tickets que coincidan con los filtros seleccionados. Ajusta los filtros o crea uno nuevo.',
  },
  notifications: {
    icon: 'bell',
    title: 'Bandeja vacía',
    message: 'No tienes notificaciones en este momento. Te avisaremos cuando haya actividad en tus tickets.',
  },
  users: {
    icon: 'users',
    title: 'Sin usuarios',
    message: 'Aún no se han creado cuentas en el sistema.',
  },
  categories: {
    icon: 'tag',
    title: 'Sin categorías',
    message: 'Crea categorías para clasificar los tickets (red, infraestructura, mantenimiento, etc.).',
  },
  reports: {
    icon: 'chart',
    title: 'Sin datos',
    message: 'No hay reportes para los filtros seleccionados. Prueba a ampliar el rango de fechas.',
  },
  dashboard: {
    icon: 'chart',
    title: 'Sin datos',
    message: 'No hay datos para mostrar en este panel todavía.',
  },
  search: {
    icon: 'search',
    title: 'Sin resultados',
    message: 'No se encontraron coincidencias para tu búsqueda.',
  },
};

export default emptyState;

