/* Documentado por: Miguel Flores */
import { h } from '../utils/dom.js';
import { svg, ICON } from '../utils/icons.js';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function openModal({ title, body, actions, onClose, size = 'md' }) {
  const root = document.getElementById('modal-root');
  if (!root) return;

  const widths = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };

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
    if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
      try { previouslyFocused.focus(); } catch {}
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

  const isMobileViewport = typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(max-width: 639.95px)').matches;
  const fullscreenClass = isMobileViewport ? '.gcm-modal-fullscreen' : '';

  const modal = h('div.fixed.inset-0.z-40.flex.items-center.justify-center.p-4', {
    onclick: (e) => { if (e.target === modal) { cleanup(); onClose?.(); } },
  }, [
    h('div.absolute.inset-0.gcm-modal-overlay', {}),
    modalContent = h(`div.relative.bg-white.rounded-xl.shadow-strong.w-full.${widths[size] || widths.md}.flex.flex-col${fullscreenClass}`, {
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': 'gcm-modal-title',
      tabindex: '-1',
      class: 'focus:outline-none max-h-[90vh]',
    }, [
      h('div.gcm-modal-header.flex.items-center.justify-between.px-5.py-3.border-b.border-surface-border', {}, [
        (() => {
          const t = h('h3#gcm-modal-title.text-base.font-semibold.text-brand-ink');
          t.textContent = typeof title === 'string' ? title : '';
          return t;
        })(),
        h('button.flex.items-center.justify-center.rounded-full', {
          class: 'min-w-[44px] min-h-[44px] text-slate-500 hover:text-brand-ink hover:bg-surface focus:outline-none focus:ring-2 focus:ring-brand-ocean/60',
          onclick: () => { cleanup(); onClose?.(); },
          'aria-label': 'Cerrar',
          type: 'button',
        }, [svg(h, ICON.close, 'w-4 h-4')]),
      ]),
      h('div.gcm-modal-body.p-5.overflow-y-auto', {}, body || ''),
      actions ? h('div.gcm-modal-footer.flex.justify-end.gap-2.px-5.py-3.border-t.border-surface-border.bg-surface.rounded-b-xl', {}, actions(cleanup)) : null,
    ]),
  ]);

  root.appendChild(modal);
  document.addEventListener('keydown', onKey, true);

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
  const tone = danger ? 'bg-accent/10 text-accent' : 'bg-brand-ocean/10 text-brand-ocean';
  const body = h('div.flex.flex-col.items-center.text-center.gap-3.py-1', {}, [
    h('div.w-16.h-16.rounded-full.grid.place-items-center.flex-none', { class: tone }, [svg(h, danger ? ICON.alert : ICON.shield, 'w-7 h-7')]),
    h('p.text-sm.text-slate-600', { class: 'max-w-[38ch]' }, String(message || '')),
  ]);
  if (typeof message === 'string' && /<\/?\w+/.test(message)) {
    body.lastChild.innerHTML = message;
  }
  const actions = (close) => [
    h('button.btn.btn-secondary.flex-1', { onclick: close, type: 'button' }, cancelText),
    h('button.flex-1', { class: danger ? 'btn btn-accent' : 'btn btn-primary', onclick: async () => { close(); await onConfirm?.(); }, type: 'button' }, confirmText),
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

  const error = h('div.hidden.text-sm.text-red-600.items-center', { class: 'flex gap-1.5' });
  const passwordInput = h('input.input.pr-11', {
    type: 'password',
    autocomplete: 'current-password',
    placeholder: 'Contraseña',
  });
  const toggleVisibility = h('button', {
    type: 'button',
    class: 'absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-brand-ink rounded p-1 focus:outline-none focus:ring-2 focus:ring-brand-ocean/60',
    'aria-label': 'Mostrar contraseña',
  }, [svg(h, ICON.eye, 'w-4 h-4')]);
  toggleVisibility.addEventListener('click', () => {
    const visible = passwordInput.type === 'text';
    passwordInput.type = visible ? 'password' : 'text';
    toggleVisibility.setAttribute('aria-label', visible ? 'Mostrar contraseña' : 'Ocultar contraseña');
    toggleVisibility.innerHTML = '';
    toggleVisibility.appendChild(svg(h, visible ? ICON.eye : ICON.eyeOff, 'w-4 h-4'));
  });
  const passwordWrap = h('div.relative', {}, [passwordInput, toggleVisibility]);
  const brand = h('div.flex.flex-col.items-center.text-center.gap-2', {}, [
    h('img.w-14.h-14.rounded-2xl.shadow-soft.border.border-surface-border', {
      src: '/img/Logo.png',
      alt: 'Logo GCM',
      loading: 'eager',
      decoding: 'async',
    }),
    h('div', {}, [
      h('p.text-base.font-semibold.text-brand-ink', {}, title),
      h('p.text-sm.text-slate-500', {}, 'Autentica esta operación con tu contraseña.'),
    ]),
  ]);
  const body = h('div.flex.flex-col.gap-4', {}, [
    brand,
    h('p.text-sm.text-slate-600.text-center', {}, String(message)),
    passwordWrap,
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

  const showError = (msg) => {
    error.innerHTML = '';
    error.appendChild(svg(h, ICON.alert, 'w-3.5 h-3.5 flex-none'));
    error.appendChild(h('span', {}, msg));
    error.classList.remove('hidden');
  };

  confirmButton.addEventListener('click', async () => {
    const value = passwordInput.value.trim();
    if (!value) {
      showError('Debes ingresar tu contraseña.');
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
      showError(err?.message || 'Contraseña incorrecta.');
      passwordInput.focus();
      confirmButton.disabled = false;
      confirmButton.textContent = originalText;
    }
  });

  return promise;
}

