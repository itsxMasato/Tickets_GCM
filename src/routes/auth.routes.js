/* Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. */
'use strict';
const express = require('express');
const router = express.Router();
const authService = require('../services/auth.service');
const firestoreData = require('../firestoreData');
const requireAuth = require('../middleware/requireAuth');
const firebaseAdmin = require('../firebaseAdmin');
const { deriveAuthEmail } = require('../utils/deriveAuthEmail');

// Mensaje único de "no encontrado" para no filtrar si el identificador
// correspondía a un usuario inexistente o a uno sin cuenta en Firebase Auth.
const NOT_FOUND_MSG = 'No encontramos una cuenta con ese usuario o correo.';

router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body || {};
    const user = await authService.login(username, password);
    req.session.userId = user.id;
    req.session.role = user.role;
    req.session.full_name = user.full_name;
    req.session.username = user.username;
    req.session.area = user.area || null;
    res.json({ user });
  } catch (err) { next(err); }
});

// POST /auth/resolve-login — dado un username o email, devuelve el email
// canónico con el que ese usuario está registrado en Firebase Auth. El
// frontend usa esto antes de llamar a signInWithEmailAndPassword para
// soportar tanto el username corto ("Miguel") como el email real con el
// que se registró ("miguel@gmail.com").
//
// Privacidad: si no hay match, devolvemos 404 con el mismo cuerpo
// indistinguible, así un atacante no puede enumerar usuarios válidos.
router.post('/resolve-login', async (req, res, next) => {
  try {
    const { identifier } = req.body || {};
    if (!identifier || typeof identifier !== 'string') {
      return res.status(400).json({ error: { message: 'identifier missing' } });
    }

    const user = await firestoreData.getUserByIdentifier(identifier.trim());
    if (!user) return res.status(404).json({ error: { message: NOT_FOUND_MSG } });

    const primary = deriveAuthEmail(user);
    if (!primary) return res.status(404).json({ error: { message: NOT_FOUND_MSG } });

    // Probar primero el email primario. Si Firebase Auth no lo tiene
    // (p.ej. bootstrap corrió con un set de datos parcial), caer al
    // alternativo: sintético ↔ real.
    const candidates = primary.endsWith('@ticketsgcm.local')
      ? [primary, (user.email || '').trim().toLowerCase()].filter(Boolean)
      : [(user.username || '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '') + '@ticketsgcm.local', primary].filter(Boolean);

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

router.get('/me', requireAuth, (req, res) => {
  res.json({
    user: {
      id: req.user.id,
      username: req.user.username,
      full_name: req.user.full_name,
      role: req.user.role,
      area: req.user.area || null,
    },
  });
});

// POST /auth/firebase — intercambia un ID token de Firebase por sesión local.
router.post('/firebase', async (req, res, next) => {
  try {
    const { idToken } = req.body || {};
    if (!idToken) return res.status(400).json({ error: { message: 'idToken missing' } });
    const decoded = await firebaseAdmin.verifyIdToken(idToken);
    const email = (decoded.email || '').toLowerCase();
    if (!email) return res.status(400).json({ error: { message: 'Token does not contain email' } });

    const user = await firestoreData.getUserByIdentifier(email);
    if (!user) return res.status(404).json({ error: { message: 'No local user mapped to this Firebase account' } });
    if (!user.active) return res.status(403).json({ error: { message: 'User inactive' } });

    // Crear sesión
    req.session.userId = user.id;
    req.session.role = user.role;
    req.session.full_name = user.full_name;
    req.session.username = user.username;
    req.session.area = user.area || null;
    res.json({ user: { id: user.id, username: user.username, full_name: user.full_name, role: user.role, area: user.area } });
  } catch (err) { next(err); }
});

module.exports = router;
