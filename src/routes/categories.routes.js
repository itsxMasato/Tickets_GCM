/* Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. */
'use strict';
const express = require('express');
const router = express.Router();
const categoriesService = require('../services/categories.service');
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { all } = req.query;
    res.json({ categories: await categoriesService.list({ activeOnly: all !== 'true' }, req.user) });
  } catch (err) { next(err); }
});

router.post('/', requireAuth, requireRole('sac'), async (req, res, next) => {
  try {
    const cat = await categoriesService.create((req.body || {}).name, req.user);
    res.status(201).json({ category: cat });
  } catch (err) { next(err); }
});

router.patch('/:id', requireAuth, requireRole('sac'), async (req, res, next) => {
  try {
    const cat = await categoriesService.update(parseInt(req.params.id, 10), req.body || {});
    res.json({ category: cat });
  } catch (err) { next(err); }
});

router.delete('/:id', requireAuth, requireRole('sac'), async (req, res, next) => {
  try {
    await categoriesService.remove(parseInt(req.params.id, 10));
    res.status(204).send();
  } catch (err) { next(err); }
});

module.exports = router;
