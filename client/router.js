/* Documentado por: Miguel Flores */
import { api } from './api.js';
import { setState, getState } from './store.js';

const routes = new Map();
let currentCleanup = null;

/**
 * Registra un handler para un patrón de ruta (ej. '/tickets/:id') en el router basado en hash.
 * @param {string} pattern - patrón de ruta, con segmentos ':nombre' para parámetros dinámicos
 * @param {Function} handler - función invocada con { params, query } al coincidir la ruta
 * @returns {void}
 */
export function register(pattern, handler) {
  routes.set(pattern, handler);
}

/**
 * Extrae el path y los parámetros de query del hash actual de la URL.
 * @returns {{path: string, query: Object}} path y query parseados del hash
 */
function parseHash() {
  const raw = (location.hash || '#/login').replace(/^#/, '');
  const [path, qs] = raw.split('?');
  const query = Object.fromEntries(new URLSearchParams(qs || ''));
  return { path, query };
}

/**
 * Compara un patrón de ruta contra un path concreto y extrae los parámetros dinámicos si coincide.
 * @param {string} pattern - patrón de ruta (con segmentos ':nombre')
 * @param {string} path - path real a evaluar
 * @returns {(Object|null)} objeto de parámetros extraídos, o null si el patrón no coincide
 */
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

/**
 * Navega a un nuevo hash; si el hash es igual al actual, dispara manualmente el manejo de cambio
 * de ruta (porque el navegador no emite 'hashchange' en ese caso).
 * @param {string} hash - nuevo valor de hash (con o sin '#' inicial)
 * @returns {void}
 */
function navigate(hash) {
  if (location.hash === hash) onHashChange();
  else location.hash = hash;
}

/**
 * Navega a un nuevo hash agregando una entrada al historial.
 * @param {string} hash - nuevo valor de hash a navegar
 * @returns {void}
 */
export function go(hash) { navigate(hash); }
/**
 * Reemplaza el hash actual sin agregar una entrada nueva al historial, y despacha el cambio de ruta.
 * @param {string} hash - nuevo valor de hash a establecer
 * @returns {void}
 */
export function replace(hash) {
  if (location.hash === hash) return;
  history.replaceState(null, '', '#' + hash.replace(/^#/, ''));
  onHashChange();
}

/**
 * Maneja el cambio de hash: exige sesión autenticada (salvo en /login) y ejecuta el handler
 * registrado que coincida con el path actual, o navega a /dashboard si ninguno coincide.
 * @returns {Promise<void>}
 */
export async function onHashChange() {
  const { path, query } = parseHash();
  const user = getState().user;

  if (path === '/login') {
    if (user) return navigate('/dashboard');
    return await runHandler('/login', {}, query);
  }

  if (!user) {
    try {
      const me = await api.auth.me();
      setState({ user: me.user });
    } catch {
      return navigate('/login');
    }
  }

  for (const [pattern, handler] of routes.entries()) {
    const params = match(pattern, path);
    if (params) {
      return await runHandler(pattern, params, query);
    }
  }
  navigate('/dashboard');
}

/**
 * Ejecuta el handler de un patrón de ruta, limpiando primero la vista anterior (currentCleanup)
 * y guardando el cleanup devuelto por la nueva vista.
 * @param {string} pattern - patrón de ruta cuyo handler se ejecuta
 * @param {Object} params - parámetros dinámicos extraídos de la ruta
 * @param {Object} query - parámetros de query string
 * @returns {Promise<void>}
 */
async function runHandler(pattern, params, query) {
  if (typeof currentCleanup === 'function') {
    try { currentCleanup(); } catch {}
  }
  const handler = routes.get(pattern);
  const result = await handler({ params, query });
  currentCleanup = result?.cleanup || null;
}

/**
 * Inicializa el router: registra el listener de 'hashchange', asegura un hash inicial ('#/login'
 * si no hay ninguno) y dispara la primera navegación.
 * @returns {void}
 */
export function startRouter() {
  window.addEventListener('hashchange', onHashChange);
  if (!location.hash) location.hash = '#/login';
  onHashChange();
}

