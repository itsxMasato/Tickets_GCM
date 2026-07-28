/* Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. */
import { h } from '../utils/dom.js';
import { setState } from '../store.js';
import { api } from '../api.js';
import { toast } from '../utils/toast.js';
import { reconnectSocket } from '../socket.js';
import { hasMultipleCompanies } from '../utils/permissions.js';

/**
 * company-switcher — selector de empresa activa en el topbar. Solo se
 * renderiza si el user tiene más de una membresía (ver
 * utils/permissions.js:hasMultipleCompanies). Al elegir una empresa:
 *   1. POST /api/auth/active-company (persiste en la sesión del server).
 *   2. Actualiza el store con el user devuelto (incluye active_company_id).
 *   3. Reconecta el socket (la sesión vieja ya se unió a las salas al
 *      conectar; solo un handshake nuevo une al socket a `company:{id}`).
 *   4. Dispara 'gcm:company-switched' — main.js re-despacha la ruta actual
 *      para que listas/dashboard abiertos refresquen con el nuevo scope.
 * Sin reload de página ni logout: mismo patrón de dropdown que
 * renderUserMenu/renderBell en topbar.js (trigger + panel + outside-click).
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

  function isOpen() { return !menu.classList.contains('hidden'); }
  function openMenu() { menu.classList.remove('hidden'); trigger.setAttribute('aria-expanded', 'true'); }
  function closeMenu() { menu.classList.add('hidden'); trigger.setAttribute('aria-expanded', 'false'); }
  function toggleMenu() { isOpen() ? closeMenu() : openMenu(); }

  let switching = false;
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

  const onDocClick = () => { if (isOpen()) closeMenu(); };
  const onKey = (e) => { if (e.key === 'Escape' && isOpen()) closeMenu(); };
  document.addEventListener('click', onDocClick, { capture: true });
  document.addEventListener('keydown', onKey);

  root._companySwitcherCleanup = () => {
    document.removeEventListener('click', onDocClick, { capture: true });
    document.removeEventListener('keydown', onKey);
  };

  return root;
}
