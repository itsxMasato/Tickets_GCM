// Cache en memoria de los labels editables de los roles (rol → etiqueta
// visible). Una sola fuente de verdad: el backend (Firestore) cargado en
// init() tras el login. Si el cache está vacío, se cae al default local
// — mismo string que validators.ROLE_LABEL en el backend, para mantener
// una sola cara del sistema. La desincronización cliente/servidor
// histórica queda resuelta: ambos usan los mismos defaults y el cliente
// siempre refleja lo que dice el servidor.

import { api } from '../api.js';

// Defaults locales — espejo de src/utils/validators.js#ROLE_LABEL. Es
// legítimo duplicar: son 4 strings, y evita un import cross-side.
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
      // Si falla (sin red, 5xx), cargamos defaults para que la UI no
      // muestre keys crudas. El siguiente init() lo reintentará.
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

// Devuelve el label visible de un rol. Orden de resolución:
//   1. Cache (lo que devolvió init o lo último aplicado por realtime).
//   2. Default local (espejo del backend).
//   3. La key cruda como último recurso.
export function getRoleLabel(role) {
  if (!role) return '';
  return cache.get(role) || DEFAULT_ROLE_LABEL[role] || role;
}

// Aplica un cambio de label al cache y lo difunde a las vistas vivas.
// Las vistas suscritas a 'gcm:role_label_updated' re-renderizan lo propio.
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

// Suscripción ergonómica. Devuelve función de cleanup.
export function subscribe(handler) {
  if (typeof window === 'undefined') return () => {};
  const evt = 'gcm:role_label_updated';
  window.addEventListener(evt, handler);
  return () => window.removeEventListener(evt, handler);
}

// Sólo para tests/debug. La UI nunca debe leer esto directamente.
export function _debugCache() {
  return new Map(cache);
}
