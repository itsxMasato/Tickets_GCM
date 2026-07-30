/* Documentado por: Miguel Flores */
'use strict'
const { Server } = require('socket.io');
const config = require('../config');

let io = null;

function setup(httpServer, sessionMiddleware) {
  io = new Server(httpServer, {
    cors: { origin: true, credentials: true },
  });

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
    if (session.activeCompanyId) {
      socket.join(`company:${session.activeCompanyId}`);
    }

    socket.on('disconnect', () => {});
  });

  return io;
}

function getIO() {
  return io;
}

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
  } catch (e) {}
}

module.exports = { setup, getIO, emit };

