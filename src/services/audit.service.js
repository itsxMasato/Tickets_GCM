'use strict';
const firestoreData = require('../firestoreData');

async function log(audit) {
  try {
    await firestoreData.logAudit(audit);
  } catch (err) {
    console.error('Error al registrar auditoría:', err);
  }
}

async function logAsync(audit) {
  return log(audit);
}

async function list(options = {}) {
  return firestoreData.listAudit(options);
}

async function getActionTypes() {
  return firestoreData.getActionTypes();
}

async function getActiveUsers() {
  return firestoreData.getActiveAuditUsers();
}

module.exports = { log, logAsync, list, getActionTypes, getActiveUsers };
