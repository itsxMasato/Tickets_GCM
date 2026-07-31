/* Documentado por: Miguel Flores */
/**
 * Suscribe un handler a todos los eventos realtime emitidos como CustomEvent 'gcm:realtime' en window.
 * @param {Function} handler - callback invocado con (detail, event) en cada emisión
 * @returns {AbortController} controller cuyo abort() cancela la suscripción
 */
export function subscribeToRealtime(handler) {
  const ac = new AbortController();
  const listener = (e) => handler(e.detail, e);
  window.addEventListener('gcm:realtime', listener, { signal: ac.signal });
  return ac;
}

/**
 * Suscribe un handler solo a un subconjunto de tipos de evento dentro de 'gcm:realtime'.
 * @param {Array<string>} events - lista de nombres de evento a los que reaccionar
 * @param {Function} handler - callback invocado con (detail, event) cuando el evento coincide
 * @returns {AbortController} controller cuyo abort() cancela la suscripción
 */
export function subscribeToRealtimeEvents(events, handler) {
  const ac = new AbortController();
  const listener = (e) => {
    const d = e.detail;
    if (!d) return;
    if (events.includes(d.event)) handler(d, e);
  };
  window.addEventListener('gcm:realtime', listener, { signal: ac.signal });
  return ac;
}

export default { subscribeToRealtime, subscribeToRealtimeEvents };

