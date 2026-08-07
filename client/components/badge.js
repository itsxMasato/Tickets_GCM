/* Documentado por: Miguel Flores */
import { h, escapeHtml } from '../utils/dom.js';

/**
 * Crea una etiqueta (badge) genérica de color configurable.
 * @param {string} text - texto a mostrar dentro del badge
 * @param {string} [type='slate'] - color base de Tailwind (ej. slate, blue, red)
 * @param {string} [extra=''] - clases CSS adicionales a aplicar
 * @returns {HTMLElement} elemento span del badge
 */
export function badge(text, type = 'slate', extra = '') {
  return h(`span.badge.bg-${type}-100.text-${type}-800`, { class: extra }, String(text));
}

/**
 * Crea un badge con el color y etiqueta correspondientes al estado de un ticket.
 * @param {string} status - clave del estado (ej. 'abierto', 'solucionado')
 * @returns {HTMLElement} elemento span del badge de estado
 */
export function statusBadge(status) {
  return h('span', { class: `badge-${status}` }, STATUS_LABEL[status] || status);
}

/**
 * Crea un badge con el color y etiqueta correspondientes a la prioridad de un ticket.
 * @param {string} priority - clave de la prioridad (ej. 'alta', 'baja')
 * @returns {HTMLElement} elemento span del badge de prioridad
 */
export function priorityBadge(priority) {
  return h('span', { class: `prio-${priority}` }, PRIORITY_LABEL[priority] || priority);
}

/**
 * Crea un badge con la ubicación de un ticket cuando está afuera, en un proveedor externo. No renderiza nada si el ticket sigue en el taller (default, no ensucia la UI).
 * @param {string} locationType - tipo de ubicación ('taller' o 'proveedor')
 * @param {string} [providerName] - nombre del proveedor, si corresponde
 * @returns {HTMLElement|null} elemento span del badge, o null si está en el taller
 */
export function locationBadge(locationType, providerName) {
  if (locationType !== 'proveedor') return null;
  return h('span.badge-proveedor', {}, `En proveedor${providerName ? `: ${providerName}` : ''}`);
}

import { STATUS_LABEL, PRIORITY_LABEL } from '../utils/format.js';

