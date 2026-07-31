/* Documentado por: Miguel Flores */
import { h } from '../utils/dom.js';

/**
 * Crea un input de búsqueda que dispara el callback con debounce (300ms) mientras
 * el usuario escribe, evitando ejecutar la búsqueda en cada tecla.
 * @param {Function} onSearch - callback invocado con el texto de búsqueda ya recortado
 * @param {string} [initialValue=''] - valor inicial del input
 * @returns {HTMLElement} elemento input de búsqueda
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
 * Crea un texto indicador de cuántos resultados se muestran sobre el total,
 * cubriendo los casos de cero resultados y de coincidencia total.
 * @param {number} count - cantidad de resultados mostrados actualmente
 * @param {number} total - cantidad total de resultados disponibles
 * @returns {HTMLElement} elemento span con el conteo de resultados
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

