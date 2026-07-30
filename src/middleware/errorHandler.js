/* Documentado por: Miguel Flores */
'use strict'

function errorHandler(err, req, res, next) {
  const status = err.statusCode || 500;
  const code = err.code || 'INTERNAL_ERROR';
  const message = err.message || 'Error interno del servidor.';
  if (status >= 500) {
    console.error('[error]', err);
  }
  res.status(status).json({ error: { code, message } });
}

module.exports = errorHandler;

