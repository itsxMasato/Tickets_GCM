'use strict';
const express = require('express');
const router = express.Router();
const statsService = require('../services/stats.service');
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');

// Dashboard global (solo SAC)
router.get('/dashboard', requireAuth, requireRole('sac'), (req, res, next) => {
  try {
    res.json(statsService.dashboard());
  } catch (err) { next(err); }
});

// Stats del usuario autenticado (variante por rol)
router.get('/me', requireAuth, (req, res, next) => {
  try {
    const role = req.user.role;
    if (role === 'admin_area') {
      return res.json(statsService.forUser(req.user.id, req.user));
    }
    if (role === 'supervisor_campo') {
      return res.json(statsService.forSupervisor(req.user.id));
    }
    if (role === 'jefe_inmediato') {
      return res.json(statsService.forJefe(req.user.area));
    }
    return res.json({});
  } catch (err) { next(err); }
});

module.exports = router;
