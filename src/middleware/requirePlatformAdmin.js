/* Documentado por: Miguel Flores */
'use strict'
const orm = require('../orm');

/**
 * Middleware de Express que exige que el usuario autenticado sea administrador de plataforma.
 * Responde 401 sin sesión. Si el flag no está cacheado en la sesión, lo resuelve consultando
 * el usuario vía ORM y lo guarda en `req.session.isPlatformAdmin`. Responde 403 si no es admin.
 * @param {Request} req
 * @param {Response} res
 * @param {Function} next
 * @returns {Promise<void>}
 */
async function requirePlatformAdmin(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Debe iniciar sesión.' } });
  }
  try {
    let isAdmin = req.session.isPlatformAdmin;
    if (typeof isAdmin !== 'boolean') {
      const repo = await orm.getRepository(orm.User);
      const user = await repo.findOne({ where: { id: Number(req.session.userId) } });
      isAdmin = !!(user && user.is_platform_admin);
      req.session.isPlatformAdmin = isAdmin;
    }
    if (!isAdmin) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Requiere permisos de administrador de plataforma.' },
      });
    }
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = requirePlatformAdmin;

