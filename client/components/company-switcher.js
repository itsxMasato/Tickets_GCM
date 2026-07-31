/* Documentado por: Miguel Flores */
import { h } from '../utils/dom.js';
import { setState } from '../store.js';
import { api } from '../api.js';
import { toast } from '../utils/toast.js';
import { reconnectSocket } from '../socket.js';
import { hasMultipleCompanies } from '../utils/permissions.js';

/**
 * Renderiza el selector de empresa activa en el topbar, visible solo cuando el
 * usuario pertenece a más de una empresa. Permite cambiar de empresa activa,
 * reconectando el socket y notificando el cambio al resto de la app.
 * @param {Object} params - parámetros de renderizado
 * @param {Object} params.user - usuario actual (incluye memberships y active_company_id)
 * @returns {HTMLElement|null} elemento div raíz del switcher, o null si no aplica
 */
export function renderCompanySwitcher({ user }) {
  if (!hasMultipleCompanies(user)) return null;

  const memberships = user.memberships || [];
  const current = memberships.find((m) => String(m.company_id) === String(user.active_company_id));

  const menu = h('div.absolute.right-0.top-full.mt-2.w-64.bg-white.rounded-xl.shadow-pop.border.border-surface-border.py-1.hidden.z-40.overflow-hidden', {
    role: 'menu',
    'aria-label': 'Cambiar empresa activa',
  }, [
    h('div.px-3.py-2.border-b.border-surface-border.font-semibold.text-slate-500.uppercase.tracking-wide', { class: 'text-[11px]' }, 'Tus empresas'),
    ...memberships.map((m) => {
      const isActive = String(m.company_id) === String(user.active_company_id);
      return h('button.flex.items-center.gap-2.w-full.px-3.py-2.text-sm.text-left', {
        class: 'hover:bg-surface disabled:cursor-default',
        role: 'menuitem',
        disabled: isActive ? 'disabled' : null,
        onclick: () => { closeMenu(); switchTo(m.company_id); },
      }, [
        h('span.inline-block.w-2.h-2.rounded-full.flex-none', {
          style: { backgroundColor: m.company?.color || '#0b1e3a' },
          'aria-hidden': 'true',
        }),
        h('span.flex-1.truncate', { class: isActive ? 'font-semibold text-brand-ink' : 'text-brand-ink' }, m.company?.name || `Empresa #${m.company_id}`),
        isActive ? h('span.font-semibold.text-brand-ocean.flex-none', { class: 'text-[10px]' }, 'Activa') : null,
      ]);
    }),
  ]);

  const trigger = h('button.topbar-user-trigger.flex.items-center.gap-2.px-2.py-1.rounded-md.transition', {
    class: 'hover:bg-surface',
    onclick: (e) => { e.stopPropagation(); toggleMenu(); },
    'aria-haspopup': 'menu',
    'aria-expanded': 'false',
    title: 'Cambiar empresa activa',
  }, [
    h('svg.w-4.h-4.text-slate-500.flex-none', {
      fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', viewBox: '0 0 24 24', 'aria-hidden': 'true',
      html: '<path stroke-linecap="round" stroke-linejoin="round" d="M3 21h18M5 21V7l7-4 7 4v14M9 9h1m-1 4h1m4-4h1m-1 4h1" />',
    }),
    h('span.text-sm.font-medium.text-brand-ink.truncate', { class: 'max-w-[140px]' }, current?.company?.name || 'Empresa'),
    h('svg.w-4.h-4.text-slate-500.flex-none', {
      fill: 'none', stroke: 'currentColor', 'stroke-width': '2', viewBox: '0 0 24 24', 'aria-hidden': 'true',
      html: '<path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />',
    }),
  ]);

  const root = h('div.relative', {}, [trigger, menu]);

  /**
   * Indica si el menú de selección de empresa está actualmente abierto.
   * @returns {boolean} true si el menú está visible
   */
  function isOpen() { return !menu.classList.contains('hidden'); }
  /**
   * Muestra el menú de selección de empresa y actualiza el estado de accesibilidad del trigger.
   * @returns {void}
   */
  function openMenu() { menu.classList.remove('hidden'); trigger.setAttribute('aria-expanded', 'true'); }
  /**
   * Oculta el menú de selección de empresa y actualiza el estado de accesibilidad del trigger.
   * @returns {void}
   */
  function closeMenu() { menu.classList.add('hidden'); trigger.setAttribute('aria-expanded', 'false'); }
  /**
   * Alterna la visibilidad del menú de selección de empresa.
   * @returns {void}
   */
  function toggleMenu() { isOpen() ? closeMenu() : openMenu(); }

  let switching = false;
  /**
   * Cambia la empresa activa del usuario: llama a la API, actualiza el estado global,
   * reconecta el socket y muestra un toast con el resultado. Evita cambios concurrentes
   * o redundantes (misma empresa ya activa).
   * @param {string|number} companyId - id de la empresa a activar
   * @returns {Promise<void>}
   */
  async function switchTo(companyId) {
    if (switching || String(companyId) === String(user.active_company_id)) return;
    switching = true;
    try {
      const res = await api.auth.setActiveCompany(companyId);
      setState({ user: res.user });
      await reconnectSocket();
      window.dispatchEvent(new CustomEvent('gcm:company-switched'));
      const next = (res.user.memberships || []).find((m) => String(m.company_id) === String(companyId));
      toast(`Empresa activa: ${next?.company?.name || 'actualizada'}`, 'success');
    } catch (e) {
      toast(e.message || 'No se pudo cambiar de empresa', 'error');
    } finally {
      switching = false;
    }
  }

  /**
   * Cierra el menú si un click ocurre fuera de él (listener global en el documento).
   * @returns {void}
   */
  const onDocClick = () => { if (isOpen()) closeMenu(); };
  /**
   * Cierra el menú al presionar la tecla Escape (listener global en el documento).
   * @param {KeyboardEvent} e - evento de teclado
   * @returns {void}
   */
  const onKey = (e) => { if (e.key === 'Escape' && isOpen()) closeMenu(); };
  document.addEventListener('click', onDocClick, { capture: true });
  document.addEventListener('keydown', onKey);

  root._companySwitcherCleanup = () => {
    document.removeEventListener('click', onDocClick, { capture: true });
    document.removeEventListener('keydown', onKey);
  };

  return root;
}

