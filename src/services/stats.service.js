/* Documentado por: Miguel Flores */
'use strict'
const { In } = require('typeorm');
const orm = require('../orm');

const STATUS_VALUES = ['recibido', 'asignado', 'en_proceso', 'solucionado', 'cerrado', 'reabierto'];
const PRIORITY_VALUES = ['baja', 'media', 'alta'];
const AREA_VALUES = ['operaciones', 'logistica', 'mantenimiento', 'sistemas', 'otro'];

/**
 * Cuenta tickets agrupados por los valores de una columna (ej. status, priority, area),
 * aplicando un WHERE adicional opcional vía callback sobre el QueryBuilder.
 * @param {String} field - columna por la que agrupar (status/priority/area)
 * @param {Array<String>} values - valores posibles del campo, para completar con 0 los que no tengan filas
 * @param {Function} [applyWhere] - callback (qb) => qb que aplica filtros adicionales
 * @returns {Promise<Array<Object>>} lista de objetos { [field]: valor, c: cantidad }
 */
async function countGroupBy(field, values, applyWhere) {
  const repo = await orm.getRepository(orm.Ticket);
  const qb = repo.createQueryBuilder('t')
    .select(`t.${field}`, field)
    .addSelect('COUNT(*)', 'c')
    .groupBy(`t.${field}`);
  if (applyWhere) applyWhere(qb);
  const rows = await qb.getRawMany();
  const map = new Map(rows.map((r) => [r[field], Number(r.c)]));
  return values.map((v) => ({ [field]: v, c: map.get(v) || 0 }));
}

/**
 * Calcula el desglose de conteos por estado, prioridad urgente y cerrados hoy sobre un
 * subconjunto de tickets filtrado vía callback sobre el QueryBuilder.
 * @param {Function} applyWhere - callback (qb) => qb que aplica los filtros del subconjunto
 * @returns {Promise<Object>} objeto { recibido, asignado, en_proceso, solucionado, reabierto, urgent, closed_today }
 */
async function statusBreakdown(applyWhere) {
  const repo = await orm.getRepository(orm.Ticket);
  const statusQb = repo.createQueryBuilder('t').select('t.status', 'status').addSelect('COUNT(*)', 'c').groupBy('t.status');
  applyWhere(statusQb);
  const statusRows = await statusQb.getRawMany();
  const byStatus = Object.fromEntries(statusRows.map((r) => [r.status, Number(r.c)]));

  const urgentQb = repo.createQueryBuilder('t').select('COUNT(*)', 'c').where('t.priority = :urgente', { urgente: 'urgente' });
  applyWhere(urgentQb);
  const urgentRow = await urgentQb.getRawOne();

  const today = new Date();
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const endOfDay = new Date(startOfDay);
  endOfDay.setDate(endOfDay.getDate() + 1);
  const closedTodayQb = repo.createQueryBuilder('t')
    .select('COUNT(*)', 'c')
    .where('t.closed_at >= :start AND t.closed_at < :end', { start: startOfDay, end: endOfDay });
  applyWhere(closedTodayQb);
  const closedTodayRow = await closedTodayQb.getRawOne();

  return {
    recibido: byStatus.recibido || 0,
    asignado: byStatus.asignado || 0,
    en_proceso: byStatus.en_proceso || 0,
    solucionado: byStatus.solucionado || 0,
    reabierto: byStatus.reabierto || 0,
    urgent: Number(urgentRow?.c) || 0,
    closed_today: Number(closedTodayRow?.c) || 0,
  };
}

/**
 * Calcula el promedio de horas de resolución (created_at → closed_at) de los tickets
 * cerrados que cumplen el filtro dado.
 * @param {Function} applyWhere - callback (qb) => qb que aplica los filtros del subconjunto
 * @returns {Promise<Number>} promedio de horas de resolución, 0 si no hay tickets cerrados
 */
async function avgResolutionHours(applyWhere) {
  const repo = await orm.getRepository(orm.Ticket);
  const qb = repo.createQueryBuilder('t')
    .select('AVG(CAST(DATEDIFF(MINUTE, t.created_at, t.closed_at) AS FLOAT))', 'avgMinutes')
    .where('t.closed_at IS NOT NULL');
  applyWhere(qb);
  const row = await qb.getRawOne();
  const avgMinutes = row?.avgMinutes;
  return avgMinutes != null ? Number(avgMinutes) / 60 : 0;
}

/**
 * Arma el dashboard general de estadísticas (totales, promedios, distribución por estado/prioridad/área/asignado, histórico e incidencias por categoría), acotado a la empresa activa del solicitante salvo que sea admin de plataforma.
 * @param {Object} [requester] - usuario que solicita el dashboard, usado para determinar el alcance por empresa
 * @returns {Promise<Object>} datos completos del dashboard
 */
async function dashboard(requester = null) {
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
  if (requester && !requester.isPlatformAdmin && requester.activeCompanyId == null) {
    return EMPTY_DASHBOARD;
  }
  const companyId = requester && !requester.isPlatformAdmin ? Number(requester.activeCompanyId) : null;
  const scope = (qb) => { if (companyId != null) qb.andWhere('t.company_id = :companyId', { companyId }); return qb; };

  const repo = await orm.getRepository(orm.Ticket);
  const [total, open, closed, resolved, reopened] = await Promise.all([
    scope(repo.createQueryBuilder('t').select('COUNT(*)', 'c')).getRawOne(),
    scope(repo.createQueryBuilder('t').select('COUNT(*)', 'c').where('t.status != :cerrado', { cerrado: 'cerrado' })).getRawOne(),
    scope(repo.createQueryBuilder('t').select('COUNT(*)', 'c').where('t.status = :cerrado', { cerrado: 'cerrado' })).getRawOne(),
    scope(repo.createQueryBuilder('t').select('COUNT(*)', 'c').where('t.status = :solucionado', { solucionado: 'solucionado' })).getRawOne(),
    scope(repo.createQueryBuilder('t').select('COUNT(*)', 'c').where('t.status = :reabierto', { reabierto: 'reabierto' })).getRawOne(),
  ]);

  const breakdown = await statusBreakdown(scope);
  const byStatus = await countGroupBy('status', STATUS_VALUES, scope);
  const byPriority = await countGroupBy('priority', PRIORITY_VALUES, scope);
  const byArea = await countGroupBy('area', AREA_VALUES, scope);
  const avgHours = await avgResolutionHours(scope);
  const last30Days = await last30DaysCounts(companyId);
  const topCategories = await topCategoriesFor(companyId);

  const assigneeQb = repo.createQueryBuilder('t')
    .select('t.assigned_to', 'assigned_to')
    .addSelect('COUNT(*)', 'c')
    .where('t.assigned_to IS NOT NULL')
    .groupBy('t.assigned_to');
  scope(assigneeQb);
  const assigneeRows = await assigneeQb.getRawMany();
  const userRepo = await orm.getRepository(orm.User);
  const assigneeIds = assigneeRows.map((r) => r.assigned_to);
  const users = assigneeIds.length ? await userRepo.findBy({ id: In(assigneeIds) }) : [];
  const usersById = new Map(users.map((u) => [u.id, u]));
  const by_assignee = assigneeRows
    .map((r) => ({
      id: r.assigned_to,
      full_name: usersById.get(r.assigned_to)?.full_name || null,
      area: usersById.get(r.assigned_to)?.area || '',
      avatar_url: usersById.get(r.assigned_to)?.avatar_url || null,
      c: Number(r.c),
    }))
    .sort((a, b) => b.c - a.c);

  return {
    totals: {
      total: Number(total?.c) || 0,
      open: Number(open?.c) || 0,
      closed: Number(closed?.c) || 0,
      resolved: Number(resolved?.c) || 0,
      reopened: Number(reopened?.c) || 0,
      ...breakdown,
    },
    avg_resolution_hours: avgHours,
    by_status: byStatus,
    by_priority: byPriority,
    by_area: byArea,
    by_assignee,
    last_30_days: last30Days,
    top_categories: topCategories,
  };
}

/**
 * Cuenta tickets creados por día en los últimos 30 días, completando con 0 los días sin tickets.
 * @param {String|Number|null} companyId - id de empresa a la que acotar, o null para todas
 * @returns {Promise<Array<Object>>} lista de objetos { day: 'YYYY-MM-DD', c: cantidad }
 */
async function last30DaysCounts(companyId) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);
  const repo = await orm.getRepository(orm.Ticket);
  const qb = repo.createQueryBuilder('t')
    .select('CONVERT(date, t.created_at)', 'day')
    .addSelect('COUNT(*)', 'c')
    .where('t.created_at >= :start', { start })
    .groupBy('CONVERT(date, t.created_at)');
  if (companyId != null) qb.andWhere('t.company_id = :companyId', { companyId });
  const rows = await qb.getRawMany();
  const map = new Map(rows.map((r) => [new Date(r.day).toISOString().slice(0, 10), Number(r.c)]));
  const dates = [];
  for (let i = 29; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    dates.push({ day: key, c: map.get(key) || 0 });
  }
  return dates;
}

/**
 * Devuelve las 5 categorías con más tickets, acotadas a una empresa opcional.
 * @param {String|Number|null} companyId - id de empresa a la que acotar, o null para todas
 * @returns {Promise<Array<Object>>} hasta 5 objetos { id, name, c } ordenados por cantidad descendente
 */
async function topCategoriesFor(companyId) {
  const repo = await orm.getRepository(orm.Ticket);
  const qb = repo.createQueryBuilder('t')
    .select('t.category_id', 'id')
    .addSelect('COUNT(*)', 'c')
    .where('t.category_id IS NOT NULL')
    .groupBy('t.category_id')
    .orderBy('c', 'DESC')
    .limit(5);
  if (companyId != null) qb.andWhere('t.company_id = :companyId', { companyId });
  const rows = await qb.getRawMany();
  if (!rows.length) return [];
  const categoryRepo = await orm.getRepository(orm.Category);
  const categories = await categoryRepo.findBy({ id: In(rows.map((r) => r.id)) });
  const categoriesById = new Map(categories.map((c) => [c.id, c]));
  return rows.map((r) => ({ id: r.id, name: categoriesById.get(r.id)?.name || null, c: Number(r.c) }));
}

/**
 * Obtiene las estadísticas de tickets correspondientes a un usuario/rol específico
 * (admin_area: creados+asignados; supervisor_campo: propios; jefe_inmediato: de su área).
 * @param {String|Number} userId - id del usuario (puede ser null según el rol, ej. jefe_inmediato por área)
 * @param {Object} user - contexto del usuario/rol para el cual se calculan las estadísticas
 * @returns {Promise<Object>} estadísticas del usuario/rol
 */
async function forUser(userId, user) {
  const uid = userId != null ? Number(userId) : null;
  const companyScoped = user.role !== 'sac' && user.activeCompanyId != null;
  const scopeCompany = (qb) => {
    if (companyScoped) qb.andWhere('(t.company_id IS NULL OR t.company_id = :activeCompanyId)', { activeCompanyId: Number(user.activeCompanyId) });
    return qb;
  };

  const repo = await orm.getRepository(orm.Ticket);

  if (user.role === 'admin_area') {
    const scope = (qb) => scopeCompany(qb.andWhere('(t.created_by = :uid OR t.assigned_to = :uid)', { uid }));
    const totalQb = scope(repo.createQueryBuilder('t').select('COUNT(*)', 'c'));
    const cerradoQb = scope(repo.createQueryBuilder('t').select('COUNT(*)', 'c').where('t.status = :cerrado', { cerrado: 'cerrado' }));
    const [totalRow, cerradoRow, breakdown, avgHours, priorityRows] = await Promise.all([
      totalQb.getRawOne(),
      cerradoQb.getRawOne(),
      statusBreakdown((qb) => scope(qb)),
      avgResolutionHours((qb) => scope(qb)),
      scope(repo.createQueryBuilder('t').select('t.priority', 'priority').addSelect('COUNT(*)', 'c').groupBy('t.priority')).getRawMany(),
    ]);
    return {
      totals: { total: Number(totalRow?.c) || 0, cerrado: Number(cerradoRow?.c) || 0, ...breakdown },
      avg_resolution_hours: avgHours,
      by_priority: priorityRows.map((r) => ({ priority: r.priority, c: Number(r.c) })),
    };
  }

  if (user.role === 'supervisor_campo') {
    const scope = (qb) => scopeCompany(qb.andWhere('t.created_by = :uid', { uid }));
    const totalQb = scope(repo.createQueryBuilder('t').select('COUNT(*)', 'c'));
    const openQb = scope(repo.createQueryBuilder('t').select('COUNT(*)', 'c').where('t.status != :cerrado', { cerrado: 'cerrado' }));
    const closedQb = scope(repo.createQueryBuilder('t').select('COUNT(*)', 'c').where('t.status = :cerrado', { cerrado: 'cerrado' }));
    const [totalRow, openRow, closedRow, breakdown] = await Promise.all([
      totalQb.getRawOne(), openQb.getRawOne(), closedQb.getRawOne(), statusBreakdown((qb) => scope(qb)),
    ]);
    return {
      totals: { total: Number(totalRow?.c) || 0, open: Number(openRow?.c) || 0, closed: Number(closedRow?.c) || 0, ...breakdown },
    };
  }

  if (user.role === 'jefe_inmediato') {
    const scope = (qb) => scopeCompany(qb.andWhere('t.area = :area', { area: user.area }));
    const totalQb = scope(repo.createQueryBuilder('t').select('COUNT(*)', 'c'));
    const openQb = scope(repo.createQueryBuilder('t').select('COUNT(*)', 'c').where('t.status != :cerrado', { cerrado: 'cerrado' }));
    const closedQb = scope(repo.createQueryBuilder('t').select('COUNT(*)', 'c').where('t.status = :cerrado', { cerrado: 'cerrado' }));
    const solvedQb = scope(repo.createQueryBuilder('t').select('COUNT(*)', 'c').where('t.status = :solucionado', { solucionado: 'solucionado' }));
    const reopenedQb = scope(repo.createQueryBuilder('t').select('COUNT(*)', 'c').where('t.status = :reabierto', { reabierto: 'reabierto' }));
    const assigneeQb = scope(repo.createQueryBuilder('t').select('t.assigned_to', 'assigned_to').addSelect('COUNT(*)', 'c').where('t.assigned_to IS NOT NULL').groupBy('t.assigned_to'));
    const [totalRow, openRow, closedRow, solvedRow, reopenedRow, breakdown, assigneeRows] = await Promise.all([
      totalQb.getRawOne(), openQb.getRawOne(), closedQb.getRawOne(), solvedQb.getRawOne(), reopenedQb.getRawOne(),
      statusBreakdown((qb) => scope(qb)), assigneeQb.getRawMany(),
    ]);
    const byAssignee = assigneeRows.map((r) => ({ id: r.assigned_to, c: Number(r.c) })).sort((a, b) => b.c - a.c);
    const userRepo = await orm.getRepository(orm.User);
    const users = byAssignee.length ? await userRepo.findBy({ id: In(byAssignee.map((a) => a.id)) }) : [];
    const usersById = new Map(users.map((u) => [u.id, u]));
    return {
      totals: {
        total: Number(totalRow?.c) || 0,
        open: Number(openRow?.c) || 0,
        closed: Number(closedRow?.c) || 0,
        solved: Number(solvedRow?.c) || 0,
        reopened: Number(reopenedRow?.c) || 0,
        ...breakdown,
      },
      by_assignee: byAssignee.map((item) => ({
        ...item,
        full_name: usersById.get(item.id)?.full_name || null,
        avatar_url: usersById.get(item.id)?.avatar_url || null,
      })),
    };
  }

  return {};
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
