/* Documentado por: Miguel Flores */
import { h } from '../utils/dom.js';

export function filterBadge(filters) {
  const active = Object.entries(filters)
    .filter(([k, v]) => v && v !== '' && k !== 'page' && k !== 'limit')
    .length;
  
  if (active === 0) return null;
  
  return h('div.inline-flex.items-center.gap-1.px-2.py-1.rounded-full.bg-blue-50.border.border-blue-200', {}, [
    h('span.text-xs.font-medium.text-blue-700', {}, `${active} filtro${active !== 1 ? 's' : ''}`),
  ]);
}

export function countActiveFilters(filters) {
  return Object.entries(filters)
    .filter(([k, v]) => v && v !== '' && k !== 'page' && k !== 'limit')
    .length;
}

