/**
 * Utilidades para sincronizar filtros con la URL (query string).
 * Permite que los filtros sean persistentes y compartibles.
 */

export function setFilterInUrl(filterName, value) {
  const current = new URLSearchParams(window.location.hash.split('?')[1] || '');
  if (value && value !== '') {
    current.set(filterName, value);
  } else {
    current.delete(filterName);
  }
  
  const path = window.location.hash.split('?')[0];
  const newHash = path + (current.toString() ? `?${current.toString()}` : '');
  history.replaceState(null, '', newHash);
}

export function clearFiltersInUrl() {
  const path = window.location.hash.split('?')[0];
  history.replaceState(null, '', path);
}

export function getFilterFromUrl(filterName, defaultValue = '') {
  const params = new URLSearchParams(window.location.hash.split('?')[1] || '');
  return params.get(filterName) || defaultValue;
}

export function getAllFiltersFromUrl() {
  const params = new URLSearchParams(window.location.hash.split('?')[1] || '');
  const filters = {};
  for (const [key, value] of params.entries()) {
    filters[key] = value;
  }
  return filters;
}

/**
 * Sincroniza cambios de filtros hacia la URL de forma automática.
 * Devuelve una función cleanup para desuscribirse.
 */
export function autoSyncFiltersToUrl(filterElements) {
  const handlers = {};
  
  for (const [name, el] of Object.entries(filterElements)) {
    const handler = () => {
      const value = el.value || '';
      setFilterInUrl(name, value);
    };
    
    el.addEventListener('change', handler);
    handlers[name] = { handler, el };
  }
  
  return () => {
    for (const { handler, el } of Object.values(handlers)) {
      el.removeEventListener('change', handler);
    }
  };
}
