/* Documentado por: Miguel Flores */
import { h } from '../utils/dom.js';
import { renderSidebar } from './sidebar.js';
import { renderTopbar } from './topbar.js';

const STORAGE_KEY = 'gcm.sidebarCollapsed';

/**
 * Lee de localStorage si el usuario prefiere el sidebar colapsado.
 * @returns {boolean} true si la preferencia guardada es colapsado
 */
function readCollapsedPref() {
  try { return localStorage.getItem(STORAGE_KEY) === '1'; }
  catch { return false; }
}
/**
 * Guarda en localStorage la preferencia de colapso del sidebar.
 * @param {boolean} collapsed - true si el sidebar debe quedar colapsado
 * @returns {void}
 */
function writeCollapsedPref(collapsed) {
  try { localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0'); }
  catch {}
}

/**
 * Indica si el viewport actual corresponde a tamaño móvil.
 * @returns {boolean} true si el ancho de pantalla es de móvil
 */
function isMobileViewport() {
  return window.matchMedia('(max-width: 767.95px)').matches;
}

/**
 * Aplica el estado colapsado/expandido del sidebar al body y notifica el cambio
 * mediante un evento global.
 * @param {boolean} collapsed - true para colapsar el sidebar
 * @returns {void}
 */
function applyCollapsed(collapsed) {
  document.body.classList.toggle('gcm-sidebar-collapsed', !!collapsed);
  window.dispatchEvent(new CustomEvent('gcm:sidebar-state-changed', {
    detail: { collapsed: !!collapsed },
  }));
}

/**
 * Abre o cierra el sidebar en modo móvil y sincroniza el scrim (fondo oscuro) asociado.
 * @param {boolean} open - true para abrir el sidebar móvil
 * @returns {void}
 */
function applyMobileOpen(open) {
  document.body.classList.toggle('gcm-sidebar-open', !!open);
  syncScrim();
}

/**
 * Cierra el sidebar en modo móvil.
 * @returns {void}
 */
function closeMobileSidebar() {
  applyMobileOpen(false);
}

/**
 * Crea, muestra u oculta el scrim (fondo oscuro semitransparente) detrás del sidebar
 * móvil abierto, según el estado actual del viewport y del sidebar.
 * @returns {void}
 */
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
    requestAnimationFrame(() => scrim.classList.add('gcm-scrim-visible'));
    return;
  }
  if (!existing) return;
  existing.classList.remove('gcm-scrim-visible');
  setTimeout(() => {
    if (existing.parentNode && !document.body.classList.contains('gcm-sidebar-open')) {
      existing.remove();
    }
  }, 200);
}

/**
 * Renderiza el shell general de la aplicación: sidebar, topbar y el contenido
 * principal recibido. Gestiona el estado de colapso/apertura del sidebar (persistido
 * en localStorage) y sus listeners globales (resize, teclado, evento de toggle).
 * @param {Object} params - datos de renderizado
 * @param {HTMLElement} params.content - contenido principal a mostrar dentro del layout
 * @param {Object} params.user - usuario autenticado actual
 * @param {Function} params.onLogout - callback invocado al cerrar sesión
 * @returns {HTMLElement} elemento div raíz del layout con sidebar, topbar y contenido
 */
export function renderLayout({ content, user, onLogout }) {
  const isMobile = isMobileViewport();
  if (!isMobile) {
    applyCollapsed(readCollapsedPref());
  } else {
    applyCollapsed(false);
    applyMobileOpen(false);
  }

  const sidebar = renderSidebar({
    user,
    onClose: () => { if (isMobileViewport()) closeMobileSidebar(); },
  });

  const wrapper = h('div.gcm-shell.flex.h-full.bg-surface', {}, [
    h('div.gcm-sidebar', {}, [sidebar]),
    h('div.gcm-main.flex-1.flex.flex-col.min-w-0', {}, [
      renderTopbar({ user, onLogout }),
      h('main.flex-1.overflow-y-auto', {}, [
        h('div.max-w-7xl.mx-auto.w-full.p-4', { class: 'md:p-6' }, [content]),
      ]),
    ]),
  ]);

  /**
   * Alterna el estado del sidebar: en móvil abre/cierra el drawer, en escritorio
   * colapsa/expande y persiste la preferencia.
   * @returns {void}
   */
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

  /**
   * Cierra el sidebar móvil al presionar Escape, salvo que haya un diálogo modal abierto.
   * @param {KeyboardEvent} e - evento de teclado
   * @returns {void}
   */
  const onKeydown = (e) => {
    if (e.key !== 'Escape') return;
    if (!isMobileViewport()) return;
    if (!document.body.classList.contains('gcm-sidebar-open')) return;
    if (document.querySelector('[role="dialog"]')) return;
    e.stopPropagation();
    closeMobileSidebar();
  };

  /**
   * Al cambiar el tamaño de ventana, si deja de ser móvil cierra el drawer móvil
   * y restaura la preferencia de colapso guardada.
   * @returns {void}
   */
  const onResize = () => {
    const mobile = isMobileViewport();
    if (!mobile) {
      applyMobileOpen(false);
      applyCollapsed(readCollapsedPref());
    }
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('gcm:toggle-sidebar', onToggleSidebar);
    window.addEventListener('resize', onResize);
    window.addEventListener('keydown', onKeydown);
  }

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

