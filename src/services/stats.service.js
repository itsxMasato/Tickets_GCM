/* Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. */
'use strict';
const firestoreData = require('../firestoreData');

/**
 * Estadísticas — reescritas sobre Firebase (antes TypeORM).
 *
 * Por qué cambió: con DISABLE_MSSQL=true, getRepository(Ticket) fallaba y
 * el dashboard cliente mostraba 0s en todos los KPIs.
 *
 * Estrategia: delegamos en firestoreData.getStats() y getStatsForUser(),
 * que ya existen y están optimizados (countGroupByValues server-side, NO
 * carga de tickets en memoria). Sobre el resultado, completamos los campos
 * de `totals` que el cliente espera (recibido, asignado, en_proceso,
 * solucionado, reabierto, urgent, closed_today) y derivamos by_assignee
 * para jefe, que getStatsForUser ya devuelve pero el cliente lo quiere
 * poblado.
 *
 * API pública (compatible con stats.routes.js):
 *   - dashboard()                  → SAC global
 *   - forUser(userId, user)        → admin_area | supervisor | jefe
 *   - forSupervisor(userId)        → wrapper para supervisor_campo
 *   - forJefe(area)                → wrapper para jefe_inmediato
 */

// ─────────────────────────────────────────────────────────────────────────
// Enriquecimiento de `totals` — getStats/getStatsForUser no devuelven todos
// los campos que el cliente espera. Una sola query liviana a `tickets` con
// sólo los campos necesarios llena los huecos.
// ─────────────────────────────────────────────────────────────────────────
const TICKET_TOTALS_FIELDS = ['status', 'priority', 'closed_at'];

async function enrichTotals(baseTotals) {
  // Si getStats/getStatsForUser ya proveyó todo lo que necesita el cliente,
  // evitamos la query extra.
  if (
    baseTotals.recibido != null
    && baseTotals.asignado != null
    && baseTotals.en_proceso != null
    && baseTotals.solucionado != null
    && baseTotals.reabierto != null
    && baseTotals.urgent != null
    && baseTotals.closed_today != null
  ) {
    return baseTotals;
  }
  const tickets = await firestoreData.queryCollection('tickets', [], {
    select: TICKET_TOTALS_FIELDS,
    limit: 5000, // acotamos; si la empresa crece, se optimiza con countGroupByValues
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

// ─────────────────────────────────────────────────────────────────────────
// dashboard() — solo SAC
// ─────────────────────────────────────────────────────────────────────────
async function dashboard() {
  const base = await firestoreData.getStats();
  const totals = await enrichTotals(base.totals);

  // by_assignee — getStats() no lo devuelve, lo derivamos con una query
  // acotada. Se cachea por usuario para que el cliente tenga nombres.
  const tickets = await firestoreData.queryCollection(
    'tickets',
    [],
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

// ─────────────────────────────────────────────────────────────────────────
// forUser(userId, user) — admin_area | supervisor | jefe
// ─────────────────────────────────────────────────────────────────────────
async function forUser(userId, user) {
  const base = await firestoreData.getStatsForUser(userId, user);
  if (!base || !base.totals) return base || {};

  // getStatsForUser usa 'resolved'/'reopened'/'solved' para algunos roles;
  // el cliente espera nombres canónicos en español.
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

async function forSupervisor(userId) {
  return forUser(userId, { id: userId, role: 'supervisor_campo' });
}

async function forJefe(area) {
  return forUser(null, { role: 'jefe_inmediato', area });
}

module.exports = { dashboard, forUser, forSupervisor, forJefe };
