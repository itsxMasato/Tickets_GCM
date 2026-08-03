/* Documentado por: Miguel Flores */
'use strict'
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const authService = require('../services/auth.service');
const membershipsService = require('../services/memberships.service');
const requireAuth = require('../middleware/requireAuth');
const { avatarUpload, avatarDir } = require('../middleware/upload');

/**
 * Determina si un usuario tiene el flag de administrador de plataforma, aceptando
 * distintas representaciones del valor (booleano, camelCase/snake_case, número o string).
 * @param {Object} user - registro de usuario
 * @returns {boolean} true si el usuario es administrador de plataforma
 */
function resolvePlatformAdminFlag(user) {
  if (!user || typeof user !== 'object') return false;
  if (typeof user.isPlatformAdmin === 'boolean') return user.isPlatformAdmin;
  if (typeof user.is_platform_admin === 'boolean') return user.is_platform_admin;
  if (user.isPlatformAdmin === 1 || user.isPlatformAdmin === '1' || user.isPlatformAdmin === true) return true;
  if (user.is_platform_admin === 1 || user.is_platform_admin === '1' || user.is_platform_admin === true) return true;
  return false;
}

/**
 * Carga las membresías activas de un usuario; si falla la consulta, devuelve un array vacío
 * en lugar de propagar el error (uso defensivo en el flujo de login/sesión).
 * @param {number|string} userId - id del usuario
 * @returns {Promise<Array>} lista de membresías (o vacía si falló la consulta)
 */
async function loadMemberships(userId) {
  try {
    return await membershipsService.listByUser(userId, { requester: { id: userId } });
  } catch (e) {
    return [];
  }
}

/**
 * Reconstruye el objeto de usuario de sesión con datos frescos (usuario actualizado,
 * empresa activa y membresías), para devolver al cliente tras login o cambios de sesión.
 * @param {Request} req - request de Express con user y session
 * @returns {Promise<Object>} usuario enriquecido con active_company_id y memberships
 */
async function buildSessionUser(req) {
  const fresh = await authService.getById(req.user.id);
  const memberships = await loadMemberships(req.user.id);
  return { ...fresh, active_company_id: req.user.activeCompanyId, memberships };
}

/**
 * POST /login - Autentica con username/password (flujo legacy), crea la sesión del usuario
 * (incluyendo rol, empresa activa y flag de administrador de plataforma) y devuelve el usuario.
 * @returns {Promise<void>} responde con { user }
 */
router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body || {};
    const user = await authService.login(username, password);
    const activeCompanyId = await membershipsService.resolveDefaultCompanyId(user.id);
    req.session.userId = user.id;
    req.session.role = user.role;
    req.session.full_name = user.full_name;
    req.session.username = user.username;
    req.session.area = user.area || null;
    req.session.isPlatformAdmin = resolvePlatformAdminFlag(user);
    req.session.activeCompanyId = activeCompanyId;
    const memberships = await loadMemberships(user.id);
    res.json({ user: { ...user, active_company_id: activeCompanyId, memberships } });
  } catch (err) { next(err); }
});

/**
 * POST /logout - Destruye la sesión del usuario actual y limpia la cookie de sesión.
 * @returns {void} responde con { ok: true }
 */
router.post('/logout', (req, res, next) => {
  if (!req.session) return res.json({ ok: true });
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie('connect.sid');
    res.json({ ok: true });
  });
});

/**
 * POST /verify-password - Verifica que la contraseña dada coincida con la del usuario autenticado
 * (usado como reautenticación para operaciones sensibles).
 * @returns {Promise<void>} responde con { ok: true } o error si la contraseña no coincide
 */
router.post('/verify-password', requireAuth, async (req, res, next) => {
  try {
    const { password } = req.body || {};
    await authService.verifyPasswordForUser(req.user.id, password);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /me - Devuelve los datos actuales del usuario autenticado (perfil, empresa activa y membresías).
 * @returns {Promise<void>} responde con { user }
 */
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    res.json({ user: await buildSessionUser(req) });
  } catch (err) { next(err); }
});

/**
 * POST /active-company - Cambia la empresa activa de la sesión del usuario autenticado.
 * Administradores de plataforma y rol 'sac' pueden elegir cualquier empresa; el resto solo
 * empresas de las que sean miembro activo.
 * @returns {Promise<void>} responde con { user } actualizado o 400/403 según el caso
 */
router.post('/active-company', requireAuth, async (req, res, next) => {
  try {
    const companyId = Number((req.body || {}).company_id);
    if (!companyId) {
      return res.status(400).json({ error: { message: 'El campo "company_id" es obligatorio.' } });
    }
    const canPickAny = req.user.isPlatformAdmin || req.user.role === 'sac';
    if (!canPickAny) {
      const isMember = await membershipsService.isActiveMemberOfCompany(req.user.id, companyId);
      if (!isMember) {
        return res.status(403).json({ error: { message: 'No es miembro activo de esa empresa.' } });
      }
    }
    req.session.activeCompanyId = companyId;
    res.json({ user: await buildSessionUser(req) });
  } catch (err) { next(err); }
});

/**
 * POST /avatar - Sube una nueva imagen de avatar para el usuario autenticado (multipart, campo 'file'),
 * borra el avatar anterior del disco si existía, y actualiza la referencia en el usuario.
 * @returns {Promise<void>} responde con { user } actualizado
 */
router.post('/avatar', requireAuth, avatarUpload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: { message: 'No se envió ninguna imagen.' } });
    }
    const before = await authService.getById(req.user.id);
    if (before.avatar_url) {
      const oldPath = path.join(avatarDir, path.basename(before.avatar_url));
      fs.unlink(oldPath, () => {});
    }
    const avatarUrl = `/uploads/avatars/${req.file.filename}`;
    await authService.updateAvatar(req.user.id, avatarUrl);
    res.json({ user: await buildSessionUser(req) });
  } catch (err) {
    if (req.file && req.file.path) {
      try { fs.unlinkSync(req.file.path); } catch (_) {}
    }
    next(err);
  }
});

module.exports = router;

