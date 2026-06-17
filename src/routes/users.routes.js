'use strict';
const express = require('express');
const router = express.Router();
const authService = require('../services/auth.service');
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');

// Solo SAC puede gestionar usuarios
router.get('/', requireAuth, requireRole('sac'), (req, res, next) => {
  try {
    const { role, active, area } = req.query;
    const list = authService.listUsers({
      role,
      active: active === undefined ? undefined : active === 'true',
      area,
    });
    res.json({ users: list });
  } catch (err) { next(err); }
});

router.post('/', requireAuth, requireRole('sac'), async (req, res, next) => {
  try {
    const user = await authService.createUser(req.body || {});
    res.status(201).json({ user });
  } catch (err) { next(err); }
});

router.patch('/:id', requireAuth, requireRole('sac'), async (req, res, next) => {
  try {
    const user = await authService.updateUser(parseInt(req.params.id, 10), req.body || {});
    res.json({ user });
  } catch (err) { next(err); }
});

module.exports = router;
