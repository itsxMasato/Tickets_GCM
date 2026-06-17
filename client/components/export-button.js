import { h } from '../utils/dom.js';
import { ICON } from '../utils/icons.js';

// SVG helper que cierra sobre h (local)
function svg(path, cls = 'w-4 h-4') {
  return h(`svg.${cls}`, {
    fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8',
    viewBox: '0 0 24 24', 'aria-hidden': 'true',
    html: `<path stroke-linecap="round" stroke-linejoin="round" d="${path}" />`,
  });
}

// Botón de exportación reutilizable (PDF, Excel, CSV, etc)
export function exportButton({
  label = 'Exportar',
  format = 'pdf', // 'pdf' | 'excel' | 'csv'
  kind = 'secondary', // 'primary' | 'secondary' | 'ghost'
  onclick,
} = {}) {
  const cls = kind === 'primary' ? 'btn-primary' : kind === 'ghost' ? 'btn-ghost' : 'btn-secondary';
  const labelSuffix = format === 'excel' ? ' Excel' : format === 'csv' ? ' CSV' : ' PDF';
  
  return h(`button.btn.${cls}.gap-1.5`, 
    { 
      onclick,
      'aria-label': label + labelSuffix,
      title: label + labelSuffix,
    }, 
    [
      svg(ICON.download, 'w-4 h-4'),
      h('span.hidden.sm\\:inline', {}, label + labelSuffix),
    ]
  );
}

export default exportButton;
