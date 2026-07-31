/* Documentado por: Miguel Flores */
'use strict'
const { Server } = require('socket.io');
const config = require('../config');

let io = null;

/**
 * Crea el servidor de Socket.IO sobre el servidor HTTP dado, comparte la sesión
 * de Express con cada conexión y agrupa a cada socket en las rooms correspondientes
 * (tickets, sac, user:<id> y company:<id>) según el usuario autenticado en sesión.
 * @param {http.Server} httpServer - servidor HTTP sobre el que se monta Socket.IO
 * @param {Function} sessionMiddleware - middleware de express-session a compartir con los sockets
 * @returns {Server} instancia de Socket.IO creada
 */
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

/**
 * Devuelve la instancia actual de Socket.IO (o null si todavía no se llamó a setup).
 * @returns {Server|null} instancia de Socket.IO activa
 */
function getIO() {
  return io;
}

/**
 * Emite un evento de tiempo real por Socket.IO hacia las rooms indicadas en opts
 * (usuario específico, rol sac/admin_area, broadcast general a todos los tickets,
 * o rooms adicionales). No lanza si Socket.IO todavía no está inicializado.
 * @param {String} event - nombre del evento a emitir
 * @param {*} payload - datos a enviar junto con el evento
 * @param {Object} [opts] - opciones de enrutamiento del evento
 * @param {String} [opts.user] - id de usuario destinatario (room user:<id>)
 * @param {String} [opts.role] - rol destinatario ('sac' o 'admin_area')
 * @param {Boolean} [opts.broadcast] - si es true, emite a la room 'tickets'
 * @param {Array<String>} [opts.extraRooms] - rooms adicionales a las que emitir
 * @returns {void}
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
  } catch (e) {}
}

module.exports = { setup, getIO, emit };

