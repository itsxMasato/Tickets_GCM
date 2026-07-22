/* Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. */
/**
 * Validación de rangos de fechas para filtros.
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
  
  // Validar que no sea más de 1 año
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
 * Formatea un rango de fechas de forma legible.
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
 * Calculates the number of days in a date range.
 */
export function calculateDays(dateFrom, dateTo) {
  if (!dateFrom || !dateTo) return null;
  
  const from = new Date(dateFrom);
  const to = new Date(dateTo);
  
  if (isNaN(from.getTime()) || isNaN(to.getTime())) return null;
  
  const diff = to.getTime() - from.getTime();
  return Math.ceil(diff / (24 * 60 * 60 * 1000)) + 1; // Include both start and end day
}
