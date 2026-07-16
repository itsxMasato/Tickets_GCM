// Wrapper fetch con manejo de errores y JSON
function getApiBase() {
  const raw = typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL
    ? import.meta.env.VITE_API_BASE_URL
    : '';
  return raw ? raw.replace(/\/$/, '') : '';
}

const BASE = getApiBase();

function buildUrl(url) {
  if (!BASE) return url;
  return `${BASE}${url}`;
}

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
    throw err;
  }
  return data;
}

export const api = {
  auth: {
    login:  (body)    => request('POST', '/api/auth/login',  { body }),
    logout: ()        => request('POST', '/api/auth/logout', {}),
    me:     ()        => request('GET',  '/api/auth/me'),
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
    labels: {
      list: () => request('GET', '/api/role-labels'),
      update: (role, label) => request('PATCH', `/api/role-labels/${role}`, { body: { label } }),
    },
  },
};
