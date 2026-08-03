/* Documentado por: Miguel Flores */
let socket = null;
let loading = null;
let readyResolve = null;
let readyPromise = new Promise((res) => { readyResolve = res; });

const handlers = new Map();

/**
 * Carga dinámicamente el cliente de socket.io desde CDN si aún no está disponible en window.io.
 * @returns {Promise<Function>} constructor io() del cliente de socket.io
 */
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

/**
 * Determina la URL base a usar para la conexión de socket.io: primero VITE_SOCKET_BASE_URL si está
 * definida en build, y si no, infiere la URL de Render en producción según el hostname actual.
 * @returns {string} URL base del servidor de sockets, o cadena vacía para usar el origen actual
 */
function getSocketBase() {
  const raw = typeof import.meta !== 'undefined' && import.meta.env?.VITE_SOCKET_BASE_URL
    ? import.meta.env.VITE_SOCKET_BASE_URL
    : '';
  if (raw) return raw.replace(/\/$/, '');

  if (typeof window !== 'undefined' && typeof window.location?.hostname === 'string') {
    const host = window.location.hostname.toLowerCase();
    const isLocalhost = host === 'localhost' || host === '127.0.0.1' || host === '::1';
    if (import.meta.env?.PROD && !isLocalhost) {
      return 'https://tickets-gcm-api.onrender.com';
    }
  }
  return '';
}

/**
 * Establece (o reutiliza) la conexión de socket.io: carga el cliente si hace falta, crea el socket
 * con credenciales incluidas, reengancha todos los handlers registrados previamente vía on(),
 * y resuelve la promesa whenReady().
 * @returns {Promise<Object>} instancia del socket conectado
 */
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

/**
 * Registra un handler para un evento de socket, guardándolo también en un registro local para
 * poder reengancharlo si el socket se reconecta.
 * @param {string} event - nombre del evento de socket.io a escuchar
 * @param {Function} handler - callback invocado con el payload del evento
 * @returns {Function} función async de desuscripción que remueve el handler
 */
export function on(event, handler) {
  handlers.set(event, [...(handlers.get(event) || []), handler]);
  if (socket) socket.on(event, handler);
  return async () => {
    const list = handlers.get(event) || [];
    handlers.set(event, list.filter((f) => f !== handler));
    if (socket) socket.off(event, handler);
  };
}

/**
 * Indica si el socket está actualmente conectado.
 * @returns {boolean} true si hay un socket activo y conectado
 */
export function isConnected() { return !!socket?.connected; }
/**
 * Devuelve una promesa que resuelve una vez que la conexión inicial del socket se estableció.
 * @returns {Promise<void>} promesa que resuelve cuando el socket está listo
 */
export const whenReady = () => readyPromise;

/**
 * Fuerza una reconexión del socket: desconecta el socket actual (si existe), reinicia la promesa
 * whenReady() y vuelve a conectar.
 * @returns {Promise<Object>} instancia del nuevo socket conectado
 */
export function reconnectSocket() {
  if (socket) {
    try { socket.disconnect(); } catch {}
    socket = null;
  }
  readyPromise = new Promise((res) => { readyResolve = res; });
  return connectSocket();
}

