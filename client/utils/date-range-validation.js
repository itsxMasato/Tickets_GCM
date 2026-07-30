/* Documentado por: Miguel Flores */
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

export function formatDateRange(dateFrom, dateTo) {
  if (!dateFrom && !dateTo) return 'Sin filtro de fechas';
  
  const formatDate = (d) => new Date(d).toLocaleDateString('es-ES');
  
  if (dateFrom && dateTo) {
    return `${formatDate(dateFrom)} a ${formatDate(dateTo)}`;
  }
  
  if (dateFrom) return `Desde ${formatDate(dateFrom)}`;
  if (dateTo) return `Hasta ${formatDate(dateTo)}`;
}

export function calculateDays(dateFrom, dateTo) {
  if (!dateFrom || !dateTo) return null;
  
  const from = new Date(dateFrom);
  const to = new Date(dateTo);
  
  if (isNaN(from.getTime()) || isNaN(to.getTime())) return null;
  
  const diff = to.getTime() - from.getTime();
  return Math.ceil(diff / (24 * 60 * 60 * 1000)) + 1;
}

