'use strict';
const firestoreData = require('../firestoreData');
const { validationError } = require('../utils/validators');

async function emitNotification(userId, event) {
  try {
    const io = require('../sockets').getIO();
    if (!io) return;
    io.to(`user:${userId}`).emit('notification:new', event);
  } catch (e) {
    /* socket no inicializado aún */
  }
}

async function create({ user_id, type, ticket_id, title, body }) {
  if (!user_id || !type || !title) {
    throw validationError('Notificación incompleta.');
  }
  const notification = await firestoreData.createNotification({ user_id, type, ticket_id, title, body });
  const unread = await firestoreData.getUnreadCount(user_id);
  await emitNotification(user_id, { unread });
  return notification;
}

async function createAsync({ user_id, type, ticket_id, title, body }) {
  return create({ user_id, type, ticket_id, title, body });
}

async function getUnreadCount(userId) {
  return firestoreData.getUnreadCount(userId);
}

async function getUnreadCountAsync(userId) {
  return getUnreadCount(userId);
}

async function listForUser(userId, { limit = 20, onlyUnread = false } = {}) {
  return firestoreData.listNotificationsForUser(userId, { limit, onlyUnread });
}

async function markRead(userId, payload = {}) {
  return firestoreData.markNotificationsRead(userId, payload);
}

module.exports = {
  create,
  createAsync,
  listForUser,
  getUnreadCount,
  getUnreadCountAsync,
  markRead,
};
