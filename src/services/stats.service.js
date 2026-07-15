'use strict';
const firestoreData = require('../firestoreData');

async function dashboard() {
  return firestoreData.getStats();
}

async function forUser(userId, user) {
  return firestoreData.getStatsForUser(userId, user);
}

async function forSupervisor(userId) {
  return firestoreData.getStatsForUser(userId, { id: userId, role: 'supervisor_campo' });
}

async function forJefe(area) {
  return firestoreData.getStatsForUser(null, { role: 'jefe_inmediato', area });
}

module.exports = { dashboard, forUser, forSupervisor, forJefe };
