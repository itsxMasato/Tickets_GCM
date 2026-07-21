/* Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. */
import { h, escapeHtml } from '../utils/dom.js';
import { isImage, fileSize } from '../utils/format.js';
import { ICON } from '../utils/icons.js';

// Tipos aceptados — espejo de src/middleware/upload.js (ALLOWED_MIMES). El
// backend sigue siendo la fuente de verdad: si el cliente acepta un tipo que
// el server rechaza, multer devuelve 400 UNSUPPORTED_MEDIA. Esta lista es
// sólo para feedback inmediato y filtrar al elegir archivos.
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

// Límite client-side (espejo de config.maxUploadMb). Backend sigue siendo
// la fuente de verdad — esto evita gastar upload en un archivo que será rechazado.
const MAX_BYTES = 25 * 1024 * 1024;

// Catálogo de iconos por tipo (paths SVG, no JSX).
const FILE_ICON = {
  image: ICON.image,
  pdf:   'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zM9 13h6M9 17h6M14 2v6h6',
  doc:   'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zM8 13h8M8 17h5M14 2v6h6',
  sheet: 'M3 3h18v18H3V3zM3 9h18M3 15h18M9 3v18M15 3v18',
  zip:   'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zM12 11v2M12 15v2',
  file:  'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zM14 2v6h6',
};

function iconFor(mime) {
  if (isImage(mime))    return { d: FILE_ICON.image, cls: 'text-brand-ocean' };
  if (mime === 'application/pdf') return { d: FILE_ICON.pdf,   cls: 'text-accent' };
  if (mime?.includes('word'))     return { d: FILE_ICON.doc,   cls: 'text-brand-ocean' };
  if (mime?.includes('sheet') || mime?.includes('excel')) return { d: FILE_ICON.sheet, cls: 'text-emerald-600' };
  if (mime?.includes('zip'))      return { d: FILE_ICON.zip,   cls: 'text-slate-500' };
  return { d: FILE_ICON.file, cls: 'text-slate-500' };
}

function readPreviewDataURL(file) {
  // Sólo imágenes. Genera data URL para preview inmediato. Si el navegador
  // se ahoga con un archivo grande, capturamos el error y caemos al icono.
  return new Promise((resolve) => {
    if (!isImage(file.type)) return resolve(null);
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

/**
 * Dropzone accesible: drag&drop + click + paste desde clipboard.
 *
 * API:
 *   const dz = attachmentsDropzone({ onChange: (files) => {}, disabled: bool })
 *   dz.getFiles() — array de File (limpios, sin metadatos UI)
 *   dz.clear()
 *   dz.destroy() — desconecta listeners
 *
 * Mantiene una lista interna de archivos pendientes. Valida tipo y tamaño
 * client-side (espejo de upload.js — el server sigue siendo la fuente de
 * verdad). Llama onChange en cada mutación.
 */
export function attachmentsDropzone({
  onChange,
  disabled = false,
  label = 'Adjuntar archivos',
  hint = 'Imágenes, PDF, Office, ZIP, texto. Máx. 25 MB por archivo.',
} = {}) {
  const files = [];   // { id, file, preview }
  const invalids = []; // { name, reason }

  // Input file invisible (lo activamos por click o por teclado sobre la zona).
  const fileInput = h('input.hidden', {
    type: 'file',
    multiple: true,
    accept: ACCEPT,
    tabindex: '-1',
    'aria-hidden': 'true',
    onchange: (e) => { addFiles(e.target.files); e.target.value = ''; },
  });

  // Lista de archivos pendientes
  const fileList = h('ul.gcm-dropzone-list.hidden.flex.flex-col.gap-2.mt-2', { 'aria-label': 'Archivos adjuntos' });
  const invalidList = h('ul.gcm-dropzone-invalids.hidden.mt-2.text-xs.text-amber-800.bg-amber-50.border.border-amber-200.rounded-md.px-3.py-2', { 'aria-label': 'Archivos no añadidos' });
  const counter = h('div.text-\\[10px\\].text-slate-500.mt-1', {}, '0 archivos');

  // Zona principal: clic + teclado abren el file picker
  const drop = h('div.gcm-dropzone.flex.flex-col.items-center.justify-center.gap-2.px-4.py-8.rounded-xl.border-2.border-dashed.border-surface-border-strong.bg-surface\\/40.text-center.transition', {
    tabindex: '0',
    role: 'button',
    'aria-label': `${label}. Enter, espacio o click para elegir. Arrastra archivos aquí. Pega con Ctrl+V.`,
  }, [
    h('span.flex.items-center.justify-center.w-10.h-10.rounded-full.bg-white.border.border-surface-border.text-brand-ocean', {}, [
      h('svg.w-5.h-5', { fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', viewBox: '0 0 24 24', 'aria-hidden': 'true', html: `<path stroke-linecap="round" stroke-linejoin="round" d="${ICON.attach}"/>` }),
    ]),
    h('div.text-sm.font-medium.text-brand-ink', {}, label),
    h('div.text-xs.text-slate-500', {}, hint),
    h('div.text-\\[10px\\].text-slate-500.mt-1', {}, 'Arrastra · pega con Ctrl+V · o haz click para elegir'),
  ]);

  // El input vive FUERA del dropzone (no anidado) para evitar doble trigger
  // por el for=… del label. La zona abre el picker programáticamente.
  function openPicker() { if (!disabled) fileInput.click(); }
  drop.addEventListener('click', openPicker);
  drop.addEventListener('keydown', (e) => {
    if (disabled) return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPicker(); }
  });

  // Drag & drop
  function setDragVisual(on) {
    drop.classList.toggle('gcm-dropzone-active', on);
  }
  function onDragOver(e) { if (disabled) return; e.preventDefault(); e.stopPropagation(); setDragVisual(true); }
  function onDragLeave(e) { e.preventDefault(); e.stopPropagation(); setDragVisual(false); }
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

  // Paste desde clipboard. El listener está en document para que funcione
  // aunque el foco esté en cualquier parte — exceptuamos inputs/textarea
  // editables (título, descripción) para no romper el comportamiento nativo.
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
    // Pulso visual de confirmación
    drop.classList.add('gcm-dropzone-active');
    setTimeout(() => drop.classList.remove('gcm-dropzone-active'), 320);
  }
  document.addEventListener('paste', onPaste);

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
      // Preview de imagen en background; si falla, queda null y usamos icono.
      readPreviewDataURL(file).then((url) => {
        const f = files.find((x) => x.id === id);
        if (f) { f.preview = url; renderFileList(); }
      });
    }
    renderFileList();
    renderInvalids();
    onChange?.(files.map((f) => f.file));
  }

  function removeAt(i) {
    files.splice(i, 1);
    renderFileList();
    onChange?.(files.map((f) => f.file));
  }

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
      li.appendChild(h('button.btn-icon-sm.text-slate-500.hover\\:text-accent', {
        type: 'button',
        'aria-label': `Quitar ${f.file.name}`,
        onclick: () => removeAt(i),
      }, '×'));
      fileList.appendChild(li);
    });
  }

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

  function getFiles() { return files.map((f) => f.file); }
  function clear() {
    files.length = 0;
    invalids.length = 0;
    renderFileList();
    renderInvalids();
    onChange?.([]);
  }
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
