/* Documentado por: Miguel Flores */
import { connectSocket, on as onSocket, whenReady } from '../socket.js';

export async function subscribe(event, handler) {
  try { await connectSocket(); } catch {}
  const unsub = onSocket(event, handler);
  return () => { try { const r = unsub(); if (r && typeof r.then === 'function') r.catch(() => {}); } catch {} };
}

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

