// Cache de usuarios activos para vistas que sólo necesitan contar
// (KPI strip de /roles) o derivar info de rol (panel de diff de /roles).
// Se llena en load() (vía api.users.list) y se mantiene sincronizado
// con los eventos de socket user:created/updated/deactivated.
//
// La fuente de verdad sigue siendo el backend: la vista /users hace su
// propio fetch y mantiene su lista, y la vista /ticket/:id hace lo
// propio para el dropdown de asignación. Este cache es OPTIMIZACIÓN +
// reactividad para los consumidores que sólo quieren un count.

// ── Estado interno ──────────────────────────────────────────────────────────
let list = [];                  // usuarios activos actuales
let loaded = false;             // ¿hemos hecho un fetch inicial?
let loading = null;             // promesa de fetch en curso (evita dobles calls)
const subscribers = new Set();  // handlers a invocar en cada cambio

function notify() {
  for (const fn of subscribers) {
    try { fn({ users: list.slice(), reason: 'update' }); } catch (e) { console.warn('[users-cache] subscriber error', e); }
  }
}

// ── API pública ────────────────────────────────────────────────────────────

// Carga (o recarga) la lista de usuarios activos. Devuelve una promesa
// con la lista. Llamar a load() múltiples veces es seguro: si hay un
// fetch en curso, devuelve esa misma promesa.
export function load() {
  if (loading) return loading;
  loading = (async () => {
    try {
      const res = await apiCall();
      list = Array.isArray(res?.users) ? res.users : [];
      loaded = true;
      notify();
      return list.slice();
    } catch (e) {
      // No propagamos: los consumidores pueden usar get() y obtener [].
      // El siguiente load() lo reintentará.
      console.warn('[users-cache] load falló:', e.message);
      return list.slice();
    } finally {
      loading = null;
    }
  })();
  return loading;
}

async function apiCall() {
  // Import dinámico para evitar ciclo: este módulo no depende de api.js
  // arriba del archivo; si se importa desde main.js antes de que api.js
  // esté listo, igual funciona. (En la práctica, ambos se importan desde
  // la misma cadena, pero el dinámico lo hace explícito.)
  const mod = await import('../api.js');
  return mod.api.users.list({ active: 1 });
}

export function get() {
  return list.slice();
}

export function isLoaded() {
  return loaded;
}

export function countByRole(role) {
  return list.filter((u) => u.role === role).length;
}

// Suscripción a cambios. El handler se invoca con { users, reason }.
// Devuelve una función de cleanup (idempotente).
export function subscribe(handler) {
  subscribers.add(handler);
  // Entrega inicial si ya hay datos (evita un frame vacío).
  if (loaded) {
    try { handler({ users: list.slice(), reason: 'initial' }); } catch {}
  }
  return () => subscribers.delete(handler);
}

// ── Suscripción al canal realtime ──────────────────────────────────────────
// Escuchamos el mismo evento que main.js ya redirige a 'gcm:realtime'.
// Mantenemos el cache en sincronía: cualquier cambio de usuario invalida
// la lista y notifica. Decisiones:
//  - user:created → recargamos (el payload trae el user nuevo, pero
//    recargar evita depender del shape exacto).
//  - user:updated → si cambia active, role o area, recargar. Para
//    cambios cosméticos (full_name, email) también recargamos por
//    simplicidad — son poco frecuentes.
//  - user:deactivated → recargar (el usuario puede seguir existiendo
//    pero ya no entra en active=1).
export function startRealtimeSync() {
  if (typeof window === 'undefined') return () => {};
  const handler = (e) => {
    const t = e.detail?.event;
    if (t === 'user:created' || t === 'user:updated' || t === 'user:deactivated') {
      // fire-and-forget; load() es seguro contra re-entry.
      load();
    }
  };
  window.addEventListener('gcm:realtime', handler);
  return () => window.removeEventListener('gcm:realtime', handler);
}

// API de objeto: reexporta las funciones bajo un namespace `usersCache`.
// Los consumidores (p.ej. views/roles.js) prefieren el estilo namespaced
// `usersCache.load()` / `usersCache.get()` / `usersCache.countByRole()`
// sobre imports sueltos. Mantener ambos contratos: el módulo es
// importable como `import { usersCache }` o `import { load, get, ... }`.
export const usersCache = {
  load,
  get,
  isLoaded,
  countByRole,
  subscribe,
  startRealtimeSync,
};
