'use strict';
const { In } = require('typeorm');
const orm = require('../orm');
const { validationError } = require('../utils/validators');

// ── Shape legacy ────────────────────────────────────────────────────────────
// SQLite devolvía: { id, user_id, type, ticket_id, title, body,
//                    read: 0|1, created_at: 'YYYY-MM-DD HH:MM:SS' }.
// TypeORM devuelve: { id, user_id, type, ticket_id, title, body,
//                    read: boolean, created_at: Date }.
// Mapeamos a mano para no romper call-sites. Cambio de shape = segundo PR.
function serialize(row) {
  if (!row) return null;
  return {
    id: row.id,
    user_id: row.user_id,
    type: row.type,
    ticket_id: row.ticket_id,
    title: row.title,
    body: row.body,
    read: row.read ? 1 : 0,
    created_at: row.created_at instanceof Date
      ? row.created_at.toISOString().replace('T', ' ').slice(0, 19)
      : row.created_at,
  };
}

// ── getUnreadCount (sync) ───────────────────────────────────────────────────
// Lo usa create() que también es sync (ver bloque de create más abajo).
// TODO: cuando tickets.service.js migre al ORM y create pase a async,
// esta función se borra y create llama directamente a la versión async.
function getUnreadCount(userId) {
  const repo = orm.getRepositorySync(orm.Notification);
  return repo.count({ where: { user_id: userId, read: false } });
}

// Versión async que consume la ruta HTTP (no tiene el problema de "create
// es sync y no puede await-ear").
async function getUnreadCountAsync(userId) {
  const repo = await orm.getRepository(orm.Notification);
  return repo.count({ where: { user_id: userId, read: false } });
}

// ── create() ───────────────────────────────────────────────────────────────
// Versión sync conservada por compatibilidad (Camino C histórico). La
// consumen call-sites externos que aún no migraron al ORM. Cuando todos los
// servicios consumidores estén migrados, create se borra.
//
// No usa `ds.transaction` porque: (1) es sync, (2) es write puro sin
// check. La emisión por socket usa getUnreadCount (sync) para enviar el
// contador actualizado.
function create({ user_id, type, ticket_id, title, body }) {
  if (!user_id || !type || !title) {
    throw validationError('Notificación incompleta.');
  }
  const repo = orm.getRepositorySync(orm.Notification);
  repo.save(repo.create({
    user_id,
    type,
    ticket_id: ticket_id || null,
    title,
    body: body || null,
  }));

  // Emitir por socket (mismo comportamiento que antes).
  try {
    const io = require('../sockets').getIO();
    if (io) {
      const unread = getUnreadCount(user_id);
      io.to(`user:${user_id}`).emit('notification:new', { unread });
    }
  } catch (e) { /* socket no listo */ }
}

// ── createAsync() ──────────────────────────────────────────────────────────
// Versión async que consumen los servicios migrados al ORM (tickets desde
// batch 3). Mismo comportamiento: INSERT puro + emit por socket. La emisión
// usa getUnreadCountAsync para no introducir dependencias sync dentro de
// una función async.
//
// Migrar create → createAsync en un call-site es 1 línea (agregar await y
// renombrar).
async function createAsync({ user_id, type, ticket_id, title, body }) {
  if (!user_id || !type || !title) {
    throw validationError('Notificación incompleta.');
  }
  const repo = await orm.getRepository(orm.Notification);
  await repo.save(repo.create({
    user_id,
    type,
    ticket_id: ticket_id || null,
    title,
    body: body || null,
  }));

  // Emitir por socket (mismo comportamiento que antes).
  try {
    const io = require('../sockets').getIO();
    if (io) {
      const unread = await getUnreadCountAsync(user_id);
      io.to(`user:${user_id}`).emit('notification:new', { unread });
    }
  } catch (e) { /* socket no listo */ }
}

async function listForUser(userId, { limit = 20, onlyUnread = false } = {}) {
  const repo = await orm.getRepository(orm.Notification);
  const qb = repo.createQueryBuilder('n')
    .where('n.user_id = :uid', { uid: userId })
    .orderBy('n.created_at', 'DESC')
    .limit(limit);
  if (onlyUnread) qb.andWhere('n.read = :r', { r: false });
  const rows = await qb.getMany();
  return rows.map(serialize);
}

async function markRead(userId, payload = {}) {
  const repo = await orm.getRepository(orm.Notification);
  if (payload.all) {
    const result = await repo.update({ user_id: userId }, { read: true });
    return { updated: result.affected || 0 };
  }
  if (Array.isArray(payload.ids) && payload.ids.length) {
    const result = await repo.update(
      { user_id: userId, id: In(payload.ids) },
      { read: true },
    );
    return { updated: result.affected || 0 };
  }
  return { updated: 0 };
}

module.exports = {
  create,                // sync (legacy — se borra cuando todos los call-sites migren)
  createAsync,           // async (lo usan los servicios migrados al ORM)
  listForUser,
  getUnreadCount,        // sync (lo usa create() legacy)
  getUnreadCountAsync,   // async (la ruta HTTP usa esta)
  markRead,
};
