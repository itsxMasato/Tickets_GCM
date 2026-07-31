/* Documentado por: Miguel Flores */
'use strict'
const firestoreData = require('../firestoreData');

const TICKET_TOTALS_FIELDS = ['status', 'priority', 'closed_at'];

/**
 * Completa los totales de tickets faltantes (por estado, urgencia, cerrados hoy) consultando la colección de tickets cuando el objeto base no los trae ya calculados.
 * @param {Object} baseTotals - totales ya calculados, posiblemente incompletos
 * @returns {Promise<Object>} totales completos
 */
async function enrichTotals(baseTotals) {
  if (baseTotals.recibido != null
  && baseTotals.asignado != null
  && baseTotals.en_proceso != null
  && baseTotals.solucionado != null
  && baseTotals.reabierto != null
  && baseTotals.urgent != null
  && baseTotals.closed_today != null) {
    return baseTotals;
  }
  const tickets = await firestoreData.queryCollection('tickets', [], {
    select: TICKET_TOTALS_FIELDS,
    limit: 5000,
  });
  const enriched = {
    ...baseTotals,
    recibido: baseTotals.recibido ?? tickets.filter((t) => t.status === 'recibido').length,
    asignado: baseTotals.asignado ?? tickets.filter((t) => t.status === 'asignado').length,
    en_proceso: baseTotals.en_proceso ?? tickets.filter((t) => t.status === 'en_proceso').length,
    solucionado: baseTotals.solucionado ?? tickets.filter((t) => t.status === 'solucionado').length,
    reabierto: baseTotals.reabierto ?? tickets.filter((t) => t.status === 'reabierto').length,
    urgent: baseTotals.urgent ?? tickets.filter((t) => t.priority === 'urgente').length,
  };
  if (baseTotals.closed_today == null) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    enriched.closed_today = tickets.filter((t) => {
      if (!t.closed_at) return false;
      const c = new Date(String(t.closed_at).replace(' ', 'T'));
      return c >= today && c < tomorrow;
    }).length;
  }
  return enriched;
}

const EMPTY_DASHBOARD = {
  totals: { total: 0, open: 0, closed: 0, resolved: 0, reopened: 0, recibido: 0, asignado: 0, en_proceso: 0, solucionado: 0, reabierto: 0, urgent: 0, closed_today: 0 },
  avg_resolution_hours: 0,
  by_status: [],
  by_priority: [],
  by_area: [],
  by_assignee: [],
  last_30_days: [],
  top_categories: [],
};

/**
 * Arma el dashboard general de estadísticas (totales, promedios, distribución por estado/prioridad/área/asignado, histórico e incidencias por categoría), acotado a la empresa activa del solicitante salvo que sea admin de plataforma.
 * @param {Object} [requester] - usuario que solicita el dashboard, usado para determinar el alcance por empresa
 * @returns {Promise<Object>} datos completos del dashboard
 */
async function dashboard(requester = null) {
  if (requester && !requester.isPlatformAdmin && requester.activeCompanyId == null) {
    return EMPTY_DASHBOARD;
  }
  const companyId = requester && !requester.isPlatformAdmin ? requester.activeCompanyId : null;
  const base = await firestoreData.getStats(companyId);
  const totals = await enrichTotals(base.totals);

  const companyClause = companyId != null ? [['company_id', '==', companyId]] : [];
  const tickets = await firestoreData.queryCollection(
    'tickets',
    companyClause,
    { select: ['assigned_to'], limit: 5000 }
  );
  const byAssigneeMap = tickets.reduce((acc, t) => {
    if (!t.assigned_to) return acc;
    const id = String(t.assigned_to);
    acc[id] = (acc[id] || 0) + 1;
    return acc;
  }, {});
  const byAssigneeIds = Object.keys(byAssigneeMap);
  const users = await firestoreData.cacheById('users', byAssigneeIds);
  const by_assignee = Object.entries(byAssigneeMap)
    .map(([id, c]) => ({
      id: Number(id) || id,
      full_name: users[id]?.full_name || null,
      area: users[id]?.area || '',
      avatar_url: users[id]?.avatar_url || null,
      c,
    }))
    .sort((a, b) => b.c - a.c);

  return {
    totals,
    avg_resolution_hours: base.avg_resolution_hours,
    by_status: base.by_status,
    by_priority: base.by_priority,
    by_area: base.by_area,
    by_assignee,
    last_30_days: base.last_30_days,
    top_categories: base.top_categories,
  };
}

/**
 * Obtiene las estadísticas de tickets correspondientes a un usuario/rol específico, completando los totales de solucionados, reabiertos y por cerrar.
 * @param {String|Number} userId - id del usuario (puede ser null según el rol, ej. jefe_inmediato por área)
 * @param {Object} user - contexto del usuario/rol para el cual se calculan las estadísticas
 * @returns {Promise<Object>} estadísticas del usuario/rol
 */
async function forUser(userId, user) {
  const base = await firestoreData.getStatsForUser(userId, user);
  if (!base || !base.totals)
    return base || {};

  const totals = await enrichTotals({
    ...base.totals,
    solucionado: base.totals.solucionado ?? base.totals.solved ?? null,
    reabierto: base.totals.reabierto ?? base.totals.reopened ?? null,
    por_cerrar: base.totals.por_cerrar ?? (
      (base.totals.solucionado || base.totals.solved || 0)
      + (base.totals.reabierto || base.totals.reopened || 0)
    ),
  });
  return { ...base, totals };
}

/**
 * Obtiene las estadísticas de tickets de un supervisor de campo específico.
 * @param {String|Number} userId - id del supervisor de campo
 * @param {Object} [requester] - usuario que solicita las estadísticas, usado para el alcance por empresa
 * @returns {Promise<Object>} estadísticas del supervisor
 */
async function forSupervisor(userId, requester = null) {
  return forUser(userId, { id: userId, role: 'supervisor_campo', activeCompanyId: requester?.activeCompanyId ?? null, isPlatformAdmin: requester?.isPlatformAdmin ?? false });
}

/**
 * Obtiene las estadísticas de tickets de un jefe inmediato, acotadas al área que supervisa.
 * @param {String} area - área supervisada por el jefe inmediato
 * @param {Object} [requester] - usuario que solicita las estadísticas, usado para el alcance por empresa
 * @returns {Promise<Object>} estadísticas del área
 */
async function forJefe(area, requester = null) {
  return forUser(null, { role: 'jefe_inmediato', area, activeCompanyId: requester?.activeCompanyId ?? null, isPlatformAdmin: requester?.isPlatformAdmin ?? false });
}

module.exports = { dashboard, forUser, forSupervisor, forJefe };

