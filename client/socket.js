/* Documentado por: Miguel Flores */
let socket = null;
let loading = null;
let readyResolve = null;
let readyPromise = new Promise((res) => { readyResolve = res; });

const handlers = new Map();

function loadClient() {
  if (window.io) return Promise.resolve(window.io);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/socket.io-client@4.7.5/dist/socket.io.min.js';
    s.async = true;
    s.onload = () => resolve(window.io);
    s.onerror = () => reject(new Error('No se pudo cargar socket.io-client'));
    document.head.appendChild(s);
  });
  return loading;
}

function getSocketBase() {
  const raw = typeof import.meta !== 'undefined' && import.meta.env?.VITE_SOCKET_BASE_URL
    ? import.meta.env.VITE_SOCKET_BASE_URL
    : '';
  if (raw) return raw.replace(/\/$/, '');

  if (typeof window !== 'undefined' && typeof window.location?.hostname === 'string') {
    const host = window.location.hostname.toLowerCase();
    const isLocalhost = host === 'localhost' || host === '127.0.0.1' || host === '::1';
    const isNetlify = host.endsWith('.netlify.app') || host === 'netlify.app';
    const isRender = host.endsWith('.onrender.com');
    if (import.meta.env?.PROD && !isLocalhost) {
      return 'https://tickets-gcm-api.onrender.com';
    }
    if (import.meta.env?.PROD && isRender) {
      return 'https://tickets-gcm-api.onrender.com';
    }
  }
  return '';
}

export async function connectSocket() {
  if (socket) return socket;
  const io = await loadClient();
  const socketBase = getSocketBase();
  socket = socketBase
    ? io(socketBase, {
      withCredentials: true,
      transports: ['websocket', 'polling'],
    })
    : io({
      withCredentials: true,
      transports: ['websocket', 'polling'],
    });
  for (const [event, fns] of handlers.entries()) {
    for (const fn of fns) socket.on(event, fn);
  }
  readyResolve();
  return socket;
}

export function on(event, handler) {
  handlers.set(event, [...(handlers.get(event) || []), handler]);
  if (socket) socket.on(event, handler);
  return async () => {
    const list = handlers.get(event) || [];
    handlers.set(event, list.filter((f) => f !== handler));
    if (socket) socket.off(event, handler);
  };
}

export function isConnected() { return !!socket?.connected; }
export const whenReady = () => readyPromise;

export function reconnectSocket() {
  if (socket) {
    try { socket.disconnect(); } catch {}
    socket = null;
  }
  readyPromise = new Promise((res) => { readyResolve = res; });
  return connectSocket();
}

