/* Documentado por: Miguel Flores */
let list = [];
let loaded = false;
let loading = null;
const subscribers = new Set();

function notify() {
  for (const fn of subscribers) {
    try { fn({ users: list.slice(), reason: 'update' }); } catch (e) { console.warn('[users-cache] subscriber error', e); }
  }
}

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

async function apiCall() {
  const mod = await import('../api.js');
  return mod.api.users.list({ active: 1 });
}

export function get() {
  return list.slice();
}

export function isLoaded() {
  return loaded;
}

export function countByRole(role) {
  return list.filter((u) => u.role === role).length;
}

export function subscribe(handler) {
  subscribers.add(handler);
  if (loaded) {
    try { handler({ users: list.slice(), reason: 'initial' }); } catch {}
  }
  return () => subscribers.delete(handler);
}

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

