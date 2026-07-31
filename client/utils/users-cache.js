/* Documentado por: Miguel Flores */
let list = [];
let loaded = false;
let loading = null;
const subscribers = new Set();

/**
 * Notifica a todos los suscriptores del cache con la lista actual de usuarios.
 * @returns {void}
 */
function notify() {
  for (const fn of subscribers) {
    try { fn({ users: list.slice(), reason: 'update' }); } catch (e) { console.warn('[users-cache] subscriber error', e); }
  }
}

/**
 * Carga (o recarga) la lista de usuarios activos desde la API y actualiza el cache.
 * Si ya hay una carga en curso, reutiliza esa misma promesa en vez de duplicar la petición.
 * @returns {Promise<Array>} lista de usuarios cargada (o la última conocida si la petición falla)
 */
export function load() {
  if (loading) return loading;
  loading = (async () => {
    try {
      const res = await apiCall();
      list = Array.isArray(res?.users) ? res.users : [];
      loaded = true;
      notify();
      return list.slice();
    } catch (e) {
      console.warn('[users-cache] load falló:', e.message);
      return list.slice();
    } finally {
      loading = null;
    }
  })();
  return loading;
}

/**
 * Realiza la llamada a la API para obtener los usuarios activos (import dinámico para evitar ciclos de módulo).
 * @returns {Promise<Object>} respuesta cruda de la API con la lista de usuarios
 */
async function apiCall() {
  const mod = await import('../api.js');
  return mod.api.users.list({ active: 1 });
}

/**
 * Devuelve una copia de la lista de usuarios actualmente en cache.
 * @returns {Array} copia del array de usuarios
 */
export function get() {
  return list.slice();
}

/**
 * Indica si el cache de usuarios ya se cargó al menos una vez.
 * @returns {boolean} true si load() ya completó exitosamente alguna vez
 */
export function isLoaded() {
  return loaded;
}

/**
 * Cuenta cuántos usuarios en cache tienen un rol determinado.
 * @param {string} role - código de rol a contar
 * @returns {number} cantidad de usuarios con ese rol
 */
export function countByRole(role) {
  return list.filter((u) => u.role === role).length;
}

/**
 * Suscribe un handler a cambios del cache de usuarios; lo invoca inmediatamente si el cache ya está cargado.
 * @param {Function} handler - callback invocado con { users, reason } en cada actualización
 * @returns {Function} función de desuscripción
 */
export function subscribe(handler) {
  subscribers.add(handler);
  if (loaded) {
    try { handler({ users: list.slice(), reason: 'initial' }); } catch {}
  }
  return () => subscribers.delete(handler);
}

/**
 * Escucha eventos realtime de usuarios (creado/actualizado/desactivado) y recarga el cache automáticamente.
 * @returns {Function} función para dejar de escuchar los eventos realtime
 */
export function startRealtimeSync() {
  if (typeof window === 'undefined') return () => {};
  const handler = (e) => {
    const t = e.detail?.event;
    if (t === 'user:created' || t === 'user:updated' || t === 'user:deactivated') {
      load();
    }
  };
  window.addEventListener('gcm:realtime', handler);
  return () => window.removeEventListener('gcm:realtime', handler);
}

export const usersCache = {
  load,
  get,
  isLoaded,
  countByRole,
  subscribe,
  startRealtimeSync,
};

