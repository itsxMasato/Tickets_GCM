import './styles.css';
import { go } from './router.js';
import { setState, getState } from './store.js';
import { api } from './api.js';
import { connectSocket, on as onSocket } from './socket.js';
import { toast } from './utils/toast.js';
import { renderLayout } from './components/layout.js';

// Vistas
import { renderLogin } from './views/login.js';
import { renderDashboard } from './views/dashboard.js';
import { renderTicketsList } from './views/tickets-list.js';
import { renderTicketNew } from './views/ticket-new.js';
import { renderTicketDetail } from './views/ticket-detail.js';
import { renderUsers } from './views/users.js';
import { renderCategories } from './views/categories.js';
import { renderNotifications } from './views/notifications.js';
import { renderReports } from './views/reports.js';

// Registro de rutas (devuelven un { view, cleanup } o un HTMLElement)
const handlers = {
  '/login':         ({ params, query }) => ({ view: renderLogin({ params, query, onLogin }) }),
  '/dashboard':     ({ params, query, user }) => ({ view: renderDashboard({ params, query, user }) }),
  '/tickets':       ({ params, query, user }) => ({ view: renderTicketsList({ params, query, user }) }),
  '/tickets/new':   ({ params, query, user }) => ({ view: renderTicketNew({ params, query, user }) }),
  '/tickets/:id':   ({ params, query, user }) => ({ view: renderTicketDetail({ params, query, user }) }),
  '/users':         ({ params, query, user }) => ({ view: renderUsers({ params, query, user }) }),
  '/categories':    ({ params, query, user }) => ({ view: renderCategories({ params, query, user }) }),
  '/notifications': ({ params, query, user }) => ({ view: renderNotifications({ params, query, user }) }),
  '/reports':       ({ params, query, user }) => ({ view: renderReports({ params, query, user }) }),
};

const app = document.getElementById('app');

function mount(node) {
  // Ejecuta cleanup de listeners en tiempo real registrados por la vista previa
  if (app.firstElementChild && app.firstElementChild._gcmCleanup) {
    try { app.firstElementChild._gcmCleanup(); } catch {}
  }
  app.innerHTML = '';
  if (node instanceof Node) {
    app.appendChild(node);
    return;
  }

  console.warn('mount: invalid view node', node);
  const fallback = document.createElement('div');
  fallback.className = 'p-4 text-red-700 bg-red-100 rounded-md';
  fallback.textContent = 'Error al renderizar la vista. Por favor recarga la página.';
  app.appendChild(fallback);
}

async function onLogin(user) {
  setState({ user });
  go('/dashboard');
  try {
    await connectSocket();
    wireRealtime();
    await refreshBell();
  } catch {}
}

async function onLogout() {
  try { await api.auth.logout(); } catch {}
  setState({ user: null, notifications: [], unreadCount: 0 });
  go('/login');
}

async function refreshBell() {
  try {
    const { count } = await api.notifications.unreadCount();
    const { notifications } = await api.notifications.list({ limit: 15 });
    setState({ unreadCount: count, notifications });
  } catch {}
}

// ── Tiempo real ──────────────────────────────────────────────────────────────
// Refresca campana, dispara toast y notifica a las vistas vivas
// para que recarguen su contenido (listas, detalle de ticket, dashboard).
function emitRealtime(event, detail) {
  window.dispatchEvent(new CustomEvent('gcm:realtime', { detail: { event, ...detail } }));
}

let realtimeWired = false;
function wireRealtime() {
  if (realtimeWired) return;
  realtimeWired = true;

  // Notificación entrante para el usuario actual
  onSocket('notification:new', async (payload = {}) => {
    setState({ unreadCount: payload.unread ?? 0 });
    try { await refreshBell(); } catch {}
    emitRealtime('notification:new', payload);
    // Toast breve en la campana
    try {
      const list = getState().notifications || [];
      const top = list[0];
      if (top) toast(`Nueva notificación: ${top.title}`, 'info', 3500);
    } catch {}
  });

  // Eventos de ticket — refrescan vistas vivas (lista, detalle, dashboard)
  const forward = (event) => onSocket(event, (payload = {}) => {
    emitRealtime(event, payload);
  });
  forward('ticket:created');
  forward('ticket:updated');
  forward('ticket:assigned');
  forward('ticket:status_changed');
  forward('ticket:commented');
  forward('attachment:added');

  // Reconexión: cuando el socket vuelve, sincroniza contador
  onSocket('connect', async () => { try { await refreshBell(); } catch {} });
}

// Handler global del evento 'gcm:help' (despachado por topbar)
let gcmHelpHandler = null;
if (typeof window !== 'undefined') {
  gcmHelpHandler = () => {
    toast('Ayuda: todavía no hay documentación publicada. Contacta a SAC para soporte.', 'info', 4000);
  };
  window.addEventListener('gcm:help', gcmHelpHandler);
}

// Adaptador: monta vistas respetando layout
function withLayout(view, user) {
  if (!view) return null;
  // Acepta { view, cleanup } (nuevo) o un Node directo (legacy)
  const inner = view.view ?? view;
  const cleanup = typeof view.cleanup === 'function' ? view.cleanup : null;
  const wrapper = renderLayout({ content: inner, user, onLogout });
  
  // Combinar cleanups: del layout + de la vista
  const layoutCleanup = typeof wrapper._gcmLayoutCleanup === 'function' ? wrapper._gcmLayoutCleanup : null;
  if (cleanup || layoutCleanup) {
    wrapper._gcmCleanup = () => {
      if (cleanup) cleanup();
      if (layoutCleanup) layoutCleanup();
    };
  }
  return wrapper;
}

async function dispatch(rawPath, query) {
  const user = getState().user;
  if (rawPath === '/login') {
    const loginResult = await handlers['/login']({ params: {}, query });
    return mount(await Promise.resolve(loginResult.view));
  }
  if (!user) {
    try {
      const me = await api.auth.me();
      setState({ user: me.user });
    } catch {
      return go('/login');
    }
  }
  // matchear
  for (const [pattern, fn] of Object.entries(handlers)) {
    if (pattern === '/login') continue;
    const ps = pattern.split('/').filter(Boolean);
    const xs = rawPath.split('/').filter(Boolean);
    if (ps.length !== xs.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < ps.length; i++) {
      if (ps[i].startsWith(':')) params[ps[i].slice(1)] = decodeURIComponent(xs[i]);
      else if (ps[i] !== xs[i]) { ok = false; break; }
    }
    if (!ok) continue;
    const result = await fn({ params, query, user: getState().user });
    const view = await Promise.resolve(result.view);
    return mount(withLayout(view, getState().user));
  }
  go('/dashboard');
}

function onHashChange() {
  const raw = (location.hash || '#/login').replace(/^#/, '');
  const [path, qs] = raw.split('?');
  const query = Object.fromEntries(new URLSearchParams(qs || ''));
  dispatch(path, query);
}

async function bootstrap() {
  // Rehidratar sesión
  try {
    const me = await api.auth.me();
    setState({ user: me.user });
  } catch {
    setState({ user: null });
  }

  if (!location.hash) location.hash = '#/login';
  onHashChange();
  window.addEventListener('hashchange', onHashChange);

  if (getState().user) {
    try {
      await connectSocket();
      wireRealtime();
      await refreshBell();
    } catch (e) { console.warn('socket:', e); }
  }
}

bootstrap();
