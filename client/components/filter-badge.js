/* Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. */
import { h } from '../utils/dom.js';

/**
 * Crea un badge que muestra la cantidad de filtros activos.
 * Devuelve null si no hay filtros activos.
 */
export function filterBadge(filters) {
  const active = Object.entries(filters)
    .filter(([k, v]) => v && v !== '' && k !== 'page' && k !== 'limit')
    .length;
  
  if (active === 0) return null;
  
  return h('div.inline-flex.items-center.gap-1.px-2.py-1.rounded-full.bg-blue-50.border.border-blue-200', {}, [
    h('span.text-xs.font-medium.text-blue-700', {}, `${active} filtro${active !== 1 ? 's' : ''}`),
  ]);
}

/**
 * Actualiza la barra de filtros para mostrar el contador de filtros activos.
 * También retorna el contador para usarlo en debug.
 */
export function countActiveFilters(filters) {
  return Object.entries(filters)
    .filter(([k, v]) => v && v !== '' && k !== 'page' && k !== 'limit')
    .length;
}
