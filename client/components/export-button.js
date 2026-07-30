/* Documentado por: Miguel Flores */
import { h } from '../utils/dom.js';
import { ICON } from '../utils/icons.js';

function svg(path, cls = 'w-4 h-4') {
  return h('svg', {
    class: cls,
    fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8',
    viewBox: '0 0 24 24', 'aria-hidden': 'true',
    html: `<path stroke-linecap="round" stroke-linejoin="round" d="${path}" />`,
  });
}

export function exportButton(
  {
    label = 'Exportar',
    kind = 'secondary',
    onExport,
  } = {}
) {
  const cls = kind === 'primary' ? 'btn-primary' : kind === 'ghost' ? 'btn-ghost' : 'btn-secondary';

  const menu = h('div.absolute.right-0.top-full.mt-2.w-48.bg-white.rounded-xl.shadow-pop.border.border-surface-border.py-1.hidden.z-40.overflow-hidden', {
    role: 'menu',
    'aria-label': `Formato para ${label.toLowerCase()}`,
  }, [
    h('button.flex.items-center.w-full.px-3.py-2.text-sm.text-left.text-brand-ink.gap-2', {
      class: 'hover:bg-surface',
      role: 'menuitem',
      type: 'button',
      onclick: () => { closeMenu(); onExport?.('excel'); },
    }, [svg(ICON.report || ICON.download, 'w-4 h-4 text-emerald-600'), h('span', {}, 'Excel (.xlsx)')]),
    h('button.flex.items-center.w-full.px-3.py-2.text-sm.text-left.text-brand-ink.gap-2', {
      class: 'hover:bg-surface',
      role: 'menuitem',
      type: 'button',
      onclick: () => { closeMenu(); onExport?.('pdf'); },
    }, [svg(ICON.download, 'w-4 h-4 text-accent'), h('span', {}, 'PDF (.pdf)')]),
  ]);

  const trigger = h(`button.btn.${cls}`, {
    class: 'gap-1.5',
    type: 'button',
    onclick: (e) => { e.stopPropagation(); toggleMenu(); },
    'aria-haspopup': 'menu',
    'aria-expanded': 'false',
    'aria-label': label,
    title: label,
  }, [
    svg(ICON.download, 'w-4 h-4'),
    h('span.hidden', { class: 'sm:inline' }, label),
    svg('M19 9l-7 7-7-7', 'w-3.5 h-3.5'),
  ]);

  const root = h('div.relative.inline-block', {}, [trigger, menu]);

  function isOpen() { return !menu.classList.contains('hidden'); }
  function openMenu() { menu.classList.remove('hidden'); trigger.setAttribute('aria-expanded', 'true'); }
  function closeMenu() { menu.classList.add('hidden'); trigger.setAttribute('aria-expanded', 'false'); }
  function toggleMenu() { isOpen() ? closeMenu() : openMenu(); }

  const onDocClick = () => { if (isOpen()) closeMenu(); };
  const onKey = (e) => { if (e.key === 'Escape' && isOpen()) closeMenu(); };
  document.addEventListener('click', onDocClick, { capture: true });
  document.addEventListener('keydown', onKey);

  root._exportButtonCleanup = () => {
    document.removeEventListener('click', onDocClick, { capture: true });
    document.removeEventListener('keydown', onKey);
  };

  Object.defineProperty(root, 'disabled', {
    get() { return trigger.disabled; },
    set(v) { trigger.disabled = v; trigger.classList.toggle('opacity-60', v); trigger.classList.toggle('cursor-not-allowed', v); },
  });
  root.setLabel = (text) => {
    const span = trigger.querySelector('span');
    if (span) span.textContent = text;
  };

  return root;
}

export default exportButton;

