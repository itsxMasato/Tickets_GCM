/* Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. */
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
  syncScrim();
}

function closeMobileSidebar() {
  applyMobileOpen(false);
}

// Crea/elimina el scrim del sidebar mobile. Se llama en cada cambio de estado
// (boot, toggle, resize, click en link). En desktop el scrim no debe existir:
// la regla CSS lo oculta con display:none, pero igual lo removemos del DOM
// para no acumular nodos si el usuario rota el viewport.
function syncScrim() {
  if (typeof document === 'undefined') return;
  const existing = document.getElementById('gcm-sidebar-scrim');
  const mobile = isMobileViewport();
  const open = document.body.classList.contains('gcm-sidebar-open');
  if (mobile && open) {
    if (existing) return;
    const scrim = document.createElement('div');
    scrim.id = 'gcm-sidebar-scrim';
    scrim.className = 'gcm-sidebar-scrim';
    scrim.setAttribute('aria-hidden', 'true');
    scrim.addEventListener('click', closeMobileSidebar);
    document.body.appendChild(scrim);
    // Forzar reflow antes de la clase para que la transición de opacity corra.
    requestAnimationFrame(() => scrim.classList.add('gcm-scrim-visible'));
    return;
  }
  if (!existing) return;
  existing.classList.remove('gcm-scrim-visible');
  // Esperar la transición antes de remover (160ms coincide con el CSS).
  setTimeout(() => {
    // Re-verificar: puede que el usuario haya reabierto el sidebar durante
    // la transición. En ese caso, conservamos el nodo.
    if (existing.parentNode && !document.body.classList.contains('gcm-sidebar-open')) {
      existing.remove();
    }
  }, 200);
}

export function renderLayout({ content, user, onLogout }) {
  // Estado inicial:
  // - Desktop: columna fija; abierto por defecto, respeta preferencia de
  //   colapso persistida en localStorage.
  // - Mobile: CERRADO. El toggle hamburguesa del topbar es el único punto
  //   de entrada. Patrón clásico de drawer modal con scrim.
  const isMobile = isMobileViewport();
  if (!isMobile) {
    applyCollapsed(readCollapsedPref());
  } else {
    // En mobile forzamos cerrado al cargar y limpiamos el estado colapsado
    // para que un resize a desktop no herede el colapso accidental.
    applyCollapsed(false);
    applyMobileOpen(false);
  }

  // Sidebar: en mobile es un drawer overlay con scrim; en desktop vive como
  // columna flex fija del flujo. La función onClose la pasa el sidebar para
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
  // Mobile: togglea estado abierto/cerrado del drawer overlay. Al abrir se
  //          crea el scrim; al cerrar se desvanece y se remueve.
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

  // Esc cierra el sidebar mobile (drawer overlay). No cerrar si hay un modal
  // abierto encima (otro [role="dialog"] ya en pantalla).
  const onKeydown = (e) => {
    if (e.key !== 'Escape') return;
    if (!isMobileViewport()) return;
    if (!document.body.classList.contains('gcm-sidebar-open')) return;
    if (document.querySelector('[role="dialog"]')) return;
    e.stopPropagation();
    closeMobileSidebar();
  };

  // Resize: si cruzamos a desktop, descartamos el "open" mobile (y con él el
  // scrim) y aplicamos la preferencia de colapso persistida. Si cruzamos a
  // mobile, no forzamos estado — el sidebar queda cerrado y el usuario debe
  // usar el toggle hamburguesa para abrirlo.
  const onResize = () => {
    const mobile = isMobileViewport();
    if (!mobile) {
      applyMobileOpen(false); // también limpia el scrim via syncScrim()
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
