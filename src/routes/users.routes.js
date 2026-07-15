'use strict';
const express = require('express');
const router = express.Router();
const authService = require('../services/auth.service');
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');

// Solo SAC puede gestionar usuarios
router.get('/', requireAuth, requireRole('sac'), async (req, res, next) => {
  try {
    const { role, active, area } = req.query;
    const list = await authService.listUsers({
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

// Obtener usuario por id
router.get('/:id', requireAuth, requireRole('sac'), async (req, res, next) => {
  try {
    const user = await authService.getById(parseInt(req.params.id, 10));
    res.json({ user });
  } catch (err) { next(err); }
});

router.patch('/:id', requireAuth, requireRole('sac'), async (req, res, next) => {
  try {
    // Pasamos req.user al service para que updateUser aplique anti-self-demote
    // (un SAC no puede desactivarse ni cambiar su propio rol).
    const user = await authService.updateUser(
      parseInt(req.params.id, 10),
      req.body || {},
      req.user,
    );
    res.json({ user });
  } catch (err) { next(err); }
});

module.exports = router;
