/* Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. */
'use strict';
const firestoreData = require('../firestoreData');

/**
 * Bitácora de auditoría — reescrita sobre Firebase (antes TypeORM).
 *
 * Por qué cambió: con DISABLE_MSSQL=true, la conexión TypeORM fallaba y
 * cada callsite de auditService.logAsync() (9 servicios: tickets, calendar,
 * companies, company-areas, memberships, role-labels, roles, audit.view)
 * dejaba la bitácora vacía. La forma es idéntica — firestoreData.logAudit
 * ya JSON-stringifica old_value/new_value, y listAudit los re-parsea en
 * lectura vía normalizeAudit.
 *
 * API pública (compatible con los 9 callsites existentes):
 *   - log(audit)             → void, fire-and-forget, swallow + log
 *   - logAsync(audit)        → alias de log (no espera el commit)
 *   - list(options)          → { data, total, page, limit, pages,
 *                                 mostFrequentAction, activeUserCount }
 *   - getActionTypes()       → string[]
 *   - getActiveUsers()       → { id, username, full_name, email }[]
 */

async function log(audit) {
  try {
    await firestoreData.logAudit(audit);
  } catch (err) {
    // Mismo comportamiento que la versión anterior: swallow + console.error.
    // No rompemos la mutación del caller si el log falla.
    console.error('[audit] Error al registrar entrada:', err.message);
  }
}

async function logAsync(audit) {
  // Fire-and-forget: el caller (createTicket, assignTicket, etc.) no debe
  // esperar a que la bitácora commitee para devolver al cliente.
  log(audit).catch(() => {});
}

async function list(options = {}) {
  const result = await firestoreData.listAudit({
    page: options.page,
    limit: options.limit,
    user_id: options.user_id,
    action_type: options.action_type,
    date_from: options.date_from,
    date_to: options.date_to,
    search: options.search,
  });
  return {
    ...result,
    pages: Math.ceil(result.total / (result.limit || 50)),
  };
}

async function getActionTypes() {
  return firestoreData.getActionTypes();
}

async function getActiveUsers() {
  return firestoreData.getActiveAuditUsers();
}

module.exports = { log, logAsync, list, getActionTypes, getActiveUsers };
