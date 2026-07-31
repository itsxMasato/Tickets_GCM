/* Documentado por: Miguel Flores */
'use strict'

const { toId } = require('../firestoreData');

/**
 * Middleware de Express que exige una sesión activa. Si no hay sesión responde 401;
 * si la hay, arma `req.user` a partir de los datos guardados en la sesión (id, username,
 * nombre, rol, área, flags de admin de plataforma y empresa activa) y continúa la cadena.
 * @param {Request} req
 * @param {Response} res
 * @param {Function} next
 * @returns {void}
 */
function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Debe iniciar sesión.' } });
  }
  req.user = {
    id: toId(req.session.userId),
    username: req.session.username,
    full_name: req.session.full_name,
    role: req.session.role,
    area: req.session.area || null,
    isPlatformAdmin: req.session.isPlatformAdmin === true,
    is_platform_admin: req.session.isPlatformAdmin === true,
    activeCompanyId: req.session.activeCompanyId != null ? toId(req.session.activeCompanyId) : null,
  };
  next();
}

module.exports = requireAuth;

