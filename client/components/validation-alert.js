import { h } from '../utils/dom.js';

/**
 * Crea un elemento de alerta para mostrar errores de validación.
 */
export function validationAlert(message, type = 'error') {
  if (!message) return null;
  
  const icons = {
    'error': '⚠️',
    'warning': '⚡',
    'info': 'ℹ️',
    'success': '✓'
  };
  
  const bgColors = {
    'error': 'bg-red-50 border-red-200',
    'warning': 'bg-yellow-50 border-yellow-200',
    'info': 'bg-blue-50 border-blue-200',
    'success': 'bg-green-50 border-green-200'
  };
  
  const textColors = {
    'error': 'text-red-800',
    'warning': 'text-yellow-800',
    'info': 'text-blue-800',
    'success': 'text-green-800'
  };
  
  return h(`div.flex.items-center.gap-2.p-3.rounded.border.${bgColors[type]}`, {}, [
    h(`span.text-lg`, {}, icons[type]),
    h(`span.text-sm.${textColors[type]}`, {}, message),
  ]);
}

/**
 * Crea un validador de formulario inline que valida mientras el usuario escribe/selecciona.
 */
export function createFormValidator() {
  const errors = new Map();
  
  return {
    /**
     * Añade o actualiza un error para un campo.
     */
    setError(fieldName, error) {
      if (error) {
        errors.set(fieldName, error);
      } else {
        errors.delete(fieldName);
      }
    },
    
    /**
     * Obtiene el error para un campo.
     */
    getError(fieldName) {
      return errors.get(fieldName) || null;
    },
    
    /**
     * Obtiene todos los errores.
     */
    getAllErrors() {
      return Array.from(errors.values());
    },
    
    /**
     * Verifica si hay errores.
     */
    hasErrors() {
      return errors.size > 0;
    },
    
    /**
     * Limpia todos los errores.
     */
    clearAll() {
      errors.clear();
    },
    
    /**
     * Limpia el error de un campo específico.
     */
    clearField(fieldName) {
      errors.delete(fieldName);
    }
  };
}
