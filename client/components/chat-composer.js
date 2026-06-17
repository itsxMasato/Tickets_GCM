import { h, escapeHtml } from '../utils/dom.js';
import { api } from '../api.js';
import { toast } from '../utils/toast.js';
import { isImage, fileSize } from '../utils/format.js';
import { ICON } from '../utils/icons.js';
function svg(name, cls = 'w-4 h-4') {
  return h(`svg.${cls}`, {
    fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8',
    viewBox: '0 0 24 24', 'aria-hidden': 'true',
    html: `<path stroke-linecap="round" stroke-linejoin="round" d="${ICON[name]}" />`,
  });
}

export function chatComposer({ ticketId, onSent, disabled = false }) {
  const filesInput = h('input.hidden', { type: 'file', multiple: true, 'aria-label': 'Adjuntar archivos', onchange: (e) => addFiles(e.target.files) });
  const dropZone = h('div.relative.border.border-slate-200.rounded-lg.bg-white.transition', { 'data-composer': '' });
  const preview = h('div.hidden.px-3.py-2.border-b.border-slate-200.bg-slate-50.flex.flex-wrap.gap-2.text-xs', {});
  const counter = h('div.text-\\[10px\\].text-slate-400.px-1', {}, '0/4000');
  const textarea = h('textarea.w-full.resize-none.px-3.py-2.rounded-md.focus\\:outline-none.text-sm.bg-transparent', {
    rows: '2',
    maxlength: '4000',
    placeholder: 'Escribe un mensaje… (Enter para enviar, Shift+Enter para nueva línea)',
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
    h('span.hidden.sm\\:inline', {}, 'Adjuntar'),
  ]);

  const queue = [];
  const uploading = { current: 0, total: 0 };

  function addFiles(fileList) {
    for (const f of fileList) queue.push(f);
    renderPreview();
  }
  function removeAt(i) { queue.splice(i, 1); renderPreview(); }
  function renderPreview() {
    preview.innerHTML = '';
    if (queue.length === 0) { preview.classList.add('hidden'); return; }
    preview.classList.remove('hidden');
    queue.forEach((f, i) => {
      const tag = h('span.inline-flex.items-center.gap-1\\.5.px-2.py-1.rounded-md.bg-white.border.border-slate-200', {}, [
        h('span.text-slate-500.flex-none', {}, [svg(isImage(f.type) ? 'image' : 'file', 'w-3.5 h-3.5')]),
        h('span.font-medium.text-slate-700.max-w-\\[160px\\].truncate', {}, f.name),
        h('span.text-slate-500', {}, `· ${fileSize(f.size)}`),
        h('button.text-slate-400.hover\\:text-accent.min-w-\\[24px\\].min-h-\\[24px\\].rounded', {
          onclick: () => removeAt(i),
          'aria-label': `Quitar ${f.name}`,
        }, '×'),
      ]);
      preview.appendChild(tag);
    });
  }

  // Drag & drop
  function setDragVisual(on) {
    dropZone.classList.toggle('ring-2', on);
    dropZone.classList.toggle('ring-brand-ocean', on);
  }
  ;['dragenter', 'dragover'].forEach((ev) => dropZone.addEventListener(ev, (e) => { e.preventDefault(); e.stopPropagation(); setDragVisual(true); }));
  ;['dragleave', 'drop'].forEach((ev) => dropZone.addEventListener(ev, (e) => { e.preventDefault(); e.stopPropagation(); setDragVisual(false); }));
  dropZone.addEventListener('drop', (e) => addFiles(e.dataTransfer.files));

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
