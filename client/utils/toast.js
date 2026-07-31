/* Documentado por: Miguel Flores */
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

/**
 * Muestra una notificación toast flotante en el contenedor #toast-root, con auto-cierre por timeout.
 * @param {string} message - texto a mostrar en la notificación
 * @param {string} [type] - tipo visual: 'success', 'error', 'info' o 'warn'
 * @param {number} [timeout] - milisegundos antes de auto-cerrar la notificación
 * @returns {void}
 */
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
    h('button.flex.items-center.justify-center.rounded', {
      class: 'text-white/80 hover:text-white min-w-[44px] min-h-[44px]',
      onclick: () => remove(id),
      'aria-label': 'Cerrar notificación',
    }, '×'),
  ]);
  el.dataset.id = id;
  root.appendChild(el);
  setTimeout(() => remove(id), timeout);
}

/**
 * Anima y elimina del DOM el toast identificado por id.
 * @param {number} id - identificador interno del toast a remover
 * @returns {void}
 */
function remove(id) {
  const root = TOAST_ROOT();
  if (!root) return;
  const el = root.querySelector(`[data-id="${id}"]`);
  if (el) {
    el.classList.add('opacity-0', 'translate-y-[-4px]', 'transition');
    setTimeout(() => el.remove(), 200);
  }
}

