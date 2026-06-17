import { connectSocket, on as onSocket, whenReady } from '../socket.js';

// Subscribe a single event and return an unsubscribe function.
// Ensures socket client is connected (but does not block the caller).
export async function subscribe(event, handler) {
  try { await connectSocket(); } catch {}
  const unsub = onSocket(event, handler);
  // onSocket returns a function (possibly async) to remove handler
  return () => { try { const r = unsub(); if (r && typeof r.then === 'function') r.catch(() => {}); } catch {} };
}

// Subscribe multiple events; returns an AbortController-like object with abort().
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
