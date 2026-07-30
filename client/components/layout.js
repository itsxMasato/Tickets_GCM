/* Documentado por: Miguel Flores */
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
  catch {}
}

function isMobileViewport() {
  return window.matchMedia('(max-width: 767.95px)').matches;
}

function applyCollapsed(collapsed) {
  document.body.classList.toggle('gcm-sidebar-collapsed', !!collapsed);
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

  const onKeydown = (e) => {
    if (e.key !== 'Escape') return;
    if (!isMobileViewport()) return;
    if (!document.body.classList.contains('gcm-sidebar-open')) return;
    if (document.querySelector('[role="dialog"]')) return;
    e.stopPropagation();
    closeMobileSidebar();
  };

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

