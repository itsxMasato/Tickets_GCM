// Carga socket.io-client desde CDN y maneja conexión

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

export async function connectSocket() {
  if (socket) return socket;
  const io = await loadClient();
  socket = io({
    withCredentials: true,
    transports: ['websocket', 'polling'],
  });
  // Re-registra handlers
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
