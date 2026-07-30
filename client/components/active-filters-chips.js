/* Documentado por: Miguel Flores */
import { h } from '../utils/dom.js';
import { STATUS_LABEL, PRIORITY_LABEL, AREA_LABEL } from '../utils/format.js';

export function activeFiltersChips(filters, onClearFilter, userNames = {}) {
  const active = Object.entries(filters)
    .filter(([k, v]) => v && v !== '' && k !== 'page' && k !== 'limit')
    .map(([key, value]) => ({ key, value }));
  
  if (active.length === 0) return null;
  
  const chips = active.map(({ key, value }) => {
    let label = `${key}: ${value}`;
    
    switch (key) {
    case 'status':
      label = `Estado: ${STATUS_LABEL[value] || value}`;
      break;
    case 'priority':
      label = `Prioridad: ${PRIORITY_LABEL[value] || value}`;
      break;
    case 'area':
      label = `Área: ${AREA_LABEL[value] || value}`;
      break;
    case 'assigned_to':
      label = `Responsable: ${userNames[value] || value}`;
      break;
    case 'date_from':
      label = `Desde: ${value}`;
      break;
    case 'date_to':
      label = `Hasta: ${value}`;
      break;
    case 'search':
      label = `Búsqueda: "${value}"`;
      break;
    }
    
    return h('div.inline-flex.items-center.gap-1.px-3.py-1.rounded-full.bg-blue-100.border.border-blue-300.text-sm', {}, [
      h('span.text-blue-800', {}, label),
      h('button.ml-1.text-blue-600.font-bold.text-xs',
        { class: 'hover:text-blue-800', onclick: (e) => { e.stopPropagation(); onClearFilter(key); } },
        '×'
      ),
    ]);
  });
  
  return h('div.flex.flex-wrap.gap-2.items-center', {}, chips);
}

export function activeFilterCount(filters) {
  const active = Object.entries(filters)
    .filter(([k, v]) => v && v !== '' && k !== 'page' && k !== 'limit')
    .length;
  
  if (active === 0) return null;
  
  return h('div.inline-flex.items-center.gap-1.px-2.py-1.rounded-full.bg-blue-50.border.border-blue-200.text-xs', {}, [
    h('span.font-medium.text-blue-700', {}, `${active} filtro${active !== 1 ? 's' : ''}`),
  ]);
}

