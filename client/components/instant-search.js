import { h } from '../utils/dom.js';

/**
 * Crea un campo de búsqueda con debounce para búsqueda en tiempo real.
 * Llama al callback con el texto de búsqueda después de un tiempo sin escribir.
 */
export function instantSearchInput(onSearch, initialValue = '') {
  const input = h('input.input', { 
    type: 'search', 
    placeholder: 'Buscar…',
    value: initialValue
  });
  
  let timeoutId;
  const debounceMs = 300;
  
  input.addEventListener('input', (e) => {
    clearTimeout(timeoutId);
    const value = e.target.value.trim();
    timeoutId = setTimeout(() => {
      onSearch(value);
    }, debounceMs);
  });
  
  return input;
}

/**
 * Crea un contador visual de resultados de búsqueda/filtrado.
 */
export function resultCounter(count, total) {
  if (total === 0) {
    return h('span.text-xs.text-slate-500', {}, 'Sin resultados');
  }
  if (count === total) {
    return h('span.text-xs.text-slate-500', {}, `${count} resultado${count !== 1 ? 's' : ''}`);
  }
  return h('span.text-xs.text-slate-500', {}, `${count} de ${total} resultado${total !== 1 ? 's' : ''}`);
}
