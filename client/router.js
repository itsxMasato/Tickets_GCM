// Hash router simple. Rutas: #/dashboard, #/tickets, #/tickets/new, #/tickets/:id, #/users, #/categories, #/notifications, #/reports
import { api } from './api.js';
import { setState, getState } from './store.js';

const routes = new Map();
let currentCleanup = null;

export function register(pattern, handler) {
  routes.set(pattern, handler);
}

function parseHash() {
  const raw = (location.hash || '#/login').replace(/^#/, '');
  const [path, qs] = raw.split('?');
  const query = Object.fromEntries(new URLSearchParams(qs || ''));
  return { path, query };
}

function match(pattern, path) {
  const ps = pattern.split('/').filter(Boolean);
  const xs = path.split('/').filter(Boolean);
  if (ps.length !== xs.length) return null;
  const params = {};
  for (let i = 0; i < ps.length; i++) {
    if (ps[i].startsWith(':')) params[ps[i].slice(1)] = decodeURIComponent(xs[i]);
    else if (ps[i] !== xs[i]) return null;
  }
  return params;
}

function navigate(hash) {
  if (location.hash === hash) onHashChange();
  else location.hash = hash;
}

export function go(hash) { navigate(hash); }
export function replace(hash) {
  if (location.hash === hash) return;
  history.replaceState(null, '', '#' + hash.replace(/^#/, ''));
  onHashChange();
}

export async function onHashChange() {
  const { path, query } = parseHash();
  const user = getState().user;

  // Rutas públicas
  if (path === '/login') {
    if (user) return navigate('/dashboard');
    return await runHandler('/login', {}, query);
  }

  // Requiere login
  if (!user) {
    try {
      const me = await api.auth.me();
      setState({ user: me.user });
    } catch {
      return navigate('/login');
    }
  }

  // Buscar handler
  for (const [pattern, handler] of routes.entries()) {
    const params = match(pattern, path);
    if (params) {
      return await runHandler(pattern, params, query);
    }
  }
  // 404 → dashboard
  navigate('/dashboard');
}

async function runHandler(pattern, params, query) {
  if (typeof currentCleanup === 'function') {
    try { currentCleanup(); } catch {}
  }
  const handler = routes.get(pattern);
  const result = await handler({ params, query });
  currentCleanup = result?.cleanup || null;
}

export function startRouter() {
  window.addEventListener('hashchange', onHashChange);
  if (!location.hash) location.hash = '#/login';
  onHashChange();
}
