/* Documentado por: Miguel Flores */
import { h, escapeHtml } from '../utils/dom.js';
import { isImage, fileSize } from '../utils/format.js';
import { ICON } from '../utils/icons.js';

const ACCEPT = [
  'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml', 'image/bmp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain', 'text/csv', 'text/markdown',
  'application/zip', 'application/x-zip-compressed',
  'application/json',
].join(',');
const ACCEPT_TYPES = new Set(ACCEPT.split(','));

const MAX_BYTES = 25 * 1024 * 1024;

const FILE_ICON = {
  image: ICON.image,
  pdf:   'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zM9 13h6M9 17h6M14 2v6h6',
  doc:   'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zM8 13h8M8 17h5M14 2v6h6',
  sheet: 'M3 3h18v18H3V3zM3 9h18M3 15h18M9 3v18M15 3v18',
  zip:   'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zM12 11v2M12 15v2',
  file:  'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zM14 2v6h6',
};

/**
 * Determina qué ícono y color de Tailwind corresponden a un tipo MIME de archivo.
 * @param {string} mime - tipo MIME del archivo
 * @returns {{d: string, cls: string}} path del ícono SVG y clase de color
 */
function iconFor(mime) {
  if (isImage(mime))    return { d: FILE_ICON.image, cls: 'text-brand-ocean' };
  if (mime === 'application/pdf') return { d: FILE_ICON.pdf,   cls: 'text-accent' };
  if (mime?.includes('word'))     return { d: FILE_ICON.doc,   cls: 'text-brand-ocean' };
  if (mime?.includes('sheet') || mime?.includes('excel')) return { d: FILE_ICON.sheet, cls: 'text-emerald-600' };
  if (mime?.includes('zip'))      return { d: FILE_ICON.zip,   cls: 'text-slate-500' };
  return { d: FILE_ICON.file, cls: 'text-slate-500' };
}

/**
 * Genera una previsualización en base64 (data URL) de un archivo si es una imagen.
 * @param {File} file - archivo a previsualizar
 * @returns {Promise<string|null>} data URL de la imagen, o null si no es imagen o falla la lectura
 */
function readPreviewDataURL(file) {
  return new Promise((resolve) => {
    if (!isImage(file.type)) return resolve(null);
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

/**
 * Crea una zona de arrastrar/soltar para adjuntar archivos, con validación de
 * tipo y tamaño, previsualización de imágenes, pegado desde el portapapeles
 * (Ctrl+V) y lista de archivos inválidos rechazados.
 * @param {Object} [options] - opciones de configuración
 * @param {Function} [options.onChange] - callback invocado con la lista de archivos válidos cada vez que cambia
 * @param {boolean} [options.disabled=false] - deshabilita la interacción con la zona de drop
 * @param {string} [options.label='Adjuntar archivos'] - texto principal mostrado en la zona
 * @param {string} [options.hint] - texto de ayuda sobre tipos y tamaño permitidos
 * @returns {{root: HTMLElement, getFiles: Function, clear: Function, destroy: Function}} controlador del dropzone
 */
export function attachmentsDropzone(
  {
    onChange,
    disabled = false,
    label = 'Adjuntar archivos',
    hint = 'Imágenes, PDF, Office, ZIP, texto. Máx. 25 MB por archivo.',
  } = {}
) {
  const files = [];
  const invalids = [];

  const fileInput = h('input.hidden', {
    type: 'file',
    multiple: true,
    accept: ACCEPT,
    tabindex: '-1',
    'aria-hidden': 'true',
    onchange: (e) => { addFiles(e.target.files); e.target.value = ''; },
  });

  const fileList = h('ul.gcm-dropzone-list.hidden.flex.flex-col.gap-2.mt-2', { 'aria-label': 'Archivos adjuntos' });
  const invalidList = h('ul.gcm-dropzone-invalids.hidden.mt-2.text-xs.text-amber-800.bg-amber-50.border.border-amber-200.rounded-md.px-3.py-2', { 'aria-label': 'Archivos no añadidos' });
  const counter = h('div.text-slate-500.mt-1', { class: 'text-[10px]' }, '0 archivos');

  const drop = h('div.gcm-dropzone.flex.flex-col.items-center.justify-center.gap-2.px-4.py-8.rounded-xl.border-2.border-dashed.border-surface-border-strong.text-center.transition', {
    class: 'bg-surface/40',
    tabindex: '0',
    role: 'button',
    'aria-label': `${label}. Enter, espacio o click para elegir. Arrastra archivos aquí. Pega con Ctrl+V.`,
  }, [
    h('span.flex.items-center.justify-center.w-10.h-10.rounded-full.bg-white.border.border-surface-border.text-brand-ocean', {}, [
      h('svg.w-5.h-5', { fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', viewBox: '0 0 24 24', 'aria-hidden': 'true', html: `<path stroke-linecap="round" stroke-linejoin="round" d="${ICON.attach}"/>` }),
    ]),
    h('div.text-sm.font-medium.text-brand-ink', {}, label),
    h('div.text-xs.text-slate-500', {}, hint),
    h('div.text-slate-500.mt-1', { class: 'text-[10px]' }, 'Arrastra · pega con Ctrl+V · o haz click para elegir'),
  ]);

  /**
   * Abre el selector nativo de archivos si el dropzone no está deshabilitado.
   * @returns {void}
   */
  function openPicker() { if (!disabled) fileInput.click(); }
  drop.addEventListener('click', openPicker);
  drop.addEventListener('keydown', (e) => {
    if (disabled) return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPicker(); }
  });

  /**
   * Activa o desactiva el resaltado visual de la zona de drop.
   * @param {boolean} on - true para mostrar el resaltado
   * @returns {void}
   */
  function setDragVisual(on) {
    drop.classList.toggle('gcm-dropzone-active', on);
  }
  /**
   * Maneja el evento de arrastrar un archivo sobre la zona de drop, mostrando el resaltado.
   * @param {DragEvent} e - evento de arrastre
   * @returns {void}
   */
  function onDragOver(e) { if (disabled) return; e.preventDefault(); e.stopPropagation(); setDragVisual(true); }
  /**
   * Maneja el evento de salir del área de drop, quitando el resaltado.
   * @param {DragEvent} e - evento de arrastre
   * @returns {void}
   */
  function onDragLeave(e) { e.preventDefault(); e.stopPropagation(); setDragVisual(false); }
  /**
   * Maneja el evento de soltar archivos sobre la zona de drop, agregándolos a la cola.
   * @param {DragEvent} e - evento de soltado
   * @returns {void}
   */
  function onDrop(e) {
    e.preventDefault(); e.stopPropagation();
    setDragVisual(false);
    if (disabled) return;
    if (e.dataTransfer?.files) addFiles(e.dataTransfer.files);
  }
  drop.addEventListener('dragenter', onDragOver);
  drop.addEventListener('dragover', onDragOver);
  drop.addEventListener('dragleave', onDragLeave);
  drop.addEventListener('drop', onDrop);

  /**
   * Maneja el pegado desde el portapapeles (Ctrl+V): si contiene archivos y el
   * foco no está en un campo de texto, los agrega a la cola de adjuntos.
   * @param {ClipboardEvent} e - evento de pegado
   * @returns {void}
   */
  function onPaste(e) {
    if (disabled) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    const items = e.clipboardData?.items;
    if (!items) return;
    const pasted = [];
    for (const it of items) {
      if (it.kind === 'file') {
        const f = it.getAsFile();
        if (f) pasted.push(f);
      }
    }
    if (pasted.length === 0) return;
    e.preventDefault();
    addFiles(pasted);
    drop.classList.add('gcm-dropzone-active');
    setTimeout(() => drop.classList.remove('gcm-dropzone-active'), 320);
  }
  document.addEventListener('paste', onPaste);

  /**
   * Valida (tipo y tamaño) y agrega archivos entrantes a la cola de adjuntos,
   * generando su previsualización si son imágenes y notificando el cambio mediante onChange.
   * @param {FileList|Array<File>} fileListLike - archivos a procesar
   * @returns {void}
   */
  function addFiles(fileListLike) {
    if (disabled) return;
    const incoming = Array.from(fileListLike || []);
    if (incoming.length === 0) return;
    for (const file of incoming) {
      const id = `f${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      if (!file.type || !ACCEPT_TYPES.has(file.type)) {
        invalids.push({ name: file.name, reason: `Tipo no permitido: ${file.type || 'desconocido'}` });
        continue;
      }
      if (file.size > MAX_BYTES) {
        invalids.push({ name: file.name, reason: `Supera el límite de ${fileSize(MAX_BYTES)}` });
        continue;
      }
      files.push({ id, file, preview: null });
      readPreviewDataURL(file).then((url) => {
        const f = files.find((x) => x.id === id);
        if (f) { f.preview = url; renderFileList(); }
      });
    }
    renderFileList();
    renderInvalids();
    onChange?.(files.map((f) => f.file));
  }

  /**
   * Quita un archivo de la cola de adjuntos por su índice y notifica el cambio.
   * @param {number} i - índice del archivo a quitar
   * @returns {void}
   */
  function removeAt(i) {
    files.splice(i, 1);
    renderFileList();
    onChange?.(files.map((f) => f.file));
  }

  /**
   * Redibuja la lista visual de archivos adjuntos válidos (con previsualización o ícono).
   * @returns {void}
   */
  function renderFileList() {
    counter.textContent = `${files.length} ${files.length === 1 ? 'archivo' : 'archivos'}`;
    fileList.innerHTML = '';
    if (files.length === 0) {
      fileList.classList.add('hidden');
      return;
    }
    fileList.classList.remove('hidden');
    files.forEach((f, i) => {
      const li = h('li.flex.items-center.gap-3.px-3.py-2.rounded-md.bg-white.border.border-surface-border', {});
      if (f.preview) {
        li.appendChild(h('img.w-10.h-10.rounded.object-cover.flex-none.border.border-surface-border', { src: f.preview, alt: '' }));
      } else {
        const ic = iconFor(f.file.type);
        li.appendChild(h(`span.flex-none.w-10.h-10.rounded.bg-surface.flex.items-center.justify-center.${ic.cls}`, {}, [
          h('svg.w-5.h-5', { fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', viewBox: '0 0 24 24', 'aria-hidden': 'true', html: `<path stroke-linecap="round" stroke-linejoin="round" d="${ic.d}"/>` }),
        ]));
      }
      li.appendChild(h('div.flex-1.min-w-0', {}, [
        h('div.text-sm.font-medium.text-brand-ink.truncate', {}, f.file.name),
        h('div.text-xs.text-slate-500', {}, `${(f.file.type.split('/')[1] || 'archivo').toUpperCase()} · ${fileSize(f.file.size)}`),
      ]));
      li.appendChild(h('button.btn-icon-sm.text-slate-500', {
        class: 'hover:text-accent',
        type: 'button',
        'aria-label': `Quitar ${f.file.name}`,
        onclick: () => removeAt(i),
      }, '×'));
      fileList.appendChild(li);
    });
  }

  /**
   * Redibuja la lista visual de archivos rechazados por validación, con su motivo de rechazo.
   * @returns {void}
   */
  function renderInvalids() {
    invalidList.innerHTML = '';
    if (invalids.length === 0) {
      invalidList.classList.add('hidden');
      return;
    }
    invalidList.classList.remove('hidden');
    invalids.forEach((inv) => {
      invalidList.appendChild(h('li', {}, `${escapeHtml(inv.name)} — ${escapeHtml(inv.reason)}`));
    });
  }

  /**
   * Devuelve los archivos File actualmente en la cola de adjuntos válidos.
   * @returns {Array<File>} lista de archivos adjuntos
   */
  function getFiles() { return files.map((f) => f.file); }
  /**
   * Limpia la cola de archivos adjuntos y de inválidos, y notifica el cambio.
   * @returns {void}
   */
  function clear() {
    files.length = 0;
    invalids.length = 0;
    renderFileList();
    renderInvalids();
    onChange?.([]);
  }
  /**
   * Elimina el listener global de pegado (paste) registrado por el dropzone.
   * @returns {void}
   */
  function destroy() {
    document.removeEventListener('paste', onPaste);
  }

  return {
    root: h('div.flex.flex-col', {}, [drop, fileInput, fileList, invalidList, counter]),
    getFiles,
    clear,
    destroy,
  };
}

