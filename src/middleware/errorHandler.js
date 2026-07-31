/* Documentado por: Miguel Flores */
'use strict'

/**
 * Middleware final de manejo de errores de Express. Traduce cualquier error lanzado
 * en la app a una respuesta JSON uniforme { error: { code, message } }, con el status
 * HTTP indicado en err.statusCode (o 500 por defecto), y loguea a consola los errores 5xx.
 * @param {Error} err - error capturado (puede traer statusCode y code)
 * @param {Request} req
 * @param {Response} res
 * @param {Function} next
 * @returns {void}
 */
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

