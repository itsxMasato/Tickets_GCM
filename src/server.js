'use strict';
const http = require('http');
const config = require('./config');
const createApp = require('./app');
const sockets = require('./sockets');
const migrate = require('./db/migrate');

async function start() {
  // 1) Migrar BD antes de levantar
  try {
    await migrate();
  } catch (err) {
    console.error('Error en la migración:', err);
    process.exit(1);
  }

  // 2) Crear app
  const { app, sessionMiddleware } = createApp();
  const httpServer = http.createServer(app);

  // 3) Socket.IO
  sockets.setup(httpServer, sessionMiddleware);

  // 4) Listen
  httpServer.listen(config.port, () => {
    console.log(`[tickets-gcm] Servidor escuchando en http://localhost:${config.port}`);
    console.log(`[tickets-gcm] Entorno: ${config.env}`);
  });
}

start();
