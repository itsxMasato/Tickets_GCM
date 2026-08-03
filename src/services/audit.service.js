/* Documentado por: Miguel Flores */
'use strict'
const { In } = require('typeorm');
const orm = require('../orm');

/**
 * Registra una entrada de auditoría. Absorbe cualquier error para no interrumpir el flujo que la invoca.
 * @param {Object} audit - datos de la entrada de auditoría (usuario, acción, entidad, etc.)
 * @returns {Promise<void>}
 */
async function log(audit) {
  try {
    const repo = await orm.getRepository(orm.AuditLog);
    await repo.save({
      user_id: audit.user_id != null ? Number(audit.user_id) : null,
      company_id: audit.company_id != null ? Number(audit.company_id) : null,
      action_type: audit.action_type,
      target_type: audit.target_type,
      target_id: audit.target_id != null ? Number(audit.target_id) : null,
      target_code: audit.target_code || null,
      description: audit.description || null,
      old_value: typeof audit.old_value === 'object' && audit.old_value !== null ? JSON.stringify(audit.old_value) : audit.old_value || null,
      new_value: typeof audit.new_value === 'object' && audit.new_value !== null ? JSON.stringify(audit.new_value) : audit.new_value || null,
      ip_address: audit.ip_address || null,
    });
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
 * Codifica un cursor de paginación en base64 a partir de created_at e id de una fila.
 * @param {Object} row - fila con campos created_at (Date) e id
 * @returns {String|null} cursor codificado en base64, o null si no hay fila
 */
function encodeCursor(row) {
  if (!row) return null;
  return Buffer.from(JSON.stringify([new Date(row.created_at).toISOString(), row.id])).toString('base64');
}

/**
 * Decodifica un cursor de paginación generado por encodeCursor.
 * @param {String} cursor - cursor codificado en base64
 * @returns {[Date, Number]|null} par [created_at, id] decodificado, o null si el cursor es inválido/vacío
 */
function decodeCursor(cursor) {
  if (!cursor) return null;
  try {
    const [createdAt, id] = JSON.parse(Buffer.from(cursor, 'base64').toString('utf8'));
    return [new Date(createdAt), Number(id)];
  } catch (_) {
    return null;
  }
}

/**
 * Convierte 'YYYY-MM-DD' en el límite superior inclusivo del día (23:59:59.999), o
 * devuelve el valor tal cual si ya trae hora.
 * @param {String} dateStr - fecha en formato 'YYYY-MM-DD' u otro formato ya completo
 * @returns {Date} fecha con hora de fin de día
 */
function endOfDay(dateStr) {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? new Date(`${dateStr}T23:59:59.999Z`) : new Date(dateStr);
}

/**
 * Aplica los filtros comunes (usuario, tipo de acción, rango de fechas, búsqueda, alcance por
 * empresa) a un QueryBuilder de AuditLog.
 * @param {Object} qb - QueryBuilder de TypeORM sobre AuditLog, alias 'audit_log'
 * @param {Object} options - mismos filtros que recibe listAudit
 * @returns {Object} el mismo QueryBuilder, con los WHERE aplicados
 */
function applyFilters(qb, { user_id, action_type, date_from, date_to, search, requester }) {
  if (user_id) qb.andWhere('audit_log.user_id = :userId', { userId: Number(user_id) });
  if (action_type) qb.andWhere('audit_log.action_type = :actionType', { actionType: action_type });
  if (date_from) qb.andWhere('audit_log.created_at >= :dateFrom', { dateFrom: new Date(date_from) });
  if (date_to) qb.andWhere('audit_log.created_at <= :dateTo', { dateTo: endOfDay(date_to) });
  if (search) {
    qb.andWhere('(audit_log.description LIKE :needle OR audit_log.target_code LIKE :needle)', { needle: `%${search}%` });
  }
  if (requester && !requester.isPlatformAdmin) {
    if (requester.activeCompanyId != null) {
      qb.andWhere('(audit_log.company_id IS NULL OR audit_log.company_id = :activeCompanyId)', { activeCompanyId: Number(requester.activeCompanyId) });
    } else {
      qb.andWhere('audit_log.company_id IS NULL');
    }
  }
  return qb;
}

/**
 * Lista entradas de auditoría paginadas (keyset por created_at+id) aplicando filtros
 * opcionales (usuario, tipo de acción, rango de fechas, búsqueda) y acotamiento por
 * empresa según el requester. Calcula también el total real, la acción más frecuente y
 * la cantidad de usuarios activos sobre el conjunto completo filtrado (no una muestra).
 * @param {Object} [options] - filtros y paginación (cursor, limit, user_id, action_type, date_from, date_to, search, requester)
 * @returns {Promise<Object>} resultado paginado con { data, total, limit, hasMore, nextCursor, mostFrequentAction, activeUserCount }
 */
async function list(options = {}) {
  const { cursor = null, limit = 50 } = options;
  const repo = await orm.getRepository(orm.AuditLog);

  const pageQb = applyFilters(repo.createQueryBuilder('audit_log'), options)
    .orderBy('audit_log.created_at', 'DESC')
    .addOrderBy('audit_log.id', 'DESC')
    .take(limit + 1);

  const cursorState = decodeCursor(cursor);
  if (cursorState) {
    const [cCreatedAt, cId] = cursorState;
    pageQb.andWhere('(audit_log.created_at < :cCreatedAt OR (audit_log.created_at = :cCreatedAt AND audit_log.id < :cId))', { cCreatedAt, cId });
  }

  const rows = await pageQb.getMany();
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? encodeCursor(pageRows[pageRows.length - 1]) : null;

  const userRepo = await orm.getRepository(orm.User);
  const userIds = Array.from(new Set(pageRows.map((r) => r.user_id).filter((id) => id != null)));
  const users = userIds.length ? await userRepo.findBy({ id: In(userIds) }) : [];
  const usersById = new Map(users.map((u) => [u.id, u]));
  const data = pageRows.map((row) => ({
    ...row,
    user_name: usersById.get(row.user_id)?.full_name || null,
    old_value: parseJsonMaybe(row.old_value),
    new_value: parseJsonMaybe(row.new_value),
  }));

  const total = await applyFilters(repo.createQueryBuilder('audit_log'), options).getCount();

  const statsRow = await applyFilters(repo.createQueryBuilder('audit_log'), options)
    .select('audit_log.action_type', 'action_type')
    .addSelect('COUNT(*)', 'cnt')
    .groupBy('audit_log.action_type')
    .orderBy('cnt', 'DESC')
    .limit(1)
    .getRawOne();
  const mostFrequentAction = statsRow ? statsRow.action_type : null;

  const activeUserRow = await applyFilters(repo.createQueryBuilder('audit_log'), options)
    .select('COUNT(DISTINCT audit_log.user_id)', 'cnt')
    .getRawOne();
  const activeUserCount = activeUserRow ? Number(activeUserRow.cnt) : 0;

  return {
    data,
    total,
    limit,
    hasMore,
    nextCursor,
    mostFrequentAction,
    activeUserCount,
    pages: Math.ceil(total / (limit || 50)),
  };
}

/**
 * Parsea un valor de old_value/new_value desde JSON si es un string parseable, o lo devuelve tal cual.
 * @param {*} value - valor crudo almacenado en la columna
 * @returns {*} valor parseado, o el original si no era JSON válido
 */
function parseJsonMaybe(value) {
  if (typeof value !== 'string' || !value) return value;
  try { return JSON.parse(value); } catch (_) { return value; }
}

/**
 * Obtiene la lista de tipos de acción distintos presentes en el historial de auditoría.
 * @returns {Promise<Array>} tipos de acción disponibles, ordenados alfabéticamente
 */
async function getActionTypes() {
  const repo = await orm.getRepository(orm.AuditLog);
  const rows = await repo.createQueryBuilder('audit_log')
    .select('DISTINCT audit_log.action_type', 'action_type')
    .orderBy('audit_log.action_type', 'ASC')
    .getRawMany();
  return rows.map((r) => r.action_type).filter(Boolean);
}

/**
 * Obtiene la lista de usuarios que tienen registros de auditoría (usuarios activos en el historial).
 * @returns {Promise<Array>} usuarios activos en la auditoría { id, username, full_name }, ordenados por nombre
 */
async function getActiveUsers() {
  const auditRepo = await orm.getRepository(orm.AuditLog);
  const rows = await auditRepo.createQueryBuilder('audit_log')
    .select('DISTINCT audit_log.user_id', 'user_id')
    .where('audit_log.user_id IS NOT NULL')
    .getRawMany();
  const userIds = rows.map((r) => r.user_id);
  if (!userIds.length) return [];
  const userRepo = await orm.getRepository(orm.User);
  const users = await userRepo.findBy({ id: In(userIds) });
  return users
    .map((u) => ({ id: u.id, username: u.username, full_name: u.full_name }))
    .sort((a, b) => String(a.full_name).localeCompare(String(b.full_name)));
}

module.exports = { log, logAsync, list, getActionTypes, getActiveUsers };
