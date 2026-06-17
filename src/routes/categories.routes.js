'use strict';
const express = require('express');
const router = express.Router();
const categoriesService = require('../services/categories.service');
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');

router.get('/', requireAuth, (req, res, next) => {
  try {
    const { all } = req.query;
    res.json({ categories: categoriesService.list({ activeOnly: all !== 'true' }) });
  } catch (err) { next(err); }
});

router.post('/', requireAuth, requireRole('sac'), (req, res, next) => {
  try {
    const cat = categoriesService.create((req.body || {}).name);
    res.status(201).json({ category: cat });
  } catch (err) { next(err); }
});

router.patch('/:id', requireAuth, requireRole('sac'), (req, res, next) => {
  try {
    const cat = categoriesService.update(parseInt(req.params.id, 10), req.body || {});
    res.json({ category: cat });
  } catch (err) { next(err); }
});

module.exports = router;
