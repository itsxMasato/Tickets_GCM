/* Documentado por: Miguel Flores */
import { h } from '../utils/dom.js';
import { isImage, fileSize } from '../utils/format.js';
import { api } from '../api.js';

const FILE_ICON = {
  image: 'M3 5a2 2 0 012-2h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5zM8 11a2 2 0 100-4 2 2 0 000 4zM21 15l-5-5L5 21',
  pdf:   'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zM9 13h6M9 17h6M14 2v6h6',
  doc:   'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zM8 13h8M8 17h5M14 2v6h6',
  sheet: 'M3 3h18v18H3V3zM3 9h18M3 15h18M9 3v18M15 3v18',
  zip:   'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zM12 11v2M12 15v2',
  file:  'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zM14 2v6h6',
};

/**
 * Crea un ícono SVG a partir del path definido en FILE_ICON para el tipo de archivo dado.
 * @param {string} name - clave del ícono dentro de FILE_ICON (image, pdf, doc, sheet, zip, file)
 * @param {string} [cls='w-5 h-5'] - clases CSS de tamaño para el SVG
 * @returns {HTMLElement} elemento svg
 */
function svgFor(name, cls = 'w-5 h-5') {
  return h(`svg.${cls}`, {
    fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8',
    viewBox: '0 0 24 24', 'aria-hidden': 'true',
    html: `<path stroke-linecap="round" stroke-linejoin="round" d="${FILE_ICON[name]}" />`,
  });
}

/**
 * Determina qué ícono y color de Tailwind corresponden a un tipo MIME de archivo.
 * @param {string} mime - tipo MIME del archivo adjunto
 * @returns {{name: string, cls: string}} nombre del ícono en FILE_ICON y clase de color
 */
function iconFor(mime) {
  if (isImage(mime))    return { name: 'image', cls: 'text-brand-ocean' };
  if (mime === 'application/pdf') return { name: 'pdf', cls: 'text-accent' };
  if (mime?.includes('word'))     return { name: 'doc', cls: 'text-brand-ocean' };
  if (mime?.includes('sheet') || mime?.includes('excel')) return { name: 'sheet', cls: 'text-emerald-600' };
  if (mime?.includes('zip'))      return { name: 'zip',  cls: 'text-slate-500' };
  return { name: 'file', cls: 'text-slate-500' };
}

/**
 * Arma la miniatura de un archivo adjunto: una imagen previsualizable si es una foto,
 * o una tarjeta con ícono, nombre y tamaño para el resto de tipos de archivo. Enlaza
 * a la descarga/visualización del adjunto.
 * @param {Object} att - adjunto a mostrar (mime_type, original_name, size, id)
 * @param {string|number} ticketId - id del ticket al que pertenece el adjunto
 * @returns {HTMLElement} elemento anchor con la miniatura del adjunto
 */
export function attachmentThumb(att, ticketId) {
  if (isImage(att.mime_type)) {
    return h('a.group.block.relative.overflow-hidden.rounded-md.border.border-slate-200.bg-slate-50', {
      href: api.tickets.downloadUrl(ticketId, att.id),
      target: '_blank',
      rel: 'noopener',
      title: att.original_name,
      'aria-label': `Ver ${att.original_name}`,
    }, [
      h('img.w-32.h-32.object-cover.transition', {
        class: 'group-hover:opacity-90 group-hover:scale-105',
        src: api.tickets.downloadUrl(ticketId, att.id),
        alt: att.original_name,
        loading: 'lazy',
        width: '128', height: '128',
      }),
    ]);
  }
  const ic = iconFor(att.mime_type);
  return h('a.flex.items-center.px-3.py-2.rounded-md.border.border-slate-200.bg-white.max-w-xs.transition', {
    class: 'gap-2.5 hover:bg-slate-50 hover:border-surface-border',
    href: api.tickets.downloadUrl(ticketId, att.id),
    target: '_blank',
    rel: 'noopener',
    title: att.original_name,
    'aria-label': `Descargar ${att.original_name}`,
  }, [
    h(`span.flex-none.${ic.cls}`, {}, [svgFor(ic.name)]),
    h('div.min-w-0', {}, [
      h('div.text-sm.font-medium.text-slate-800.truncate', {}, att.original_name),
      h('div.text-xs.text-slate-500', {}, `${(att.mime_type || '').split('/')[1] || 'archivo'} · ${fileSize(att.size)}`),
    ]),
  ]);
}

