/* Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. */
import './styles.css';
import { go } from './router.js';
import { setState, getState } from './store.js';
import { api } from './api.js';
import { connectSocket, on as onSocket } from './socket.js';
import { toast } from './utils/toast.js';
import { renderLayout } from './components/layout.js';
import { initializeFirebase } from './firebase.js';
import { init as initRoleLabels, applyRoleLabel } from './utils/role-labels.js';

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
import { renderAudit } from './views/audit.js';
import { renderRoles } from './views/roles.js';
import { renderCalendar } from './views/calendar.js';
import { renderCompanies } from './views/companies.js';

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
  '/audit':         ({ params, query, user }) => ({ view: renderAudit({ params, query, user }) }),
  '/roles':         ({ params, query, user }) => ({ view: renderRoles({ params, query, user }) }),
  '/calendar':      ({ params, query, user }) => ({ view: renderCalendar({ params, query, user }) }),
  '/companies':     ({ params, query, user }) => ({ view: renderCompanies({ params, query, user }) }),
};

const app = document.getElementById('app');

// Flag para mostrar app solo una vez cuando esté lista
let appShown = false;
function showAppWhenReady() {
  if (appShown) return;
  appShown = true;
  
  // Limpiar timeout fallback del HTML
  if (typeof window.clearShowTimeout === 'function') {
    window.clearShowTimeout();
  }
  
  // Usar requestAnimationFrame para asegurar que el DOM se haya renderizado
  requestAnimationFrame(() => {
    const appEl = document.getElementById('app');
    const overlay = document.getElementById('loading-overlay');
    
    if (appEl) appEl.style.display = 'block';
    if (overlay) overlay.classList.add('hidden');
  });
}

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
  void (async () => {
    try {
      await initRoleLabels();
    } catch {}
    try {
      await connectSocket();
      wireRealtime();
    } catch {}
    try {
      await refreshBell();
    } catch {}
  })();
}

async function onLogout() {
  try { await api.auth.logout(); } catch {}
  setState({ user: null, notifications: [], unreadCount: 0 });
  go('/login');
}

async function refreshBell() {
  try {
    const [unreadRes, listRes] = await Promise.allSettled([
      api.notifications.unreadCount(),
      api.notifications.list({ limit: 15 }),
    ]);
    const count = unreadRes.status === 'fulfilled' ? (unreadRes.value?.count ?? 0) : 0;
    const notifications = listRes.status === 'fulfilled' ? (listRes.value?.notifications ?? []) : [];
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

  // Eventos administrativos — refrescan vistas de SAC
  // (usuarios, roles, categorías, dashboard).
  forward('user:created');
  forward('user:updated');
  forward('user:deactivated');
  forward('role:permissions_updated');
  // Renombre de etiqueta de rol. Aplica al cache y lo difunde a las
  // vistas vivas vía gcm:role_label_updated; el forward a gcm:realtime
  // permite que la vista /roles detecte conflictos con cambios locales.
  onSocket('role:label_updated', (payload = {}) => {
    if (payload.role && typeof payload.label === 'string') {
      applyRoleLabel(payload.role, payload.label);
    }
    emitRealtime('role:label_updated', payload);
  });
  forward('category:created');
  forward('category:updated');
  // Multi-tenant: refresca la vista /companies cuando otro platform admin
  // (o una sesión del propio Miguel en otra pestaña) crea/edita empresas,
  // áreas o membresías. Los emits viven en los 3 services correspondientes.
  forward('company:created');
  forward('company:updated');
  forward('company:deleted');
  forward('area:created');
  forward('area:updated');
  forward('area:deleted');
  forward('membership:created');
  forward('membership:updated');
  forward('membership:deleted');

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
  // Acepta { view, cleanup } (nuevo) o un Node directo (legacy).
  // Para el caso legacy (Node), si la vista expone un _gcmCleanup propio
  // (p.ej. listeners de realtime en /roles, /users, /audit), lo heredamos
  // para que mount() pueda limpiarlo en la próxima navegación — antes se
  // perdía y los listeners se duplicaban en cada re-mount.
  const inner = view.view ?? view;
  const innerCleanup = (typeof view.view === 'undefined' && typeof inner?._gcmCleanup === 'function')
    ? inner._gcmCleanup
    : null;
  const cleanup = typeof view.cleanup === 'function' ? view.cleanup : innerCleanup;
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
    mount(await Promise.resolve(loginResult.view));
    showAppWhenReady();
    return;
  }
  if (!user) {
    try {
      const me = await api.auth.me();
      setState({ user: me.user });
    } catch {
      go('/login');
      showAppWhenReady();
      return;
    }
  }
  // Guard de rutas restringidas a SAC. El backend también lo aplica
  // (requireRole('sac') en cada router), pero lo bloqueamos aquí para
  // evitar un 403 visible y para que la UI no muestre estados vacíos
  // a roles sin permiso.
  const SAC_ONLY = new Set(['/users', '/categories', '/roles', '/audit']);
  if (SAC_ONLY.has(rawPath) && getState().user?.role !== 'sac') {
    toast('No tienes permiso para acceder a esa sección.', 'error');
    go('/dashboard');
    showAppWhenReady();
    return;
  }
  // Guard separado para rutas de plataforma. Hoy solo /companies (gestión
  // multi-tenant de Fase 3); si en el futuro /audit u otras se restringen
  // a platform admin, se mueven a este set. Backend lo vuelve a validar
  // con requirePlatformAdmin, así que esto es solo UX (evita el 403 visible).
  const PLATFORM_ADMIN_ONLY = new Set(['/companies']);
  if (PLATFORM_ADMIN_ONLY.has(rawPath) && getState().user?.isPlatformAdmin !== true) {
    toast('No tienes permiso para acceder a esa sección.', 'error');
    go('/dashboard');
    showAppWhenReady();
    return;
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
    mount(withLayout(view, getState().user));
    showAppWhenReady();
    return;
  }
  go('/dashboard');
  showAppWhenReady();
}

function onHashChange() {
  const raw = (location.hash || '#/login').replace(/^#/, '');
  const [path, qs] = raw.split('?');
  const query = Object.fromEntries(new URLSearchParams(qs || ''));
  dispatch(path, query);
}

async function bootstrap() {
  void initializeFirebase().catch((error) => {
    console.warn('[firebase] No se pudo inicializar Firestore:', error);
  });

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
    void (async () => {
      try {
        await initRoleLabels();
      } catch {}
      try {
        await connectSocket();
        wireRealtime();
      } catch {}
      try {
        await refreshBell();
      } catch {}
    })();
  }
}

bootstrap();
