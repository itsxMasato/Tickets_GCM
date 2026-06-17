'use strict';
const express = require('express');
const router = express.Router();
const authService = require('../services/auth.service');
const requireAuth = require('../middleware/requireAuth');

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

module.exports = router;
