import { h } from '../utils/dom.js';

// Empty state genérico reutilizable
export function emptyState({
  icon = '○',
  title = 'Sin datos',
  message = 'No hay información para mostrar',
  action = null, // { label, onclick }
  className = '',
} = {}) {
  const content = [
    h('div.text-5xl.text-slate-300.mb-3', {}, icon),
    h('h3.text-lg.font-semibold.text-slate-600.mb-1', {}, title),
    h('p.text-sm.text-slate-500.mb-4', {}, message),
  ];

  if (action) {
    content.push(
      h('button.btn.btn-primary.btn-sm', { onclick: action.onclick }, action.label)
    );
  }

  return h(`div.flex.flex-col.items-center.justify-center.py-12.px-4.text-center.${className}`, {}, content);
}

// Empty states predefinidos por tipo
export const EMPTY_STATES = {
  tickets: {
    icon: '📋',
    title: 'Sin tickets',
    message: 'No hay tickets para los filtros seleccionados',
  },
  notifications: {
    icon: '🔔',
    title: 'Sin notificaciones',
    message: 'Tu bandeja está limpia. ¡Bien hecho!',
  },
  users: {
    icon: '👥',
    title: 'Sin usuarios',
    message: 'No hay usuarios que mostrar',
  },
  categories: {
    icon: '🏷️',
    title: 'Sin categorías',
    message: 'Crea una categoría para comenzar',
  },
  reports: {
    icon: '📊',
    title: 'Sin datos',
    message: 'No hay reportes para los filtros seleccionados',
  },
  dashboard: {
    icon: '📈',
    title: 'Sin datos',
    message: 'No hay datos para mostrar en este panel',
  },
  search: {
    icon: '🔍',
    title: 'Sin resultados',
    message: 'No se encontraron coincidencias para tu búsqueda',
  },
};

export default emptyState;
