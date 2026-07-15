import { h } from '../utils/dom.js';
import { renderSidebar } from './sidebar.js';
import { renderTopbar } from './topbar.js';

const STORAGE_KEY = 'gcm.sidebarCollapsed';

function readCollapsedPref() {
  try { return localStorage.getItem(STORAGE_KEY) === '1'; }
  catch { return false; }
}
function writeCollapsedPref(collapsed) {
  try { localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0'); }
  catch { /* storage bloqueado: aceptamos el no-persistir */ }
}

function isMobileViewport() {
  return window.matchMedia('(max-width: 767.95px)').matches;
}

function applyCollapsed(collapsed) {
  document.body.classList.toggle('gcm-sidebar-collapsed', !!collapsed);
  // Si el topbar se re-renderiza con el botón toggle, el ícono debe
  // reflejar el estado actual del DOM. Disparamos un evento para que el
  // topbar actualice su botón sin esperar al próximo render.
  window.dispatchEvent(new CustomEvent('gcm:sidebar-state-changed', {
    detail: { collapsed: !!collapsed },
  }));
}

function applyMobileOpen(open) {
  document.body.classList.toggle('gcm-sidebar-open', !!open);
}

function closeMobileSidebar() {
  applyMobileOpen(false);
}

export function renderLayout({ content, user, onLogout }) {
  // Estado inicial: desktop abierto (empujando); mobile ABIERTO por defecto
  // también — el usuario pidió explícitamente que el sidebar sea visible al
  // cargar la app. El colapso (mini-rail) sólo aplica en desktop cuando el
  // usuario lo haya preferido (persiste en localStorage).
  const isMobile = isMobileViewport();
  if (!isMobile) {
    applyCollapsed(readCollapsedPref());
  } else {
    // En mobile forzamos abierto al cargar y limpiamos el estado colapsado
    // para que un resize a desktop no herede el colapso accidental.
    applyCollapsed(false);
    applyMobileOpen(true);
  }

  // Sidebar: en mobile empuja al main (transform translateX), en desktop
  // vive como columna flex fija. La función onClose la pasa el sidebar para
  // que un click en link cierre el drawer antes de navegar.
  const sidebar = renderSidebar({
    user,
    onClose: () => { if (isMobileViewport()) closeMobileSidebar(); },
  });

  const wrapper = h('div.gcm-shell.flex.h-full.bg-surface', {}, [
    h('div.gcm-sidebar', {}, [sidebar]),
    h('div.gcm-main.flex-1.flex.flex-col.min-w-0', {}, [
      renderTopbar({ user, onLogout }),
      h('main.flex-1.overflow-y-auto', {}, [
        h('div.max-w-7xl.mx-auto.w-full.p-4.md\\:p-6', {}, [content]),
      ]),
    ]),
  ]);

  // ── Comportamiento del toggle ────────────────────────────────────────────
  // Mobile: togglea estado abierto/cerrado (push — el main se reacomoda).
  // Desktop: alterna estado colapsado (mini-rail 64px). El main se REACOMODA
  //          porque la columna del sidebar cambia de ancho; el contenido se
  //          "empuja" naturalmente. Persiste en localStorage.
  const onToggleSidebar = () => {
    if (isMobileViewport()) {
      const open = !document.body.classList.contains('gcm-sidebar-open');
      applyMobileOpen(open);
    } else {
      const next = !document.body.classList.contains('gcm-sidebar-collapsed');
      applyCollapsed(next);
      writeCollapsedPref(next);
    }
  };

  // Esc cierra el sidebar mobile (push). No cerrar si hay un modal abierto.
  const onKeydown = (e) => {
    if (e.key !== 'Escape') return;
    if (!isMobileViewport()) return;
    if (!document.body.classList.contains('gcm-sidebar-open')) return;
    if (document.querySelector('[role="dialog"]')) return;
    e.stopPropagation();
    closeMobileSidebar();
  };

  // Resize: si cruzamos a desktop, descartamos el "open" mobile y aplicamos
  // la preferencia persistida. Si cruzamos a mobile, dejamos el sidebar como
  // esté (no forzamos — respetamos al usuario).
  const onResize = () => {
    const mobile = isMobileViewport();
    if (!mobile) {
      // Cruzamos a desktop: limpiamos el estado mobile y aplicamos el colapsado
      // persistido. Por defecto = abierto.
      applyMobileOpen(false);
      applyCollapsed(readCollapsedPref());
    }
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('gcm:toggle-sidebar', onToggleSidebar);
    window.addEventListener('resize', onResize);
    window.addEventListener('keydown', onKeydown);
  }

  // Cleanup: remover listeners de este layout y de sus componentes hijos
  // (sidebar, topbar) que expongan _gcmCleanup. Esto evita que las
  // suscripciones a eventos (gcm:role_label_updated, gcm:realtime, etc.)
  // se acumulen en cada navegación.
  const childCleanups = [sidebar, ...wrapper.querySelectorAll('[data-gcm-cleanup]')]
    .map((el) => (el && typeof el._gcmCleanup === 'function') ? el._gcmCleanup : null)
    .filter(Boolean);
  wrapper._gcmLayoutCleanup = () => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('gcm:toggle-sidebar', onToggleSidebar);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', onKeydown);
    }
    for (const fn of childCleanups) {
      try { fn(); } catch (e) { console.warn('[layout] child cleanup error', e); }
    }
  };

  return wrapper;
}
