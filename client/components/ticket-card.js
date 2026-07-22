/* Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. */
import { h } from '../utils/dom.js';
import { statusBadge, priorityBadge } from './badge.js';
import { relativeFromNow, PRIORITY_LABEL } from '../utils/format.js';
import { go } from '../router.js';
import { ICON, svg } from '../utils/icons.js';

export function ticketCard(t) {
  return h('button.w-full.text-left.bg-white.border.border-surface-border.rounded-lg.p-3.hover\\:border-brand-ocean.hover\\:shadow-card.focus\\:outline-none.focus\\:ring-2.focus\\:ring-brand-ocean\\/30.transition', {
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
      h('span.text-slate-500', {}, `· ${relativeFromNow(t.created_at)}`),
    ]),
    t.assigned_to_name ? h('div.text-xs.text-slate-500.mt-1.5.flex.items-center.gap-1', {}, [
      svg(h, ICON.user, 'w-3 h-3 text-slate-400 flex-none'),
      h('span.truncate', {}, `Asignado a: ${t.assigned_to_name}`),
    ]) : null,
  ]);
}
