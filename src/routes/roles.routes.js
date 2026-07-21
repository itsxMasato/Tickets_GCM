/* Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. */
'use strict';
const express = require('express');
const router = express.Router();
const rolesService = require('../services/roles.service');
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');

router.get('/', requireAuth, requireRole('sac'), async (req, res, next) => {
  try {
    const result = await rolesService.list();
    res.json(result);
  } catch (err) { next(err); }
});

router.get('/:role', requireAuth, requireRole('sac'), async (req, res, next) => {
  try {
    const role = req.params.role;
    const perms = await rolesService.get(role);
    res.json({ role, permissions: perms });
  } catch (err) { next(err); }
});

router.patch('/:role', requireAuth, requireRole('sac'), async (req, res, next) => {
  try {
    const role = req.params.role;
    const perms = await rolesService.update(role, req.body || {}, req.user);
    res.json({ role, permissions: perms });
  } catch (err) { next(err); }
});

module.exports = router;
