'use strict';
const http = require('http');
const config = require('./config');
const firebaseAdmin = require('./firebaseAdmin');
const createApp = require('./app');
const sockets = require('./sockets');

async function start() {
  firebaseAdmin.init();
  if (!firebaseAdmin.isInitialized()) {
    const initError = firebaseAdmin.getInitializationError();
    console.error('[tickets-gcm] No se pudo inicializar Firebase Admin. Verifique las credenciales de entorno.');
    if (initError) console.error('[tickets-gcm] firebaseAdmin init error:', initError.stack || initError.message);
    process.exit(1);
  }

  // 1) Crear app
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
