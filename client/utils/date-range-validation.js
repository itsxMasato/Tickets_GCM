/* Documentado por: Miguel Flores */
/**
 * Valida un rango de fechas: que ambas sean fechas válidas, que "desde" no sea posterior a "hasta",
 * y que el rango no exceda 1 año.
 * @param {string} dateFrom - fecha de inicio del rango
 * @param {string} dateTo - fecha de fin del rango
 * @returns {{valid: boolean, message: (string|null)}} resultado de la validación con mensaje de error si aplica
 */
export function validateDateRange(dateFrom, dateTo) {
  if (!dateFrom || !dateTo) return { valid: true, message: null };
  
  const from = new Date(dateFrom);
  const to = new Date(dateTo);
  
  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    return { valid: false, message: 'Fechas inválidas' };
  }
  
  if (from > to) {
    return { 
      valid: false, 
      message: 'La fecha "Desde" debe ser anterior a "Hasta"'
    };
  }
  
  const diff = to.getTime() - from.getTime();
  const oneYearMs = 365 * 24 * 60 * 60 * 1000;
  if (diff > oneYearMs) {
    return {
      valid: false,
      message: 'El rango de fechas no debe exceder 1 año'
    };
  }
  
  return { valid: true, message: null };
}

/**
 * Formatea un rango de fechas para mostrarlo al usuario en español, contemplando rangos parciales o vacíos.
 * @param {string} dateFrom - fecha de inicio del rango
 * @param {string} dateTo - fecha de fin del rango
 * @returns {string} texto legible del rango de fechas
 */
export function formatDateRange(dateFrom, dateTo) {
  if (!dateFrom && !dateTo) return 'Sin filtro de fechas';
  
  const formatDate = (d) => new Date(d).toLocaleDateString('es-ES');
  
  if (dateFrom && dateTo) {
    return `${formatDate(dateFrom)} a ${formatDate(dateTo)}`;
  }
  
  if (dateFrom) return `Desde ${formatDate(dateFrom)}`;
  if (dateTo) return `Hasta ${formatDate(dateTo)}`;
}

/**
 * Calcula la cantidad de días (inclusive) entre dos fechas.
 * @param {string} dateFrom - fecha de inicio del rango
 * @param {string} dateTo - fecha de fin del rango
 * @returns {(number|null)} cantidad de días del rango, o null si las fechas son inválidas o faltan
 */
export function calculateDays(dateFrom, dateTo) {
  if (!dateFrom || !dateTo) return null;
  
  const from = new Date(dateFrom);
  const to = new Date(dateTo);
  
  if (isNaN(from.getTime()) || isNaN(to.getTime())) return null;
  
  const diff = to.getTime() - from.getTime();
  return Math.ceil(diff / (24 * 60 * 60 * 1000)) + 1;
}

