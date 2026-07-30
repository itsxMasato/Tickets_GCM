/* Documentado por: Miguel Flores */
'use strict'
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const authService = require('../services/auth.service');
const membershipsService = require('../services/memberships.service');
const firestoreData = require('../firestoreData');
const requireAuth = require('../middleware/requireAuth');
const firebaseAdmin = require('../firebaseAdmin');
const { deriveAuthEmail } = require('../utils/deriveAuthEmail');
const { avatarUpload, avatarDir } = require('../middleware/upload');

const NOT_FOUND_MSG = 'No encontramos una cuenta con ese usuario o correo.';

function resolvePlatformAdminFlag(user) {
  if (!user || typeof user !== 'object') return false;
  if (typeof user.isPlatformAdmin === 'boolean') return user.isPlatformAdmin;
  if (typeof user.is_platform_admin === 'boolean') return user.is_platform_admin;
  if (user.isPlatformAdmin === 1 || user.isPlatformAdmin === '1' || user.isPlatformAdmin === true) return true;
  if (user.is_platform_admin === 1 || user.is_platform_admin === '1' || user.is_platform_admin === true) return true;
  return false;
}

async function loadMemberships(userId) {
  try {
    return await membershipsService.listByUser(userId, { requester: { id: userId } });
  } catch (e) {
    return [];
  }
}

async function buildSessionUser(req) {
  const fresh = await authService.getById(req.user.id);
  const memberships = await loadMemberships(req.user.id);
  return { ...fresh, active_company_id: req.user.activeCompanyId, memberships };
}

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

router.post('/resolve-login', async (req, res, next) => {
  try {
    const { identifier } = req.body || {};
    if (!identifier || typeof identifier !== 'string') {
      return res.status(400).json({ error: { message: 'identifier missing' } });
    }

    const user = await firestoreData.getUserByIdentifier(identifier.trim());
    if (!user) return res.status(404).json({ error: { message: NOT_FOUND_MSG } });

    const primary = deriveAuthEmail(user);
    if (!primary)
      return res.status(404).json({ error: { message: NOT_FOUND_MSG } });

    const candidates = Array.from(new Set([primary, (user.email || '').trim().toLowerCase()].filter(Boolean)));

    const auth = firebaseAdmin.getAuth();
    for (const email of candidates) {
      try {
        await auth.getUserByEmail(email);
        return res.json({ email });
      } catch (e) {
        if (e.code !== 'auth/user-not-found') throw e;
      }
    }
    return res.status(404).json({ error: { message: NOT_FOUND_MSG } });
  } catch (err) { next(err); }
});

router.post('/logout', (req, res, next) => {
  if (!req.session) return res.json({ ok: true });
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie('connect.sid');
    res.json({ ok: true });
  });
});

router.post('/verify-password', requireAuth, async (req, res, next) => {
  try {
    const { password } = req.body || {};
    await authService.verifyPasswordForUser(req.user.id, password);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    res.json({ user: await buildSessionUser(req) });
  } catch (err) { next(err); }
});

router.post('/firebase', async (req, res, next) => {
  try {
    const { idToken } = req.body || {};
    if (!idToken) return res.status(400).json({ error: { message: 'Falta el token de autenticación.' } });
    const decoded = await firebaseAdmin.verifyIdToken(idToken);
    const email = (decoded.email || '').toLowerCase();
    if (!email) return res.status(400).json({ error: { message: 'El token no contiene un correo electrónico.' } });

    const user = await firestoreData.getUserByIdentifier(email);
    if (!user)
      return res.status(404).json({ error: { message: NOT_FOUND_MSG } });
    if (!user.active)
      return res.status(403).json({ error: { message: 'Usuario inactivo. Contacte al administrador.' } });

    const activeCompanyId = await membershipsService.resolveDefaultCompanyId(user.id);
    req.session.userId = user.id;
    req.session.role = user.role;
    req.session.full_name = user.full_name;
    req.session.username = user.username;
    req.session.area = user.area || null;
    req.session.isPlatformAdmin = resolvePlatformAdminFlag(user);
    req.session.activeCompanyId = activeCompanyId;
    const memberships = await loadMemberships(user.id);
    res.json({
      user: {
        ...authService.sanitize(user),
        active_company_id: activeCompanyId,
        memberships,
      },
    });
  } catch (err) { next(err); }
});

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

