/* Documentado por: Miguel Flores */
import { h } from '../utils/dom.js';
import { ICON } from '../utils/icons.js';

/**
 * Crea un ícono SVG a partir de un path, usado dentro del botón de exportar.
 * @param {string} path - definición del atributo `d` del path SVG
 * @param {string} [cls='w-4 h-4'] - clases CSS de tamaño para el SVG
 * @returns {HTMLElement} elemento svg
 */
function svg(path, cls = 'w-4 h-4') {
  return h('svg', {
    class: cls,
    fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8',
    viewBox: '0 0 24 24', 'aria-hidden': 'true',
    html: `<path stroke-linecap="round" stroke-linejoin="round" d="${path}" />`,
  });
}

/**
 * Crea un botón con menú desplegable para exportar datos en distintos formatos
 * (Excel o PDF). Maneja apertura/cierre del menú al hacer click fuera o presionar Escape.
 * @param {Object} [options] - opciones de configuración
 * @param {string} [options.label='Exportar'] - texto del botón
 * @param {string} [options.kind='secondary'] - variante visual del botón ('primary', 'ghost' o 'secondary')
 * @param {Function} [options.onExport] - callback invocado con el formato elegido ('excel' o 'pdf')
 * @returns {HTMLElement} elemento div raíz con el botón y su menú
 */
export function exportButton(
  {
    label = 'Exportar',
    kind = 'secondary',
    onExport,
  } = {}
) {
  const cls = kind === 'primary' ? 'btn-primary' : kind === 'ghost' ? 'btn-ghost' : 'btn-secondary';

  const menu = h('div.absolute.right-0.top-full.mt-2.w-48.bg-white.rounded-xl.shadow-pop.border.border-surface-border.py-1.hidden.z-40.overflow-hidden', {
    role: 'menu',
    'aria-label': `Formato para ${label.toLowerCase()}`,
  }, [
    h('button.flex.items-center.w-full.px-3.py-2.text-sm.text-left.text-brand-ink.gap-2', {
      class: 'hover:bg-surface',
      role: 'menuitem',
      type: 'button',
      onclick: () => { closeMenu(); onExport?.('excel'); },
    }, [svg(ICON.report || ICON.download, 'w-4 h-4 text-emerald-600'), h('span', {}, 'Excel (.xlsx)')]),
    h('button.flex.items-center.w-full.px-3.py-2.text-sm.text-left.text-brand-ink.gap-2', {
      class: 'hover:bg-surface',
      role: 'menuitem',
      type: 'button',
      onclick: () => { closeMenu(); onExport?.('pdf'); },
    }, [svg(ICON.download, 'w-4 h-4 text-accent'), h('span', {}, 'PDF (.pdf)')]),
  ]);

  const trigger = h(`button.btn.${cls}`, {
    class: 'gap-1.5',
    type: 'button',
    onclick: (e) => { e.stopPropagation(); toggleMenu(); },
    'aria-haspopup': 'menu',
    'aria-expanded': 'false',
    'aria-label': label,
    title: label,
  }, [
    svg(ICON.download, 'w-4 h-4'),
    h('span.hidden', { class: 'sm:inline' }, label),
    svg('M19 9l-7 7-7-7', 'w-3.5 h-3.5'),
  ]);

  const root = h('div.relative.inline-block', {}, [trigger, menu]);

  /**
   * Indica si el menú de exportación está actualmente abierto.
   * @returns {boolean} true si el menú está visible
   */
  function isOpen() { return !menu.classList.contains('hidden'); }
  /**
   * Muestra el menú de exportación y actualiza el estado de accesibilidad del trigger.
   * @returns {void}
   */
  function openMenu() { menu.classList.remove('hidden'); trigger.setAttribute('aria-expanded', 'true'); }
  /**
   * Oculta el menú de exportación y actualiza el estado de accesibilidad del trigger.
   * @returns {void}
   */
  function closeMenu() { menu.classList.add('hidden'); trigger.setAttribute('aria-expanded', 'false'); }
  /**
   * Alterna la visibilidad del menú de exportación.
   * @returns {void}
   */
  function toggleMenu() { isOpen() ? closeMenu() : openMenu(); }

  /**
   * Cierra el menú si un click ocurre fuera de él (listener global en el documento).
   * @returns {void}
   */
  const onDocClick = () => { if (isOpen()) closeMenu(); };
  /**
   * Cierra el menú al presionar la tecla Escape (listener global en el documento).
   * @param {KeyboardEvent} e - evento de teclado
   * @returns {void}
   */
  const onKey = (e) => { if (e.key === 'Escape' && isOpen()) closeMenu(); };
  document.addEventListener('click', onDocClick, { capture: true });
  document.addEventListener('keydown', onKey);

  root._exportButtonCleanup = () => {
    document.removeEventListener('click', onDocClick, { capture: true });
    document.removeEventListener('keydown', onKey);
  };

  Object.defineProperty(root, 'disabled', {
    get() { return trigger.disabled; },
    set(v) { trigger.disabled = v; trigger.classList.toggle('opacity-60', v); trigger.classList.toggle('cursor-not-allowed', v); },
  });
  /**
   * Actualiza el texto visible del botón de exportación.
   * @param {string} text - nuevo texto a mostrar en el botón
   * @returns {void}
   */
  root.setLabel = (text) => {
    const span = trigger.querySelector('span');
    if (span) span.textContent = text;
  };

  return root;
}

export default exportButton;

