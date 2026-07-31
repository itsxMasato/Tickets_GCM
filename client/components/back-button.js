/* Documentado por: Miguel Flores */
import { h } from '../utils/dom.js';
import { go } from '../router.js';
import { ICON } from '../utils/icons.js';

/**
 * Crea un ícono SVG a partir de un path, usado dentro del botón de volver.
 * @param {string} path - definición del atributo `d` del path SVG
 * @param {string} [cls='w-4 h-4'] - clases CSS de tamaño para el SVG
 * @returns {HTMLElement} elemento svg
 */
function svg(path, cls = 'w-4 h-4') {
  return h(`svg.${cls}`, {
    fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8',
    viewBox: '0 0 24 24', 'aria-hidden': 'true',
    html: `<path stroke-linecap="round" stroke-linejoin="round" d="${path}" />`,
  });
}

/**
 * Crea un botón de "volver" que navega a una ruta previa (por defecto /tickets).
 * @param {Object} [options] - opciones de configuración del botón
 * @param {string} [options.href='/tickets'] - ruta a la que navega al hacer click
 * @param {string} [options.label='Volver'] - texto del botón
 * @param {string} [options.icon=ICON.back] - path del ícono a mostrar
 * @param {string} [options.className] - clases CSS adicionales de color/estado
 * @param {string} [options.minHeight] - clase CSS de alto mínimo (accesibilidad táctil)
 * @returns {HTMLElement} elemento button de retroceso
 */
export function backButton(
  { 
    href = '/tickets',
    label = 'Volver',
    icon = ICON.back,
    className = 'text-brand-ink hover:text-brand',
    minHeight = 'min-h-[44px]',
  } = {}
) {
  return h(`button.flex.items-center.gap-1.text-sm.font-medium.${className}.inline-flex.${minHeight}.-ml-1.px-1.rounded`, 
    { onclick: () => go(href) }, 
    [
      svg(icon, 'w-4 h-4'),
      label,
    ]
  );
}

export default backButton;

