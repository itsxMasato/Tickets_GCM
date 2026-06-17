'use strict';

function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Debe iniciar sesión.' } });
  }
  req.user = {
    id: req.session.userId,
    username: req.session.username,
    full_name: req.session.full_name,
    role: req.session.role,
    area: req.session.area || null,
  };
  next();
}

module.exports = requireAuth;
