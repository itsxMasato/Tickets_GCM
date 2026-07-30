/* Documentado por: Miguel Flores */
'use strict'
const express = require('express');
const router = express.Router();
const roleLabelsService = require('../services/role-labels.service');
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const labels = await roleLabelsService.list();
    res.json({ labels });
  } catch (err) { next(err); }
});

router.patch('/:role', requireAuth, requireRole('sac'), async (req, res, next) => {
  try {
    const role = req.params.role;
    const label = await roleLabelsService.update(role, req.body || {}, req.user);
    res.json({ role, label });
  } catch (err) { next(err); }
});

module.exports = router;

