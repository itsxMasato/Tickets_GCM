'use strict';
const express = require('express');
const router = express.Router();
const authService = require('../services/auth.service');
const firestoreData = require('../firestoreData');
const requireAuth = require('../middleware/requireAuth');
const firebaseAdmin = require('../firebaseAdmin');

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

router.post('/logout', (req, res, next) => {
  if (!req.session) return res.json({ ok: true });
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie('connect.sid');
    res.json({ ok: true });
  });
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
