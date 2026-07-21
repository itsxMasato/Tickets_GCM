/* Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. */
'use strict';
const { Server } = require('socket.io');
const config = require('../config');

let io = null;

function setup(httpServer, sessionMiddleware) {
  io = new Server(httpServer, {
    cors: { origin: true, credentials: true },
  });

  // Compartir la sesión con Socket.IO
  io.engine.use(sessionMiddleware);

  io.on('connection', (socket) => {
    const session = socket.request.session;
    if (!session || !session.userId) {
      socket.disconnect(true);
      return;
    }
    socket.join('tickets');
    if (session.role === 'sac' || session.role === 'admin_area') {
      socket.join('sac');
    }
    socket.join(`user:${session.userId}`);

    socket.on('disconnect', () => {});
  });

  return io;
}

function getIO() {
  return io;
}

/**
 * Emite un evento a las salas indicadas. Diseñado para ser seguro cuando
 * el socket aún no está inicializado (arranque en frío, tests).
 *
 * @param {string} event  Nombre del evento (p. ej. 'role:permissions_updated')
 * @param {object} payload  Datos del evento
 * @param {object} [opts]
 * @param {string} [opts.user]  ID de usuario → emite a `user:{id}`
 * @param {string|boolean} [opts.role]  'sac' / 'admin_area' → sala de rol
 * @param {string|boolean} [opts.broadcast]  true → sala 'tickets' (todos)
 * @param {string[]} [opts.extraRooms]  Salas adicionales
 */
function emit(event, payload, opts = {}) {
  try {
    const target = getIO();
    if (!target) return;
    const { user, role, broadcast, extraRooms } = opts;
    if (user) target.to(`user:${user}`).emit(event, payload);
    if (role === 'sac' || role === 'admin_area') target.to(role).emit(event, payload);
    if (broadcast) target.to('tickets').emit(event, payload);
    if (Array.isArray(extraRooms)) {
      for (const room of extraRooms) target.to(room).emit(event, payload);
    }
  } catch (e) {
    /* socket no inicializado aún */
  }
}

module.exports = { setup, getIO, emit };
