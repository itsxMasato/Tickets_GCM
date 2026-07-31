/* Documentado por: Miguel Flores */
/**
 * Establece o elimina un parámetro de filtro en el query string del hash actual, sin recargar la vista.
 * @param {string} filterName - nombre del parámetro de filtro
 * @param {string} value - valor a asignar; si es vacío o falsy, el parámetro se elimina
 * @returns {void}
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

/**
 * Elimina todos los parámetros de filtro del query string del hash actual, dejando solo la ruta.
 * @returns {void}
 */
export function clearFiltersInUrl() {
  const path = window.location.hash.split('?')[0];
  history.replaceState(null, '', path);
}

/**
 * Lee el valor de un parámetro de filtro desde el query string del hash actual.
 * @param {string} filterName - nombre del parámetro de filtro a leer
 * @param {string} [defaultValue] - valor a devolver si el parámetro no existe
 * @returns {string} valor del filtro o el valor por defecto
 */
export function getFilterFromUrl(filterName, defaultValue = '') {
  const params = new URLSearchParams(window.location.hash.split('?')[1] || '');
  return params.get(filterName) || defaultValue;
}

/**
 * Devuelve todos los parámetros de filtro presentes en el query string del hash actual como objeto plano.
 * @returns {Object} mapa de nombre de filtro a valor
 */
export function getAllFiltersFromUrl() {
  const params = new URLSearchParams(window.location.hash.split('?')[1] || '');
  const filters = {};
  for (const [key, value] of params.entries()) {
    filters[key] = value;
  }
  return filters;
}

/**
 * Sincroniza automáticamente un conjunto de elementos de filtro (inputs/selects) con el query string de la URL,
 * escuchando sus eventos 'change'.
 * @param {Object<string, HTMLElement>} filterElements - mapa de nombre de filtro a elemento del formulario
 * @returns {Function} función de limpieza que remueve todos los listeners agregados
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

