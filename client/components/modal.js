/* Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. */
import { h } from '../utils/dom.js';

// Selector de elementos focusables dentro del modal (excluye disabled y tabindex=-1).
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Abre un modal accesible.
 * - role="dialog" + aria-modal="true" para que screen readers lo anuncien.
 * - Foco inicial: primer focusable del body; si no hay, el contenedor.
 * - Focus trap: Tab/Shift+Tab cicla dentro del modal.
 * - Esc: cierra (vía onClose).
 * - Click en el backdrop: cierra.
 * - Al cerrar, restaura el foco al elemento que estaba activo antes de abrir.
 */
export function openModal({ title, body, actions, onClose, size = 'md' }) {
  const root = document.getElementById('modal-root');
  if (!root) return;

  const widths = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };

  // Guarda de foco: el elemento que tenía foco antes de abrir el modal.
  // Si es null (p.ej. click desde el body sin foco explícito), no restauramos.
  const previouslyFocused = document.activeElement instanceof Element
    ? document.activeElement
    : null;

  const getFocusable = () => {
    if (!modalContent) return [];
    return Array.from(modalContent.querySelectorAll(FOCUSABLE_SELECTOR))
      .filter((el) => el.offsetParent !== null || el === document.activeElement);
  };

  let modalContent = null;
  const cleanup = () => {
    if (root.firstElementChild) root.firstElementChild.remove();
    document.removeEventListener('keydown', onKey, true);
    // Restaurar foco: primero al guard, fallback al body.
    if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
      try { previouslyFocused.focus(); } catch { /* elemento desmontado: aceptamos */ }
    }
  };

  const onKey = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      cleanup();
      onClose?.();
      return;
    }
    if (e.key === 'Tab') {
      // Focus trap: si Tab sale del modal, vuelve al primero; Shift+Tab, al último.
      const focusable = getFocusable();
      if (focusable.length === 0) {
        e.preventDefault();
        modalContent?.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  // Fullscreen en mobile: en viewports < 640px el modal ocupa toda la
  // pantalla. La CSS ya define .gcm-modal-fullscreen con position:fixed,
  // inset:0, height:100dvh y border-radius:0 — sólo necesitamos aplicar
  // la clase. Se evalúa al abrir (no al resize) porque abrir/cerrar es
  // un evento discreto; si el usuario rota el dispositivo, el modal ya
  // está anclado a sus dimensiones y no queremos repaint a mitad de uso.
  const isMobileViewport = typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(max-width: 639.95px)').matches;
  const fullscreenClass = isMobileViewport ? '.gcm-modal-fullscreen' : '';

  const modal = h('div.fixed.inset-0.z-40.flex.items-center.justify-center.p-4', {
    onclick: (e) => { if (e.target === modal) { cleanup(); onClose?.(); } },
  }, [
    h('div.absolute.inset-0.bg-slate-900\\/50'),
    modalContent = h(`div.relative.bg-white.rounded-lg.shadow-xl.w-full.${widths[size] || widths.md}.max-h-[90vh].flex.flex-col.focus\\:outline-none${fullscreenClass}`, {
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': 'gcm-modal-title',
      tabindex: '-1',
    }, [
      h('div.gcm-modal-header.flex.items-center.justify-between.px-5.py-3.border-b.border-slate-200', {}, [
        (() => {
          const t = h('h3#gcm-modal-title.text-base.font-semibold.text-slate-800');
          // textContent seguro (NUNCA html: title — previene XSS)
          t.textContent = typeof title === 'string' ? title : '';
          return t;
        })(),
        h('button.text-slate-500.hover\\:text-slate-800.min-w-[44px].min-h-[44px].flex.items-center.justify-center.rounded.focus\\:outline-none.focus\\:ring-2.focus\\:ring-brand-ocean\\/60', {
          onclick: () => { cleanup(); onClose?.(); },
          'aria-label': 'Cerrar',
          type: 'button',
        }, '×'),
      ]),
      h('div.gcm-modal-body.p-5.overflow-y-auto', {}, body || ''),
      actions ? h('div.gcm-modal-footer.flex.justify-end.gap-2.px-5.py-3.border-t.border-slate-200.bg-slate-50.rounded-b-lg', {}, actions(cleanup)) : null,
    ]),
  ]);

  root.appendChild(modal);
  document.addEventListener('keydown', onKey, true);

  // Foco inicial: primer focusable del modal; si no hay, el contenedor (tabindex=-1).
  // Usamos requestAnimationFrame para que el browser haya aplicado el DOM antes.
  requestAnimationFrame(() => {
    const focusable = getFocusable();
    if (focusable.length > 0) {
      focusable[0].focus();
    } else if (modalContent) {
      modalContent.focus();
    }
  });

  return { modal, cleanup };
}

export function confirmModal({ title = 'Confirmar', message, confirmText = 'Confirmar', cancelText = 'Cancelar', danger = false, onConfirm }) {
  let modal;
  const header = h('div.flex.items-center.gap-3.mb-4', {}, [
    h('div.w-11.h-11.rounded-2xl.bg-brand-ocean\/10.text-brand-ocean.grid.place-items-center', {}, h('span.material-symbols-outlined.text-lg', {}, 'verified_user')),
    h('div', {}, [
      h('p.text-base.font-semibold.text-slate-900', {}, title),
      h('p.text-sm.text-slate-500', {}, 'Confirma esta acción para continuar.'),
    ]),
  ]);
  const body = h('div.flex.flex-col.gap-4', {}, [
    header,
    h('p.text-sm.text-slate-600', {}, String(message || '')),
  ]);
  // message es HTML controlado por el código (no viene del usuario),
  // por seguridad usamos textContent + marcado manual cuando hace falta
  if (typeof message === 'string' && /<\/?\w+/.test(message)) {
    body.lastChild.innerHTML = message;
  }
  const actions = (close) => [
    h('button.btn.btn-secondary', { onclick: close, type: 'button' }, cancelText),
    h('button', { class: danger ? 'btn btn-accent' : 'btn btn-primary', onclick: async () => { close(); await onConfirm?.(); }, type: 'button' }, confirmText),
  ];
  modal = openModal({ title, body, actions });
  return modal;
}

export function passwordConfirmModal({
  title = 'Confirmar acción',
  message = 'Ingresa tu contraseña para continuar.',
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  danger = false,
  onConfirm,
}) {
  let modal;
  let confirmButton;
  let closeModal;
  let resolvePromise;
  let rejectPromise;

  const error = h('div.hidden.text-sm.text-red-600', {});
  const passwordInput = h('input.input', {
    type: 'password',
    autocomplete: 'current-password',
    placeholder: 'Contraseña',
  });
  const brand = h('div.flex.items-center.gap-3.mb-4', {}, [
    h('img.w-12.h-12.rounded-3xl.shadow-soft.border.border-surface-border', {
      src: '/img/Logo.png',
      alt: 'Logo GCM',
      loading: 'eager',
      decoding: 'async',
    }),
    h('div', {}, [
      h('p.text-base.font-semibold.text-slate-900', {}, title),
      h('p.text-sm.text-slate-500', {}, 'Autentica esta operación con tu contraseña.'),
    ]),
  ]);
  const body = h('div.flex.flex-col.gap-4', {}, [
    brand,
    h('p.text-sm.text-slate-600', {}, String(message)),
    passwordInput,
    error,
    h('p.text-xs.text-slate-500', {}, 'Esta acción quedará registrada en el historial de seguridad de su cuenta.'),
  ]);

  const actions = (close) => {
    closeModal = close;
    return [
      h('button.btn.btn-secondary', {
        onclick: () => {
          close();
          if (!settled) {
            settled = true;
            resolvePromise(false);
          }
        },
        type: 'button',
      }, cancelText),
      confirmButton = h('button', {
        class: danger ? 'btn btn-accent' : 'btn btn-primary',
        type: 'button',
      }, confirmText),
    ];
  };

  let settled = false;
  const promise = new Promise((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });

  modal = openModal({
    title,
    body,
    actions,
    size: 'sm',
    onClose: () => {
      if (!settled) {
        settled = true;
        resolvePromise(false);
      }
    },
  });

  confirmButton.addEventListener('click', async () => {
    const value = passwordInput.value.trim();
    if (!value) {
      error.textContent = 'Debes ingresar tu contraseña.';
      error.classList.remove('hidden');
      passwordInput.focus();
      return;
    }

    confirmButton.disabled = true;
    const originalText = confirmButton.textContent;
    confirmButton.textContent = 'Verificando…';
    error.classList.add('hidden');

    try {
      await onConfirm?.(value);
      settled = true;
      closeModal?.();
      resolvePromise(true);
    } catch (err) {
      error.textContent = err?.message || 'Contraseña incorrecta.';
      error.classList.remove('hidden');
      passwordInput.focus();
      confirmButton.disabled = false;
      confirmButton.textContent = originalText;
    }
  });

  return promise;
}
