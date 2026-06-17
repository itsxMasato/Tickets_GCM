import { h } from '../utils/dom.js';
import { renderSidebar } from './sidebar.js';
import { renderTopbar } from './topbar.js';

let backdropEl = null;

function closeMobileSidebar() {
  document.body.classList.remove('gcm-sidebar-open');
  if (backdropEl) { backdropEl.remove(); backdropEl = null; }
}

function openMobileSidebar() {
  document.body.classList.add('gcm-sidebar-open');
  if (!backdropEl) {
    backdropEl = document.createElement('div');
    backdropEl.className = 'fixed inset-0 bg-brand/40 z-30 md:hidden gcm-sidebar-backdrop';
    backdropEl.addEventListener('click', closeMobileSidebar);
    document.body.appendChild(backdropEl);
  }
}

export function renderLayout({ content, user, onLogout }) {
  // El sidebar recibe onLogout (incluye el botón de cerrar sesión en el pie)
  const sidebar = renderSidebar({ user, onLogout });

  const wrapper = h('div.flex.h-full.bg-surface', {}, [
    // Sidebar fija en md+, deslizable en móvil
    h('div.gcm-sidebar', {}, [sidebar]),
    // Columna principal
    h('div.flex-1.flex.flex-col.min-w-0', {}, [
      renderTopbar({ user, onLogout }),
      h('main.flex-1.overflow-y-auto', {}, [
        h('div.max-w-7xl.mx-auto.w-full.p-4.md\\:p-6', {}, [content]),
      ]),
    ]),
  ]);

  // Listeners de this layout que se limpian al desmontar
  const onToggleSidebar = () => {
    if (document.body.classList.contains('gcm-sidebar-open')) closeMobileSidebar();
    else openMobileSidebar();
  };
  const onHashChange = closeMobileSidebar;
  const onResize = () => {
    if (window.innerWidth >= 768) closeMobileSidebar();
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('gcm:toggle-sidebar', onToggleSidebar);
    window.addEventListener('hashchange', onHashChange);
    window.addEventListener('resize', onResize);
  }

  // Cleanup: remover listeners de este layout
  wrapper._gcmLayoutCleanup = () => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('gcm:toggle-sidebar', onToggleSidebar);
      window.removeEventListener('hashchange', onHashChange);
      window.removeEventListener('resize', onResize);
    }
  };

  return wrapper;
}
