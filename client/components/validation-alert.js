/* Documentado por: Miguel Flores */
import { h } from '../utils/dom.js';

/**
 * Crea un cartel de alerta con ícono y color según el tipo de mensaje (error,
 * warning, info o success). Devuelve null si no hay mensaje que mostrar.
 * @param {string} message - texto del mensaje a mostrar
 * @param {string} [type='error'] - tipo de alerta: 'error', 'warning', 'info' o 'success'
 * @returns {HTMLElement|null} elemento div con la alerta, o null si no hay mensaje
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
 * Crea un validador de formulario en memoria que guarda errores por nombre de campo
 * y expone métodos para consultarlos y limpiarlos.
 * @returns {Object} objeto validador con métodos setError, getError, getAllErrors,
 * hasErrors, clearAll y clearField
 */
export function createFormValidator() {
  const errors = new Map();
  
  return {
    /**
     * Establece o quita el error de un campo según el valor recibido.
     * @param {string} fieldName - nombre del campo
     * @param {string|null} error - mensaje de error, o null/falsy para limpiarlo
     * @returns {void}
     */
    setError(fieldName, error) {
      if (error) {
        errors.set(fieldName, error);
      } else {
        errors.delete(fieldName);
      }
    },
    
    /**
     * Obtiene el mensaje de error actual de un campo.
     * @param {string} fieldName - nombre del campo
     * @returns {string|null} mensaje de error, o null si no tiene
     */
    getError(fieldName) {
      return errors.get(fieldName) || null;
    },
    
    /**
     * Devuelve todos los mensajes de error actualmente registrados.
     * @returns {Array<string>} lista de mensajes de error
     */
    getAllErrors() {
      return Array.from(errors.values());
    },
    
    /**
     * Indica si el formulario tiene al menos un error registrado.
     * @returns {boolean} true si hay errores
     */
    hasErrors() {
      return errors.size > 0;
    },
    
    /**
     * Elimina todos los errores registrados.
     * @returns {void}
     */
    clearAll() {
      errors.clear();
    },
    
    /**
     * Elimina el error de un campo específico.
     * @param {string} fieldName - nombre del campo
     * @returns {void}
     */
    clearField(fieldName) {
      errors.delete(fieldName);
    }
  };
}

