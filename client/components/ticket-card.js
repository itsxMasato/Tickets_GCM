import { h } from '../utils/dom.js';
import { statusBadge, priorityBadge } from './badge.js';
import { relativeFromNow, PRIORITY_LABEL } from '../utils/format.js';
import { go } from '../router.js';

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
      h('svg.w-3.h-3.text-slate-400.flex-none', { fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', viewBox: '0 0 24 24', 'aria-hidden': 'true', html: '<path stroke-linecap="round" stroke-linejoin="round" d="M16 11a4 4 0 10-8 0 4 4 0 008 0zM4 21a8 8 0 0116 0"/>' }),
      h('span.truncate', {}, `Asignado a: ${t.assigned_to_name}`),
    ]) : null,
  ]);
}
