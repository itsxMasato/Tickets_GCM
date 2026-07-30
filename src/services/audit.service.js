/* Documentado por: Miguel Flores */
'use strict'
const firestoreData = require('../firestoreData');

async function log(audit) {
  try {
    await firestoreData.logAudit(audit);
  } catch (err) {
    console.error('[audit] Error al registrar entrada:', err.message);
  }
}

async function logAsync(audit) {
  log(audit).catch(() => {});
}

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

async function getActionTypes() {
  return firestoreData.getActionTypes();
}

async function getActiveUsers() {
  return firestoreData.getActiveAuditUsers();
}

module.exports = { log, logAsync, list, getActionTypes, getActiveUsers };

