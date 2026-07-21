/* Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. */
import { h } from './dom.js';

const TOAST_ROOT = () => document.getElementById('toast-root');

let counter = 0;
const ICONS = {
  success: '✓',
  error:   '✕',
  info:    'i',
  warn:    '!',
};
const COLORS = {
  success: 'bg-emerald-600 text-white',
  error:   'bg-red-600 text-white',
  info:    'bg-brand text-white',
  warn:    'bg-amber-500 text-white',
};

export function toast(message, type = 'info', timeout = 4000) {
  const root = TOAST_ROOT();
  if (!root) return;
  const id = ++counter;
  const msg = h('span.flex-1');
  msg.textContent = String(message ?? '');
  const el = h('div.toast', {
    class: ['pointer-events-auto flex items-center gap-2 px-4 py-2.5 rounded-md shadow-lg text-sm', COLORS[type] || COLORS.info],
    role: 'status',
    'aria-live': 'polite',
    'aria-atomic': 'true',
  }, [
    h('span.font-bold', ICONS[type] || 'i'),
    msg,
    h('button.text-white\\/80.hover\\:text-white.min-w-\\[44px\\].min-h-\\[44px\\].flex.items-center.justify-center.rounded', {
      onclick: () => remove(id),
      'aria-label': 'Cerrar notificación',
    }, '×'),
  ]);
  el.dataset.id = id;
  root.appendChild(el);
  setTimeout(() => remove(id), timeout);
}

function remove(id) {
  const root = TOAST_ROOT();
  if (!root) return;
  const el = root.querySelector(`[data-id="${id}"]`);
  if (el) {
    el.classList.add('opacity-0', 'translate-y-[-4px]', 'transition');
    setTimeout(() => el.remove(), 200);
  }
}
