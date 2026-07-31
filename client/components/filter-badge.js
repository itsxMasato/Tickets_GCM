/* Documentado por: Miguel Flores */
import { h } from '../utils/dom.js';

/**
 * Crea un badge visual que muestra la cantidad de filtros activos aplicados.
 * Devuelve null si no hay ningún filtro activo (excluyendo paginación).
 * @param {Object} filters - objeto de filtros actuales (clave/valor)
 * @returns {HTMLElement|null} badge con el conteo de filtros, o null si no hay filtros activos
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
 * Cuenta cuántos filtros están activos, excluyendo los parámetros de paginación.
 * @param {Object} filters - objeto de filtros actuales (clave/valor)
 * @returns {number} cantidad de filtros con valor activo
 */
export function countActiveFilters(filters) {
  return Object.entries(filters)
    .filter(([k, v]) => v && v !== '' && k !== 'page' && k !== 'limit')
    .length;
}

