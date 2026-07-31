/* Documentado por: Miguel Flores */
import { connectSocket, on as onSocket, whenReady } from '../socket.js';

/**
 * Conecta el socket (si hace falta) y suscribe un handler a un único evento.
 * @param {string} event - nombre del evento de socket.io a escuchar
 * @param {Function} handler - callback invocado con el payload del evento
 * @returns {Promise<Function>} función de desuscripción (segura de llamar aunque falle)
 */
export async function subscribe(event, handler) {
  try { await connectSocket(); } catch {}
  const unsub = onSocket(event, handler);
  return () => { try { const r = unsub(); if (r && typeof r.then === 'function') r.catch(() => {}); } catch {} };
}

/**
 * Conecta el socket y suscribe un mismo handler a varios eventos a la vez.
 * @param {Array<string>} events - nombres de eventos a escuchar
 * @param {Function} handler - callback invocado con (event, payload) en cada emisión
 * @returns {Promise<{abort: Function}>} objeto con abort() para cancelar todas las suscripciones
 */
export async function subscribeMany(events, handler) {
  const unsubList = [];
  try { await connectSocket(); } catch {}
  for (const ev of events) {
    const unsub = onSocket(ev, (payload) => handler(ev, payload));
    unsubList.push(unsub);
  }
  return {
    abort: () => { for (const u of unsubList) { try { const r = u(); if (r && typeof r.then === 'function') r.catch(() => {}); } catch {} } },
  };
}

export default { subscribe, subscribeMany };

