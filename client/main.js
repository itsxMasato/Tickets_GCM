/* Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. */
import './styles.css';
import { go } from './router.js';
import { setState, getState } from './store.js';
import { api } from './api.js';
import { connectSocket, on as onSocket } from './socket.js';
import { toast } from './utils/toast.js';
import { renderLayout } from './components/layout.js';
import { initializeFirebase, signOutFirebase } from './firebase.js';
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
import { renderProfile } from './views/profile.js';

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
  '/profile':       ({ params, query, user }) => ({ view: renderProfile({ params, query, user }) }),
};

const app = document.getElementById('app');

// Flag para mostrar app solo una vez cuando esté lista
let appShown = false;
let loginSplashActive = false;
function showAppWhenReady() {
  if (!appShown) {
    appShown = true;
  }

  // Limpiar timeout fallback del HTML
  if (typeof window.clearShowTimeout === 'function') {
    window.clearShowTimeout();
  }

  // Usar requestAnimationFrame para asegurar que el DOM se haya renderizado
  requestAnimationFrame(() => {
    const appEl = document.getElementById('app');
    const overlay = document.getElementById('loading-overlay');
    const splash = document.getElementById('login-splash-overlay');

    if (appEl) {
      appEl.style.display = 'block';
      appEl.style.visibility = window.__loginSplashVisible ? 'hidden' : 'visible';
    }
    if (overlay) overlay.classList.add('hidden');
    if (splash && !window.__loginSplashVisible) {
      splash.style.display = 'none';
      splash.classList.remove('active');
    }
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
  // El splash de bienvenida dura mínimo 5s, incluso si la carga es más
  // rápida. La animación del splash dura ~1.5s; los 3.5s restantes son
  // tiempo de respiración para que el cambio de contexto no se sienta abrupto.
  // El dashboard se monta detrás (con app.style.visibility = 'hidden' que
  // pone el script inline de index.html) y se hace visible recién cuando
  // hideLoginSplash se llama.
  const splashShownAt = Date.now();
  const MIN_SPLASH_MS = 5000;

  if (typeof window.showLoginSplash === 'function') {
    window.showLoginSplash();
  }
  go('/dashboard');

  void (async () => {
    try {
      await Promise.allSettled([
        initRoleLabels(),
        connectSocket().then(wireRealtime),
        refreshBell(),
      ]);
    } catch {}

    const elapsed = Date.now() - splashShownAt;
    const remaining = Math.max(0, MIN_SPLASH_MS - elapsed);

    // Fade out corto para que la transición no sea un corte seco.
    setTimeout(() => {
      if (typeof window.hideLoginSplash === 'function') {
        window.hideLoginSplash();
      }
      loginSplashActive = false;
    }, remaining);
  })();
}

async function onLogout() {
  try { await api.auth.logout(); } catch {}
  await signOutFirebase();
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
    window.open('/manual/index.html', '_blank', 'noopener');
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

function normalizePath(rawPath) {
  if (!rawPath) return '/login';
  let normalized = rawPath.startsWith('/') ? rawPath : '/' + rawPath;
  normalized = normalized.replace(/\/+/g, '/');
  if (normalized === '/') return '/login';
  if (normalized.length > 1 && normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}

async function dispatch(rawPath, query) {
  const path = normalizePath(rawPath);
  const user = getState().user;
  if (path === '/login') {
    if (user) {
      go('/dashboard');
      showAppWhenReady();
      return;
    }
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
  if (SAC_ONLY.has(path) && getState().user?.role !== 'sac') {
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
  // Permitir acceso a /companies para `sac` además de platform admin.
  if (PLATFORM_ADMIN_ONLY.has(path) && !(getState().user?.isPlatformAdmin === true || getState().user?.role === 'sac')) {
    toast('No tienes permiso para acceder a esa sección.', 'error');
    go('/dashboard');
    showAppWhenReady();
    return;
  }
  // matchear
  for (const [pattern, fn] of Object.entries(handlers)) {
    if (pattern === '/login') continue;
    const ps = pattern.split('/').filter(Boolean);
    const xs = path.split('/').filter(Boolean);
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
  if (user) {
    go('/dashboard');
  } else {
    go('/login');
  }
  showAppWhenReady();
}

function onHashChange() {
  const raw = (location.hash || '#/login').replace(/^#/, '');
  const [path, qs] = raw.split('?');
  const query = Object.fromEntries(new URLSearchParams(qs || ''));
  dispatch(path, query);
}

// El selector de empresa (topbar) dispara esto tras cambiar la empresa
// activa: re-despacha la ruta actual (mismo path, re-monta la vista) para
// que listas/dashboard refresquen con el nuevo scope — sin reload de
// página ni perder la sesión. Mismo patrón que gcm:help/gcm:refresh.
window.addEventListener('gcm:company-switched', () => onHashChange());

// Interceptor global de 401: si CUALQUIER llamada a la API devuelve 401
// (sesión expirada, cookie perdida, servidor reiniciado) después del login
// inicial, la app quedaba en la página actual con requests fallando en
// silencio — nada le avisaba al usuario que ya no estaba autenticado hasta
// que intentaba algo y veía un error suelto. api.js dispara este evento en
// cualquier 401 fuera de los endpoints de login/logout. getState().user
// como guarda evita reaccionar más de una vez si llegan varios 401 en
// ráfaga (peticiones en paralelo ya en vuelo).
window.addEventListener('gcm:unauthorized', () => {
  if (!getState().user) return;
  setState({ user: null, notifications: [], unreadCount: 0 });
  toast('Tu sesión expiró. Iniciá sesión de nuevo.', 'warn');
  go('/login');
});

async function bootstrap() {
  void initializeFirebase().catch((error) => {
    console.warn('[firebase] No se pudo inicializar Firestore:', error);
  });

  // Cada apertura del sitio exige login explícito: no restauramos sesión
  // desde una cookie/token existente, sin importar el hash previo.
  setState({ user: null });
  location.hash = '#/login';
  onHashChange();
  window.addEventListener('hashchange', onHashChange);
}

bootstrap();
