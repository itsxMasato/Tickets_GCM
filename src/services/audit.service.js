'use strict';
const orm = require('../orm');

// ── Shape legacy por log ────────────────────────────────────────────────────
// Cada log se serializa al shape que el frontend consume: { id, user_id,
//   user_name, action_type, target_type, target_id, target_code,
//   description, old_value, new_value, created_at }.
//
// SQLite devolvía: { id, user_id, username, full_name, action_type, ...
//                    created_at: 'YYYY-MM-DD HH:MM:SS' }.
// TypeORM con createQueryBuilder.leftJoin + getRawMany() devuelve columnas
// planas: { id, user_id, username, full_name, action_type, ...
//           created_at: Date }.
// Mapeamos a mano para:
//   - full_name → user_name (el frontend lee record.user_name)
//   - parsear JSON en old_value/new_value si vienen string (defensivo)
//   - created_at a 'YYYY-MM-DD HH:MM:SS' (el frontend usa formatDateTime)
function serializeLog(row) {
  if (!row) return null;
  let oldValue = row.old_value;
  let newValue = row.new_value;
  // Defensivo: si vienen como string, los parseamos. Si ya son objetos, los dejamos.
  if (typeof oldValue === 'string' && oldValue) {
    try { oldValue = JSON.parse(oldValue); } catch (_) { /* dejar string */ }
  }
  if (typeof newValue === 'string' && newValue) {
    try { newValue = JSON.parse(newValue); } catch (_) { /* dejar string */ }
  }
  return {
    id: row.id,
    user_id: row.user_id,
    user_name: row.full_name,                 // JOIN users.full_name
    action_type: row.action_type,
    target_type: row.target_type,
    target_id: row.target_id,
    target_code: row.target_code,
    description: row.description,
    old_value: oldValue,
    new_value: newValue,
    created_at: row.created_at instanceof Date
      ? row.created_at.toISOString().replace('T', ' ').slice(0, 19)
      : row.created_at,
  };
}

// ── log() ──────────────────────────────────────────────────────────────────
// Quedó SYNC (Camino C histórico). Lo dejamo por compatibilidad con
// call-sites externos que aún no migraron. Cuando todos los servicios
// consumidores (tickets, etc.) estén en el ORM, log se borra.
//
// No usa transacción: es write puro. JSON.stringify defensivo: si old_value
// o new_value vienen como objeto (lo más probable desde los call-sites de
// tickets), los serializa. Si vienen como string, los deja tal cual.
function log(audit) {
  try {
    const repo = orm.getRepositorySync(orm.AuditLog);
    repo.save(repo.create({
      user_id:     audit.user_id,
      action_type: audit.action_type,
      target_type: audit.target_type,
      target_id:   audit.target_id || null,
      target_code: audit.target_code || null,
      description: audit.description,
      old_value:   typeof audit.old_value === 'object' ? JSON.stringify(audit.old_value) : (audit.old_value || null),
      new_value:   typeof audit.new_value === 'object' ? JSON.stringify(audit.new_value) : (audit.new_value || null),
      ip_address:  audit.ip_address || null,
    }));
  } catch (err) {
    // Mismo comportamiento que la versión vieja: log de error y seguir.
    // audit nunca debe tirar el flujo de negocio.
    console.error('Error al registrar auditoría:', err);
  }
}

// ── logAsync() ─────────────────────────────────────────────────────────────
// Versión async que consumen los servicios migrados al ORM (tickets desde
// batch 3). Mismo try/catch interno: audit nunca debe tirar el flujo.
// Migrar log → logAsync en un call-site es 1 línea (agregar await).
async function logAsync(audit) {
  try {
    const repo = await orm.getRepository(orm.AuditLog);
    await repo.save(repo.create({
      user_id:     audit.user_id,
      action_type: audit.action_type,
      target_type: audit.target_type,
      target_id:   audit.target_id || null,
      target_code: audit.target_code || null,
      description: audit.description,
      old_value:   typeof audit.old_value === 'object' ? JSON.stringify(audit.old_value) : (audit.old_value || null),
      new_value:   typeof audit.new_value === 'object' ? JSON.stringify(audit.new_value) : (audit.new_value || null),
      ip_address:  audit.ip_address || null,
    }));
  } catch (err) {
    console.error('Error al registrar auditoría:', err);
  }
}

// ── list() ─────────────────────────────────────────────────────────────────
// Devuelve el shape que el frontend ya espera:
//   { data, total, page, limit, mostFrequentAction, activeUserCount }.
//
// `data` reemplaza a `logs`. `mostFrequentAction` y `activeUserCount` se
// calculan sobre `data` (consistente con lo que la tabla muestra: si
// filtrás, los KPIs también cambian).
async function list({
  page = 1, limit = 50,
  user_id = null, action_type = null,
  date_from = null, date_to = null, search = null,
} = {}) {
  const repo = await orm.getRepository(orm.AuditLog);

  // Query principal: SELECT con JOIN a users para traer username/full_name.
  const qb = repo.createQueryBuilder('al')
    .leftJoin('users', 'u', 'u.id = al.user_id')
    .select([
      'al.id          AS id',
      'al.user_id     AS user_id',
      'u.username     AS username',
      'u.full_name    AS full_name',
      'al.action_type AS action_type',
      'al.target_type AS target_type',
      'al.target_id   AS target_id',
      'al.target_code AS target_code',
      'al.description AS description',
      'al.old_value   AS old_value',
      'al.new_value   AS new_value',
      'al.created_at  AS created_at',
    ])
    .orderBy('al.created_at', 'DESC')
    .limit(limit)
    .offset((page - 1) * limit);

  if (user_id)     qb.andWhere('al.user_id = :uid',  { uid: user_id });
  if (action_type) qb.andWhere('al.action_type = :a', { a: action_type });
  if (date_from)   qb.andWhere('al.created_at >= :df', { df: date_from });
  if (date_to)     qb.andWhere('al.created_at <= :dt', { dt: date_to });
  if (search)      qb.andWhere('(al.description LIKE :s OR al.target_code LIKE :s)', { s: `%${search}%` });

  // Total: query separada sin JOIN ni LIMIT/OFFSET. Es más claro y barato.
  const countQb = repo.createQueryBuilder('al');
  if (user_id)     countQb.andWhere('al.user_id = :uid',  { uid: user_id });
  if (action_type) countQb.andWhere('al.action_type = :a', { a: action_type });
  if (date_from)   countQb.andWhere('al.created_at >= :df', { df: date_from });
  if (date_to)     countQb.andWhere('al.created_at <= :dt', { dt: date_to });
  if (search)      countQb.andWhere('(al.description LIKE :s OR al.target_code LIKE :s)', { s: `%${search}%` });
  const total = await countQb.getCount();

  const rows = await qb.getRawMany();
  const data = rows.map(serializeLog);

  // KPIs calculados sobre `data` (consistente con la tabla filtrada).
  const actionCounts = data.reduce((acc, r) => {
    acc[r.action_type] = (acc[r.action_type] || 0) + 1;
    return acc;
  }, {});
  const mostFrequentAction = Object.entries(actionCounts)
    .sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  const activeUserCount = new Set(data.map((r) => r.user_id).filter(Boolean)).size;

  return { data, total, page, limit, mostFrequentAction, activeUserCount };
}

async function getActionTypes() {
  const repo = await orm.getRepository(orm.AuditLog);
  const rows = await repo.createQueryBuilder('al')
    .select('DISTINCT al.action_type', 'action_type')
    .orderBy('al.action_type', 'ASC')
    .getRawMany();
  return rows.map((r) => r.action_type);
}

async function getActiveUsers() {
  const repo = await orm.getRepository(orm.AuditLog);
  const rows = await repo.createQueryBuilder('al')
    .leftJoin('users', 'u', 'u.id = al.user_id')
    .select([
      'u.id        AS id',
      'u.username  AS username',
      'u.full_name AS full_name',
    ])
    .distinct(true)
    .where('u.id IS NOT NULL')
    .orderBy('u.full_name', 'ASC')
    .getRawMany();
  return rows;
}

module.exports = { log, logAsync, list, getActionTypes, getActiveUsers };