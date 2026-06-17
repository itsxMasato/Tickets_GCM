'use strict';
const { getDb } = require('../db/connection');
const { validationError } = require('../utils/validators');

function create({ user_id, type, ticket_id, title, body }) {
  if (!user_id || !type || !title) {
    throw validationError('Notificación incompleta.');
  }
  const db = getDb();
  db.prepare(`INSERT INTO notifications (user_id, type, ticket_id, title, body)
              VALUES (?, ?, ?, ?, ?)`)
    .run(user_id, type, ticket_id || null, title, body || null);

  // Emitir por socket
  try {
    const io = require('../sockets').getIO();
    if (io) {
      const unread = getUnreadCount(user_id);
      io.to(`user:${user_id}`).emit('notification:new', { unread });
    }
  } catch (e) { /* socket no listo */ }
}

function listForUser(userId, { limit = 20, onlyUnread = false } = {}) {
  const db = getDb();
  const where = ['user_id = ?'];
  const params = [userId];
  if (onlyUnread) where.push('read = 0');
  return db
    .prepare(`SELECT * FROM notifications WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT ?`)
    .all(...params, limit);
}

function getUnreadCount(userId) {
  const db = getDb();
  return db.prepare('SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND read = 0').get(userId).c;
}

function markRead(userId, payload = {}) {
  const db = getDb();
  if (payload.all) {
    db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ?').run(userId);
    return { updated: db.prepare('SELECT changes() AS c').get().c };
  }
  if (Array.isArray(payload.ids) && payload.ids.length) {
    const placeholders = payload.ids.map(() => '?').join(',');
    db.prepare(`UPDATE notifications SET read = 1 WHERE user_id = ? AND id IN (${placeholders})`)
      .run(userId, ...payload.ids);
    return { updated: payload.ids.length };
  }
  return { updated: 0 };
}

module.exports = { create, listForUser, getUnreadCount, markRead };
