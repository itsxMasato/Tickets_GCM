/* Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. */
import { h, escapeHtml } from '../utils/dom.js';

export function badge(text, type = 'slate', extra = '') {
  return h(`span.badge.bg-${type}-100.text-${type}-800`, { class: extra }, String(text));
}

export function statusBadge(status) {
  return h('span', { class: `badge-${status}` }, STATUS_LABEL[status] || status);
}

export function priorityBadge(priority) {
  return h('span', { class: `prio-${priority}` }, PRIORITY_LABEL[priority] || priority);
}

import { STATUS_LABEL, PRIORITY_LABEL } from '../utils/format.js';
