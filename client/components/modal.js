import { h } from '../utils/dom.js';

export function openModal({ title, body, actions, onClose, size = 'md' }) {
  const root = document.getElementById('modal-root');
  if (!root) return;

  const widths = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };

  const cleanup = () => {
    if (root.firstElementChild) root.firstElementChild.remove();
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => { if (e.key === 'Escape') { cleanup(); onClose?.(); } };

  const modal = h('div.fixed.inset-0.z-40.flex.items-center.justify-center.p-4', {
    onclick: (e) => { if (e.target === modal) { cleanup(); onClose?.(); } },
  }, [
    h('div.absolute.inset-0.bg-slate-900\\/50'),
    h(`div.relative.bg-white.rounded-lg.shadow-xl.w-full.${widths[size] || widths.md}.max-h-[90vh].flex.flex-col`, {}, [
      h('div.flex.items-center.justify-between.px-5.py-3.border-b.border-slate-200', {}, [
        (() => {
          const t = h('h3.text-base.font-semibold.text-slate-800');
          // textContent seguro (NUNCA html: title — previene XSS)
          t.textContent = typeof title === 'string' ? title : '';
          return t;
        })(),
        h('button.text-slate-500.hover\\:text-slate-800.min-w-[44px].min-h-[44px].flex.items-center.justify-center.rounded', {
          onclick: () => { cleanup(); onClose?.(); },
          'aria-label': 'Cerrar',
        }, '×'),
      ]),
      h('div.p-5.overflow-y-auto', {}, body || ''),
      actions ? h('div.flex.justify-end.gap-2.px-5.py-3.border-t.border-slate-200.bg-slate-50.rounded-b-lg', {}, actions(cleanup)) : null,
    ]),
  ]);

  root.appendChild(modal);
  return { modal, cleanup };
}

export function confirmModal({ title = 'Confirmar', message, confirmText = 'Confirmar', cancelText = 'Cancelar', danger = false, onConfirm }) {
  let modal;
  const body = h('p.text-sm.text-slate-600');
  // message es HTML controlado por el código (no viene del usuario),
  // por seguridad usamos textContent + marcado manual cuando hace falta
  if (typeof message === 'string' && /<\/?\w+/.test(message)) {
    body.innerHTML = message;
  } else {
    body.textContent = String(message || '');
  }
  const actions = (close) => [
    h('button.btn.btn-secondary', { onclick: close }, cancelText),
    h('button', { class: danger ? 'btn btn-danger' : 'btn btn-primary', onclick: async () => { close(); await onConfirm?.(); } }, confirmText),
  ];
  modal = openModal({ title, body, actions });
  return modal;
}
