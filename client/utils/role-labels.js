/* Documentado por: Miguel Flores */
import { api } from '../api.js';

const DEFAULT_ROLE_LABEL = {
  supervisor_campo: 'Supervisor de campo',
  sac:              'Servicio al cliente (SAC)',
  admin_area:       'Administrador de área',
  jefe_inmediato:   'Jefe inmediato',
};

const cache = new Map();

let initialized = false;
let initPromise = null;

/**
 * Inicializa el cache de etiquetas de roles pidiéndolas al backend; si falla, usa las etiquetas por defecto.
 * Las llamadas subsiguientes reutilizan la misma promesa (no vuelve a pedir al backend).
 * @returns {Promise<void>}
 */
export async function init() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    try {
      const res = await api.roles.labels.list();
      const labels = res?.labels || {};
      cache.clear();
      for (const role of Object.keys(DEFAULT_ROLE_LABEL)) {
        const v = labels[role];
        cache.set(role, (typeof v === 'string' && v.trim().length > 0) ? v : DEFAULT_ROLE_LABEL[role]);
      }
      initialized = true;
    } catch (e) {
      cache.clear();
      for (const role of Object.keys(DEFAULT_ROLE_LABEL)) {
        cache.set(role, DEFAULT_ROLE_LABEL[role]);
      }
      console.warn('[role-labels] init falló, usando defaults:', e.message);
    }
  })();
  return initPromise;
}

/**
 * Indica si el cache de etiquetas de roles ya terminó de inicializarse.
 * @returns {boolean} true si init() ya completó exitosamente
 */
export function isInitialized() {
  return initialized;
}

/**
 * Obtiene la etiqueta legible de un rol desde el cache, con fallback a la etiqueta por defecto o al código del rol.
 * @param {string} role - código interno del rol (ej. 'sac')
 * @returns {string} etiqueta legible del rol
 */
export function getRoleLabel(role) {
  if (!role) return '';
  return cache.get(role) || DEFAULT_ROLE_LABEL[role] || role;
}

/**
 * Actualiza en el cache local la etiqueta de un rol y notifica a los suscriptores del cambio,
 * típicamente al recibir una actualización por socket en tiempo real.
 * @param {string} role - código interno del rol
 * @param {string} label - nueva etiqueta legible del rol
 * @returns {void}
 */
export function applyRoleLabel(role, label) {
  if (!role) return;
  if (typeof label === 'string' && label.length > 0) {
    cache.set(role, label);
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('gcm:role_label_updated', {
      detail: { role, label },
    }));
  }
}

/**
 * Suscribe un handler al evento 'gcm:role_label_updated', disparado cuando cambia la etiqueta de un rol.
 * @param {Function} handler - callback invocado con el CustomEvent al actualizarse una etiqueta
 * @returns {Function} función de desuscripción
 */
export function subscribe(handler) {
  if (typeof window === 'undefined') return () => {};
  const evt = 'gcm:role_label_updated';
  window.addEventListener(evt, handler);
  return () => window.removeEventListener(evt, handler);
}

/**
 * Devuelve una copia del cache interno de etiquetas de roles, solo para inspección en debugging.
 * @returns {Map} copia del Map de código de rol a etiqueta
 */
export function _debugCache() {
  return new Map(cache);
}

