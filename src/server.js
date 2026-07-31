/* Documentado por: Miguel Flores */
'use strict'
const http = require('http');
const config = require('./config');
const firebaseAdmin = require('./firebaseAdmin');
const createApp = require('./app');
const sockets = require('./sockets');

/**
 * Inicializa Firebase Admin, crea la app Express y el servidor HTTP,
 * configura Socket.IO y pone el servidor a escuchar en el puerto configurado.
 * Termina el proceso si Firebase Admin no pudo inicializarse.
 * @returns {Promise<void>}
 */
async function start() {
  firebaseAdmin.init();
  if (!firebaseAdmin.isInitialized()) {
    const initError = firebaseAdmin.getInitializationError();
    console.error('[tickets-gcm] No se pudo inicializar Firebase Admin. Verifique las credenciales de entorno.');
    if (initError) console.error('[tickets-gcm] firebaseAdmin init error:', initError.stack || initError.message);
    process.exit(1);
  }

  const { app, sessionMiddleware } = createApp();
  const httpServer = http.createServer(app);

  sockets.setup(httpServer, sessionMiddleware);

  httpServer.listen(config.port, '0.0.0.0', () => {
    console.log(`[tickets-gcm] Servidor escuchando en http://0.0.0.0:${config.port}`);
    console.log(`[tickets-gcm] Entorno: ${config.env}`);
  });
}

start();

