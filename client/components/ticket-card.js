/* Documentado por: Miguel Flores */
import { h } from '../utils/dom.js';
import { statusBadge, priorityBadge, locationBadge } from './badge.js';
import { relativeFromNow, PRIORITY_LABEL } from '../utils/format.js';
import { go } from '../router.js';
import { ICON, svg } from '../utils/icons.js';

/**
 * Arma una tarjeta clickeable con el resumen de un ticket (código, título, prioridad,
 * estado, fecha relativa y responsable asignado) que navega al detalle al hacer click.
 * @param {Object} t - ticket a mostrar (code, title, priority, status, created_at, assigned_to_name, id)
 * @returns {HTMLElement} elemento button con la tarjeta del ticket
 */
export function ticketCard(t) {
  return h('button.w-full.text-left.bg-white.border.border-surface-border.rounded-lg.p-3.transition', {
    class: 'hover:border-brand-ocean hover:shadow-card focus:outline-none focus:ring-2 focus:ring-brand-ocean/30',
    onclick: () => go(`/tickets/${t.id}`),
    'aria-label': `Abrir ticket ${t.code}: ${t.title}`,
  }, [
    h('div.flex.items-center.justify-between.gap-2.mb-1', {}, [
      h('span.text-xs.font-mono.text-slate-500', {}, t.code),
      priorityBadge(t.priority),
    ]),
    h('div.font-medium.text-brand-ink.line-clamp-2', {}, t.title),
    h('div.flex.items-center.gap-2.mt-2.text-xs.flex-wrap', {}, [
      statusBadge(t.status),
      locationBadge(t.location_type, t.location_provider_name),
      h('span.text-slate-500', {}, `· ${relativeFromNow(t.created_at)}`),
    ]),
    t.assigned_to_name ? h('div.text-xs.text-slate-500.flex.items-center.gap-1', { class: 'mt-1.5' }, [
      svg(h, ICON.user, 'w-3 h-3 text-slate-400 flex-none'),
      h('span.truncate', {}, `Asignado a: ${t.assigned_to_name}`),
    ]) : null,
  ]);
}

