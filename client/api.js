/* Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. */
// Wrapper fetch con manejo de errores y JSON
function getApiBase() {
  const raw = typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL
    ? import.meta.env.VITE_API_BASE_URL
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

const BASE = getApiBase();

function buildUrl(url) {
  if (!BASE) return url;
  return `${BASE}${url}`;
}

// assetUrl — igual que buildUrl pero exportado para armar <img src> de
// archivos servidos por el backend (fotos de perfil). Necesario porque en
// producción el frontend (Netlify) y el backend (Render) son orígenes
// distintos: una ruta relativa como "/uploads/avatars/x.jpg" resolvería
// contra Netlify y rompería la imagen.
export function assetUrl(path) {
  if (!path) return path;
  return buildUrl(path);
}

// Rutas donde un 401 es el resultado ESPERADO del flujo (credenciales
// invalidas al loguear, o el chequeo de sesion en frio al arrancar la app) —
// no deben disparar el interceptor global, o el propio login rebotaria a
// si mismo en un loop.
const AUTH_BOOTSTRAP_PATHS = ['/api/auth/login', '/api/auth/logout', '/api/auth/firebase', '/api/auth/resolve-login', '/api/auth/me'];

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

export const api = {
  auth: {
    login:  (body)    => request('POST', '/api/auth/login',  { body }),
    logout: ()        => request('POST', '/api/auth/logout', {}),
    me:     ()        => request('GET',  '/api/auth/me'),
    verifyPassword: (body) => request('POST', '/api/auth/verify-password', { body }),
    // Resuelve un username o email al email canónico registrado en Firebase Auth.
    // El login view lo llama antes de signInWithEmailAndPassword para soportar
    // tanto username corto ("Miguel") como email real ("miguel@gmail.com").
    resolveLogin: (body) => request('POST', '/api/auth/resolve-login', { body }),
    // Canje de ID token de Firebase Auth por sesión local (cookie connect.sid).
    // Usado en producción cuando el frontend está en Netlify y el backend en Render.
    firebase: (body)  => request('POST', '/api/auth/firebase', { body }),
    // Cambia la empresa activa de la sesión (selector de empresa en el topbar,
    // para usuarios con más de una membresía).
    setActiveCompany: (companyId) => request('POST', '/api/auth/active-company', { body: { company_id: companyId } }),
    // Sube/reemplaza la foto de perfil propia. `formData` ya debe traer el
    // archivo bajo el campo "file" (mismo convenio que tickets.upload).
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
  // Empresas (multi-tenant). Solo platform admin opera el CRUD; el resto
  // ve solo las empresas donde tiene membresía activa (filtro del backend).
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
