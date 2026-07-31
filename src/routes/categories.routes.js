/* Documentado por: Miguel Flores */
'use strict'
const express = require('express');
const router = express.Router();
const categoriesService = require('../services/categories.service');
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');

/**
 * GET / - Lista las categorías de tickets. Requiere usuario autenticado.
 * Por defecto solo devuelve las activas; con ?all=true incluye también las inactivas.
 * @returns {Promise<void>} responde con { categories }
 */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { all } = req.query;
    res.json({ categories: await categoriesService.list({ activeOnly: all !== 'true' }, req.user) });
  } catch (err) { next(err); }
});

/**
 * POST / - Crea una nueva categoría de tickets. Requiere rol 'sac'.
 * @returns {Promise<void>} responde 201 con { category }
 */
router.post('/', requireAuth, requireRole('sac'), async (req, res, next) => {
  try {
    const cat = await categoriesService.create((req.body || {}).name, req.user);
    res.status(201).json({ category: cat });
  } catch (err) { next(err); }
});

/**
 * PATCH /:id - Actualiza una categoría existente por id. Requiere rol 'sac'.
 * @returns {Promise<void>} responde con { category } actualizada
 */
router.patch('/:id', requireAuth, requireRole('sac'), async (req, res, next) => {
  try {
    const cat = await categoriesService.update(parseInt(req.params.id, 10), req.body || {}, req.user);
    res.json({ category: cat });
  } catch (err) { next(err); }
});

/**
 * DELETE /:id - Elimina (o desactiva) una categoría por id. Requiere rol 'sac'.
 * @returns {Promise<void>} responde 204 sin contenido
 */
router.delete('/:id', requireAuth, requireRole('sac'), async (req, res, next) => {
  try {
    await categoriesService.remove(parseInt(req.params.id, 10), req.user);
    res.status(204).send();
  } catch (err) { next(err); }
});

module.exports = router;

