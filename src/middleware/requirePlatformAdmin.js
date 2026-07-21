/* Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. */
'use strict';
const orm = require('../orm');

/**
 * requirePlatformAdmin — gate de platform admin (Miguel Flores).
 *
 * A diferencia de `requireRole`, este middleware valida el flag
 * `users.is_platform_admin` en vez de `users.role`. Solo Miguel
 * (y cualquier futuro platform admin) puede pasar.
 *
 * Resolución del flag (en orden):
 *   1. `req.session.isPlatformAdmin` (Fase 3 lo setea en login).
 *   2. Si no está, consulta `users.is_platform_admin` por `req.session.userId`
 *      y cachea el resultado en la sesión para no volver a consultar
 *      en el mismo request.
 *
 * Errores:
 *   - 401 UNAUTHORIZED si no hay sesión.
 *   - 403 FORBIDDEN si el user existe pero no es platform admin.
 *
 * Reutilizable en Fase 3 cuando `req.user.isPlatformAdmin` esté disponible
 * (ahí se elimina el fallback de DB).
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
