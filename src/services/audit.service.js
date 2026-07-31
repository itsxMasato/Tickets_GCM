/* Documentado por: Miguel Flores */
'use strict'
const firestoreData = require('../firestoreData');

/**
 * Registra una entrada de auditoría en Firestore. Absorbe cualquier error para no interrumpir el flujo que la invoca.
 * @param {Object} audit - datos de la entrada de auditoría (usuario, acción, entidad, etc.)
 * @returns {Promise<void>}
 */
async function log(audit) {
  try {
    await firestoreData.logAudit(audit);
  } catch (err) {
    console.error('[audit] Error al registrar entrada:', err.message);
  }
}

/**
 * Dispara el registro de auditoría sin esperar su resolución (fire-and-forget), ignorando errores.
 * @param {Object} audit - datos de la entrada de auditoría
 * @returns {Promise<void>}
 */
async function logAsync(audit) {
  log(audit).catch(() => {});
}

/**
 * Lista entradas de auditoría paginadas aplicando filtros opcionales (usuario, tipo de acción, rango de fechas, búsqueda).
 * @param {Object} [options] - filtros y paginación (cursor, limit, user_id, action_type, date_from, date_to, search, requester)
 * @returns {Promise<Object>} resultado paginado con el total de páginas calculado
 */
async function list(options = {}) {
  const result = await firestoreData.listAudit({
    cursor: options.cursor,
    limit: options.limit,
    user_id: options.user_id,
    action_type: options.action_type,
    date_from: options.date_from,
    date_to: options.date_to,
    search: options.search,
    requester: options.requester,
  });
  return {
    ...result,
    pages: result.total == null ? null : Math.ceil(result.total / (result.limit || 50)),
  };
}

/**
 * Obtiene la lista de tipos de acción distintos presentes en el historial de auditoría.
 * @returns {Promise<Array>} tipos de acción disponibles
 */
async function getActionTypes() {
  return firestoreData.getActionTypes();
}

/**
 * Obtiene la lista de usuarios que tienen registros de auditoría (usuarios activos en el historial).
 * @returns {Promise<Array>} usuarios activos en la auditoría
 */
async function getActiveUsers() {
  return firestoreData.getActiveAuditUsers();
}

module.exports = { log, logAsync, list, getActionTypes, getActiveUsers };

