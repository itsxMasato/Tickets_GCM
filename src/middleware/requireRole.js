/* Documentado por: Miguel Flores */
'use strict'

/**
 * Genera un middleware de Express que restringe el acceso a los roles indicados.
 * Responde 401 si no hay sesión activa, y 403 si el rol de la sesión no está incluido en `roles`.
 * @param {...string} roles - roles permitidos para el endpoint
 * @returns {Function} middleware de Express (req, res, next)
 */
function requireRole(...roles) {
  return function (req, res, next) {
    if (!req.session || !req.session.userId) {
      return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Debe iniciar sesión.' } });
    }
    if (!roles.includes(req.session.role)) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'No tiene permisos.' } });
    }
    next();
  };
}

module.exports = requireRole;

