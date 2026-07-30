/* Documentado por: Miguel Flores */
export function subscribeToRealtime(handler) {
  const ac = new AbortController();
  const listener = (e) => handler(e.detail, e);
  window.addEventListener('gcm:realtime', listener, { signal: ac.signal });
  return ac;
}

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

