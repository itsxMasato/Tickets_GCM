/* Documentado por: Miguel Flores */
import { h } from '../utils/dom.js';

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

export function resultCounter(count, total) {
  if (total === 0) {
    return h('span.text-xs.text-slate-500', {}, 'Sin resultados');
  }
  if (count === total) {
    return h('span.text-xs.text-slate-500', {}, `${count} resultado${count !== 1 ? 's' : ''}`);
  }
  return h('span.text-xs.text-slate-500', {}, `${count} de ${total} resultado${total !== 1 ? 's' : ''}`);
}

