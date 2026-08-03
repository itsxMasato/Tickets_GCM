/* Documentado por: Miguel Flores */
'use strict'
const http = require('http');
const config = require('./config');
const orm = require('./orm');
const createApp = require('./app');
const sockets = require('./sockets');

/**
 * Inicializa el ORM (SQL Server), crea la app Express y el servidor HTTP,
 * configura Socket.IO y pone el servidor a escuchar en el puerto configurado.
 * Termina el proceso si la base de datos no está disponible.
 * @returns {Promise<void>}
 */
async function start() {
  try {
    await orm.initORM();
  } catch (err) {
    console.error('[tickets-gcm] No se pudo conectar a la base de datos. Verifique las variables MSSQL_*.');
    console.error('[tickets-gcm] orm init error:', err.stack || err.message);
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

