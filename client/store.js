/* Documentado por: Miguel Flores */
const listeners = new Set();
let state = {
  user: null,
  notifications: [],
  unreadCount: 0,
};

/**
 * Devuelve el estado global actual de la aplicación (user, notifications, unreadCount).
 * @returns {Object} referencia al estado actual
 */
export function getState() { return state; }

/**
 * Combina un parche con el estado global actual y notifica a todos los suscriptores del nuevo estado.
 * @param {Object} patch - propiedades a fusionar sobre el estado actual
 * @returns {void}
 */
export function setState(patch) {
  state = { ...state, ...patch };
  for (const fn of listeners) fn(state);
}

/**
 * Suscribe una función a los cambios del estado global; se invoca inmediatamente con el estado actual.
 * @param {Function} fn - callback invocado con el estado en cada cambio (y al suscribirse)
 * @returns {Function} función de desuscripción
 */
export function subscribe(fn) {
  listeners.add(fn);
  fn(state);
  return () => listeners.delete(fn);
}

