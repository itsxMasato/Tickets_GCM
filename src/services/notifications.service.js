/* Documentado por: Miguel Flores */
'use strict'
const { In } = require('typeorm');
const orm = require('../orm');
const { validationError } = require('../utils/validators');

/**
 * Emite un evento de notificación en tiempo real al usuario vía socket.io (canal `user:{userId}`). Silencia cualquier error de socket.
 * @param {String} userId - id del usuario destinatario
 * @param {Object} event - payload del evento a emitir
 * @returns {Promise<void>}
 */
async function emitNotification(userId, event) {
  try {
    const io = require('../sockets').getIO();
    if (!io) return;
    io.to(`user:${userId}`).emit('notification:new', event);
  } catch (e) {}
}

/**
 * Crea una notificación para un usuario, la persiste y emite el conteo de no leídas en tiempo real.
 * @param {Object} params - datos de la notificación
 * @param {String} params.user_id - id del usuario destinatario
 * @param {String} params.type - tipo de notificación
 * @param {String} [params.ticket_id] - id del ticket relacionado, si aplica
 * @param {String} params.title - título de la notificación
 * @param {String} [params.body] - cuerpo/detalle de la notificación
 * @returns {Promise<Object>} notificación creada
 */
async function create({ user_id, type, ticket_id, title, body }) {
  if (!user_id || !type || !title) {
    throw validationError('Notificación incompleta.');
  }
  const repo = await orm.getRepository(orm.Notification);
  const notification = await repo.save({
    user_id: Number(user_id),
    type,
    ticket_id: ticket_id != null ? Number(ticket_id) : null,
    title,
    body: body || null,
    read: false,
  });
  const unread = await getUnreadCount(user_id);
  await emitNotification(user_id, { unread });
  return notification;
}

/**
 * Alias asíncrono de `create` para llamadas que no necesitan diferenciar comportamiento síncrono.
 * @param {Object} params - datos de la notificación
 * @param {String} params.user_id - id del usuario destinatario
 * @param {String} params.type - tipo de notificación
 * @param {String} [params.ticket_id] - id del ticket relacionado, si aplica
 * @param {String} params.title - título de la notificación
 * @param {String} [params.body] - cuerpo/detalle de la notificación
 * @returns {Promise<Object>} notificación creada
 */
async function createAsync({ user_id, type, ticket_id, title, body }) {
  return create({ user_id, type, ticket_id, title, body });
}

/**
 * Obtiene la cantidad de notificaciones no leídas de un usuario.
 * @param {String} userId - id del usuario
 * @returns {Promise<Number>} cantidad de notificaciones no leídas
 */
async function getUnreadCount(userId) {
  const repo = await orm.getRepository(orm.Notification);
  return repo.count({ where: { user_id: Number(userId), read: false } });
}

/**
 * Alias asíncrono de `getUnreadCount`.
 * @param {String} userId - id del usuario
 * @returns {Promise<Number>} cantidad de notificaciones no leídas
 */
async function getUnreadCountAsync(userId) {
  return getUnreadCount(userId);
}

/**
 * Lista las notificaciones de un usuario, opcionalmente filtrando solo las no leídas.
 * @param {String} userId - id del usuario
 * @param {Object} [options] - opciones de listado
 * @param {Number} [options.limit=20] - cantidad máxima de notificaciones a devolver
 * @param {Boolean} [options.onlyUnread=false] - si true, devuelve solo las no leídas
 * @returns {Promise<Array>} notificaciones del usuario
 */
async function listForUser(userId, { limit = 20, onlyUnread = false } = {}) {
  const repo = await orm.getRepository(orm.Notification);
  const where = { user_id: Number(userId) };
  if (onlyUnread) where.read = false;
  return repo.find({ where, order: { created_at: 'DESC' }, take: limit });
}

/**
 * Marca como leídas una o varias notificaciones de un usuario.
 * @param {String} userId - id del usuario
 * @param {Object} [payload] - detalle de qué notificaciones marcar como leídas (ids específicos o todas)
 * @returns {Promise<Object>} resultado de la operación de actualización
 */
async function markRead(userId, { all = false, ids = [] } = {}) {
  const repo = await orm.getRepository(orm.Notification);
  if (all) {
    const result = await repo.update({ user_id: Number(userId), read: false }, { read: true });
    return { updated: result.affected || 0 };
  }
  if (ids.length) {
    const result = await repo.update({ id: In(ids.map(Number)), user_id: Number(userId) }, { read: true });
    return { updated: result.affected || 0 };
  }
  return { updated: 0 };
}

module.exports = {
  create,
  createAsync,
  listForUser,
  getUnreadCount,
  getUnreadCountAsync,
  markRead,
};
