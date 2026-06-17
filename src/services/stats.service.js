'use strict';
const { getDb } = require('../db/connection');
const { hoursBetween } = require('../utils/time');

function dashboard() {
  const db = getDb();
  const byStatus = db
    .prepare(`SELECT status, COUNT(*) AS c FROM tickets GROUP BY status`)
    .all();
  const byAssignee = db
    .prepare(`SELECT u.id, u.full_name, u.area, COUNT(t.id) AS c
              FROM users u
              LEFT JOIN tickets t ON t.assigned_to = u.id
              WHERE u.active = 1 AND u.role = 'admin_area'
              GROUP BY u.id
              ORDER BY c DESC
              LIMIT 10`)
    .all();
  const byPriority = db
    .prepare(`SELECT priority, COUNT(*) AS c FROM tickets GROUP BY priority`)
    .all();
  const byArea = db
    .prepare(`SELECT COALESCE(area, 'sin_area') AS area, COUNT(*) AS c FROM tickets GROUP BY area`)
    .all();

  const closedAvg = db
    .prepare(`SELECT created_at, closed_at FROM tickets WHERE closed_at IS NOT NULL`)
    .all();
  let avgHours = 0;
  if (closedAvg.length) {
    const total = closedAvg.reduce((acc, t) => acc + (hoursBetween(t.created_at, t.closed_at) || 0), 0);
    avgHours = total / closedAvg.length;
  }

  const last30 = db
    .prepare(`SELECT date(created_at) AS day, COUNT(*) AS c
              FROM tickets
              WHERE created_at >= datetime('now', '-30 days')
              GROUP BY day
              ORDER BY day ASC`)
    .all();

  const topCategories = db
    .prepare(`SELECT c.id, c.name, COUNT(t.id) AS c
              FROM categories c
              LEFT JOIN tickets t ON t.category_id = c.id
              GROUP BY c.id
              ORDER BY c DESC
              LIMIT 5`)
    .all();

  const totals = db
    .prepare(`SELECT
                COUNT(*) AS total,
                SUM(CASE WHEN status NOT IN ('cerrado') THEN 1 ELSE 0 END) AS open,
                SUM(CASE WHEN status = 'cerrado' THEN 1 ELSE 0 END) AS closed,
                SUM(CASE WHEN status = 'solucionado' THEN 1 ELSE 0 END) AS resolved,
                SUM(CASE WHEN status = 'reabierto' THEN 1 ELSE 0 END) AS reopened
              FROM tickets`)
    .get();

  return {
    totals,
    avg_resolution_hours: avgHours,
    by_status: byStatus,
    by_assignee: byAssignee,
    by_priority: byPriority,
    by_area: byArea,
    last_30_days: last30,
    top_categories: topCategories,
  };
}

function forUser(userId, user) {
  const db = getDb();
  const totals = db
    .prepare(`SELECT
                COUNT(*) AS total,
                SUM(CASE WHEN status = 'en_proceso' THEN 1 ELSE 0 END) AS en_proceso,
                SUM(CASE WHEN status = 'solucionado' THEN 1 ELSE 0 END) AS solucionado,
                SUM(CASE WHEN status = 'asignado' THEN 1 ELSE 0 END) AS asignado,
                SUM(CASE WHEN status = 'cerrado' THEN 1 ELSE 0 END) AS cerrado,
                SUM(CASE WHEN status = 'reabierto' THEN 1 ELSE 0 END) AS reabierto
              FROM tickets WHERE assigned_to = ?`)
    .get(userId);
  const closed = db
    .prepare(`SELECT created_at, closed_at FROM tickets WHERE assigned_to = ? AND closed_at IS NOT NULL`)
    .all(userId);
  let avgHours = 0;
  if (closed.length) {
    avgHours = closed.reduce((a, t) => a + (hoursBetween(t.created_at, t.closed_at) || 0), 0) / closed.length;
  }
  const byPriority = db
    .prepare(`SELECT priority, COUNT(*) AS c FROM tickets WHERE assigned_to = ? GROUP BY priority`)
    .all(userId);
  return { totals, avg_resolution_hours: avgHours, by_priority: byPriority };
}

function forSupervisor(userId) {
  const db = getDb();
  const totals = db
    .prepare(`SELECT
                COUNT(*) AS total,
                SUM(CASE WHEN status NOT IN ('cerrado') THEN 1 ELSE 0 END) AS open,
                SUM(CASE WHEN status = 'cerrado' THEN 1 ELSE 0 END) AS closed
              FROM tickets WHERE created_by = ?`)
    .get(userId);
  return { totals };
}

function forJefe(area) {
  const db = getDb();
  const totals = db
    .prepare(`SELECT
                COUNT(*) AS total,
                SUM(CASE WHEN status NOT IN ('cerrado') THEN 1 ELSE 0 END) AS open,
                SUM(CASE WHEN status = 'cerrado' THEN 1 ELSE 0 END) AS closed,
                SUM(CASE WHEN status = 'solucionado' THEN 1 ELSE 0 END) AS solved,
                SUM(CASE WHEN status = 'reabierto' THEN 1 ELSE 0 END) AS reopened
              FROM tickets WHERE area = ?`)
    .get(area);
  const byAssignee = db
    .prepare(`SELECT u.id, u.full_name, COUNT(t.id) AS c
              FROM users u
              LEFT JOIN tickets t ON t.assigned_to = u.id AND t.area = ?
              WHERE u.active = 1 AND u.role = 'admin_area'
              GROUP BY u.id
              ORDER BY c DESC`)
    .all(area);
  return { totals, by_assignee: byAssignee };
}

module.exports = { dashboard, forUser, forSupervisor, forJefe };
