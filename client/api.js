/* Documentado por: Miguel Flores */
/**
 * Determina la URL base de la API a usar: primero VITE_API_BASE_URL si está definida en build,
 * y si no, infiere la URL de Render en producción según el hostname actual.
 * @returns {string} URL base de la API (sin barra final), o cadena vacía para usar rutas relativas
 */
function getApiBase() {
  const raw = typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL
    ? import.meta.env.VITE_API_BASE_URL
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

const BASE = getApiBase();

/**
 * Antepone la URL base de la API a una ruta relativa, si corresponde.
 * @param {string} url - ruta relativa del endpoint (ej. '/api/tickets')
 * @returns {string} URL completa a usar en fetch
 */
function buildUrl(url) {
  if (!BASE) return url;
  return `${BASE}${url}`;
}

/**
 * Convierte una ruta relativa de un asset (ej. avatar, adjunto) en su URL completa hacia el backend.
 * @param {string} path - ruta relativa del asset
 * @returns {string} URL completa del asset, o el valor original si path es falsy
 */
export function assetUrl(path) {
  if (!path) return path;
  return buildUrl(path);
}

const AUTH_BOOTSTRAP_PATHS = ['/api/auth/login', '/api/auth/logout', '/api/auth/me'];

/**
 * Realiza una petición HTTP a la API incluyendo cookies de sesión, serializando el body a JSON
 * (o dejándolo pasar tal cual si es FormData), parseando la respuesta JSON y lanzando un Error
 * enriquecido (status, code) si la respuesta no es exitosa. En un 401 fuera de las rutas de
 * bootstrap de auth, dispara el evento global 'gcm:unauthorized'.
 * @param {string} method - método HTTP (GET, POST, PATCH, DELETE, etc.)
 * @param {string} url - ruta relativa del endpoint
 * @param {Object} [options] - opciones de la petición
 * @param {*} [options.body] - cuerpo de la petición (objeto para JSON, o FormData)
 * @param {Object} [options.headers] - headers adicionales a fusionar
 * @returns {Promise<*>} datos ya parseados de la respuesta (o null si no hay body)
 */
async function request(method, url, options = {}) {
  const opts = {
    method,
    credentials: 'include',
    headers: { 'Accept': 'application/json' },
  };
  if (options.body && !(options.body instanceof FormData)) {
    opts.body = JSON.stringify(options.body);
    opts.headers['Content-Type'] = 'application/json';
  } else if (options.body instanceof FormData) {
    opts.body = options.body;
  }
  if (options.headers) Object.assign(opts.headers, options.headers);

  const res = await fetch(buildUrl(url), opts);
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!res.ok) {
    const msg = data?.error?.message || `Error ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.code = data?.error?.code;
    if (res.status === 401 && typeof window !== 'undefined' && !AUTH_BOOTSTRAP_PATHS.some((p) => url.startsWith(p))) {
      window.dispatchEvent(new CustomEvent('gcm:unauthorized'));
    }
    throw err;
  }
  return data;
}

// Cliente de la API: agrupa por recurso (auth, users, tickets, etc.) los métodos que envuelven
// llamadas a request() con el método HTTP y la ruta correspondientes.
export const api = {
  auth: {
    login:  (body)    => request('POST', '/api/auth/login',  { body }),
    logout: ()        => request('POST', '/api/auth/logout', {}),
    me:     ()        => request('GET',  '/api/auth/me'),
    verifyPassword: (body) => request('POST', '/api/auth/verify-password', { body }),
    setActiveCompany: (companyId) => request('POST', '/api/auth/active-company', { body: { company_id: companyId } }),
    uploadAvatar: (formData) => request('POST', '/api/auth/avatar', { body: formData }),
  },
  users: {
    list:    (q = {})     => request('GET',    '/api/users?' + new URLSearchParams(q)),
    create:  (body)       => request('POST',   '/api/users', { body }),
    get:     (id)         => request('GET',    `/api/users/${id}`),
    update:  (id, body)   => request('PATCH',  `/api/users/${id}`, { body }),
  },
  categories: {
    list:   (all = false) => request('GET', `/api/categories?all=${all ? 'true' : 'false'}`),
    create: (body)        => request('POST', '/api/categories', { body }),
    update: (id, body)    => request('PATCH', `/api/categories/${id}`, { body }),
    delete: (id)          => request('DELETE', `/api/categories/${id}`),
  },
  tickets: {
    list:        (q = {})         => request('GET',  '/api/tickets?' + new URLSearchParams(q)),
    get:         (id)             => request('GET',  `/api/tickets/${id}`),
    create:      (body)           => request('POST', '/api/tickets', { body }),
    update:      (id, body)       => request('PATCH', `/api/tickets/${id}`, { body }),
    assign:      (id, body)       => request('POST', `/api/tickets/${id}/assign`, { body }),
    changeStatus:(id, body)       => request('POST', `/api/tickets/${id}/status`, { body }),
    comment:     (id, body)       => request('POST', `/api/tickets/${id}/comments`, { body }),
    upload:      (id, file)       => request('POST', `/api/tickets/${id}/attachments`, { body: file }),
    downloadUrl: (id, attId)      => `/api/tickets/${id}/attachments/${attId}`,
  },
  notifications: {
    list:        (q = {}) => request('GET', '/api/notifications?' + new URLSearchParams(q)),
    unreadCount: ()        => request('GET', '/api/notifications/unread-count'),
    markRead:    (body)    => request('POST', '/api/notifications/mark-read', { body }),
  },
  stats: {
    dashboard: () => request('GET', '/api/stats/dashboard'),
    me:        () => request('GET', '/api/stats/me'),
  },
  audit: {
    list: (q = {}) => request('GET', '/api/stats/audit?' + new URLSearchParams(q)),
    actionTypes: () => request('GET', '/api/stats/audit/action-types'),
    activeUsers: () => request('GET', '/api/stats/audit/active-users'),
  },
  roles: {
    list: () => request('GET', '/api/roles'),
    get: (role) => request('GET', `/api/roles/${role}`),
    update: (role, body) => request('PATCH', `/api/roles/${role}`, { body }),
    delete: (role, body) => request('DELETE', `/api/roles/${role}`, { body }),
    labels: {
      list: () => request('GET', '/api/role-labels'),
      update: (role, label) => request('PATCH', `/api/role-labels/${role}`, { body: { label } }),
    },
    permissions: {
      remove: (key, body) => request('DELETE', `/api/roles/permissions/${key}`, { body }),
    },
  },
  companies: {
    list:        (q = {})        => request('GET',    '/api/companies?' + new URLSearchParams(q)),
    get:         (id)            => request('GET',    `/api/companies/${id}`),
    create:      (body)          => request('POST',   '/api/companies', { body }),
    update:      (id, body)      => request('PATCH',  `/api/companies/${id}`, { body }),
    remove:      (id)            => request('DELETE', `/api/companies/${id}`),
    members: {
      list:        (companyId, q = {})  => request('GET',    `/api/companies/${companyId}/memberships?` + new URLSearchParams(q)),
      userList:    (userId)             => request('GET',    `/api/users/${userId}/memberships`),
      create:      (userId, body)       => request('POST',   `/api/users/${userId}/memberships`, { body }),
      update:      (userId, memId, body) => request('PATCH', `/api/users/${userId}/memberships/${memId}`, { body }),
      remove:      (userId, memId)      => request('DELETE', `/api/users/${userId}/memberships/${memId}`),
    },
  },
  calendar: {
    list:           (q = {}) => request('GET',    '/api/calendar/events?' + new URLSearchParams(q)),
    schedulableTickets: (q = {}) => request('GET', '/api/calendar/events/schedulable-tickets?' + new URLSearchParams(q)),
    create:         (body)   => request('POST',   '/api/calendar/events', { body }),
    update:         (id, body) => request('PATCH', `/api/calendar/events/${id}`, { body }),
    remove:         (id)     => request('DELETE', `/api/calendar/events/${id}`),
  },
};

