/* Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. */
'use strict';

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
