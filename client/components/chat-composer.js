/* Documentado por: Miguel Flores */
import { h, escapeHtml } from '../utils/dom.js';
import { api } from '../api.js';
import { toast } from '../utils/toast.js';
import { isImage, fileSize } from '../utils/format.js';
import { ICON } from '../utils/icons.js';
/**
 * Crea un ícono SVG a partir del path definido en ICON para el nombre dado.
 * @param {string} name - clave del ícono dentro de ICON
 * @param {string} [cls='w-4 h-4'] - clases CSS de tamaño para el SVG
 * @returns {HTMLElement} elemento svg
 */
function svg(name, cls = 'w-4 h-4') {
  return h('svg', {
    class: cls,
    fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8',
    viewBox: '0 0 24 24', 'aria-hidden': 'true',
    html: `<path stroke-linecap="round" stroke-linejoin="round" d="${ICON[name]}" />`,
  });
}

/**
 * Renderiza el compositor de mensajes de un ticket: textarea con contador de
 * caracteres, botón de adjuntar con drag & drop, cola de archivos pendientes y
 * botón de enviar que publica el comentario y sube los adjuntos a la API.
 * @param {Object} params - parámetros del compositor
 * @param {string|number} params.ticketId - id del ticket al que se envían mensajes/adjuntos
 * @param {Function} [params.onSent] - callback invocado por cada comentario o adjunto enviado
 * @param {boolean} [params.disabled=false] - deshabilita el textarea y los botones
 * @returns {HTMLElement} elemento div con el compositor completo
 */
export function chatComposer({ ticketId, onSent, disabled = false }) {
  const filesInput = h('input.hidden', { type: 'file', multiple: true, 'aria-label': 'Adjuntar archivos', onchange: (e) => addFiles(e.target.files) });
  const dropZone = h('div.relative.border.border-slate-200.rounded-lg.bg-white.transition', { 'data-composer': '' });
  const preview = h('div.hidden.px-3.py-2.border-b.border-slate-200.bg-slate-50.flex.flex-wrap.gap-2.text-xs', {});
  const counter = h('div.text-slate-500.px-1', { class: 'text-[10px]' }, '0/4000');
  const textarea = h('textarea.w-full.resize-none.px-3.py-2.rounded-md.text-sm.bg-transparent', {
    class: 'focus:outline-none',
    rows: '2',
    maxlength: '4000',
    placeholder: 'Escribe un mensaje… Presiona Enter para enviar y Shift+Enter para nueva línea',
    'aria-label': 'Mensaje',
    onkeydown: (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        send();
      }
    },
    oninput: () => { counter.textContent = `${textarea.value.length}/4000`; },
    disabled,
  });
  const sendBtn = h('button.btn.btn-primary.btn-sm.gap-1', { onclick: send, disabled, type: 'button' }, [
    h('span.send-icon', {}, [svg('send')]),
    h('span.send-label', {}, 'Enviar'),
  ]);

  const attachBtn = h('button.btn.btn-ghost.btn-sm', {
    onclick: () => filesInput.click(),
    title: 'Adjuntar archivo',
    'aria-label': 'Adjuntar archivo',
    type: 'button',
    disabled,
  }, [
    svg('attach'),
    h('span.hidden', { class: 'sm:inline' }, 'Adjuntar'),
  ]);

  const queue = [];
  const uploading = { current: 0, total: 0 };

  /**
   * Agrega archivos a la cola de adjuntos pendientes y refresca la previsualización.
   * @param {FileList|Array<File>} fileList - archivos a encolar
   * @returns {void}
   */
  function addFiles(fileList) {
    for (const f of fileList) queue.push(f);
    renderPreview();
  }
  /**
   * Quita un archivo de la cola de adjuntos por su índice y refresca la previsualización.
   * @param {number} i - índice del archivo dentro de la cola
   * @returns {void}
   */
  function removeAt(i) { queue.splice(i, 1); renderPreview(); }
  /**
   * Redibuja la previsualización de archivos adjuntos pendientes de envío.
   * @returns {void}
   */
  function renderPreview() {
    preview.innerHTML = '';
    if (queue.length === 0) { preview.classList.add('hidden'); return; }
    preview.classList.remove('hidden');
    queue.forEach((f, i) => {
      const tag = h('span.inline-flex.items-center.px-2.py-1.rounded-md.bg-white.border.border-slate-200', { class: 'gap-1.5' }, [
        h('span.text-slate-500.flex-none', {}, [svg(isImage(f.type) ? 'image' : 'file', 'w-3.5 h-3.5')]),
        h('span.font-medium.text-slate-700.truncate', { class: 'max-w-[160px]' }, f.name),
        h('span.text-slate-500', {}, `· ${fileSize(f.size)}`),
        h('button.text-slate-500.rounded', {
          class: 'hover:text-accent min-w-[24px] min-h-[24px]',
          onclick: () => removeAt(i),
          'aria-label': `Quitar ${f.name}`,
        }, '×'),
      ]);
      preview.appendChild(tag);
    });
  }

  /**
   * Activa o desactiva el resaltado visual de la zona de drop mientras se arrastran archivos.
   * @param {boolean} on - true para mostrar el resaltado
   * @returns {void}
   */
  function setDragVisual(on) {
    dropZone.classList.toggle('ring-2', on);
    dropZone.classList.toggle('ring-brand-ocean', on);
  }
  ;['dragenter', 'dragover'].forEach((ev) => dropZone.addEventListener(ev, (e) => { e.preventDefault(); e.stopPropagation(); setDragVisual(true); }));
  ;['dragleave', 'drop'].forEach((ev) => dropZone.addEventListener(ev, (e) => { e.preventDefault(); e.stopPropagation(); setDragVisual(false); }));
  dropZone.addEventListener('drop', (e) => addFiles(e.dataTransfer.files));

  /**
   * Actualiza el ícono y texto del botón de enviar según si hay un envío en curso.
   * @param {boolean} sending - true mientras se está enviando el mensaje/adjuntos
   * @returns {void}
   */
  function setSendingState(sending) {
    if (sending) {
      sendBtn.disabled = true;
      sendBtn.querySelector('.send-icon').innerHTML = `<svg class="w-4 h-4 animate-spin" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="${ICON.spinner}"/></svg>`;
      sendBtn.querySelector('.send-label').textContent = 'Enviando…';
    } else {
      sendBtn.disabled = disabled;
      sendBtn.querySelector('.send-icon').innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="${ICON.send}"/></svg>`;
      sendBtn.querySelector('.send-label').textContent = 'Enviar';
    }
  }

  /**
   * Envía el mensaje de texto (si hay) y sube los archivos en cola a la API,
   * notificando cada resultado mediante onSent y mostrando toasts de error si fallan.
   * @returns {Promise<void>}
   */
  async function send() {
    const text = textarea.value.trim();
    if (!text && queue.length === 0) return;
    if (disabled) return;
    setSendingState(true);
    try {
      if (text) {
        const { comment } = await api.tickets.comment(ticketId, { comment: text });
        onSent?.({ type: 'comment', data: comment });
        textarea.value = '';
        counter.textContent = '0/4000';
      }
      uploading.total = queue.length;
      uploading.current = 0;
      for (const file of [...queue]) {
        const fd = new FormData();
        fd.append('file', file);
        uploading.current++;
        try {
          const { attachment } = await api.tickets.upload(ticketId, fd);
          onSent?.({ type: 'attachment', data: attachment });
          const i = queue.indexOf(file);
          if (i >= 0) queue.splice(i, 1);
          renderPreview();
        } catch (e) {
          toast(`Error al subir ${file.name}: ${e.message}`, 'error');
        }
      }
      queue.length = 0;
      renderPreview();
    } catch (e) {
      toast(e.message || 'Error al enviar', 'error');
    } finally {
      setSendingState(false);
    }
  }

  const footer = h('div.flex.items-center.justify-between.px-2.py-1.border-t.border-slate-100.bg-slate-50.rounded-b-lg', {}, [
    h('div.flex.items-center.gap-1', {}, [attachBtn, filesInput, counter]),
    h('div', {}, [sendBtn]),
  ]);

  dropZone.appendChild(preview);
  dropZone.appendChild(textarea);
  dropZone.appendChild(footer);

  return dropZone;
}

