'use strict';
const { Server } = require('socket.io');
const sessionStore = require('connect-sqlite3')(require('express-session'));
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

module.exports = { setup, getIO };
