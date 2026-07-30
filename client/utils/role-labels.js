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

export function isInitialized() {
  return initialized;
}

export function getRoleLabel(role) {
  if (!role) return '';
  return cache.get(role) || DEFAULT_ROLE_LABEL[role] || role;
}

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

export function subscribe(handler) {
  if (typeof window === 'undefined') return () => {};
  const evt = 'gcm:role_label_updated';
  window.addEventListener(evt, handler);
  return () => window.removeEventListener(evt, handler);
}

export function _debugCache() {
  return new Map(cache);
}

