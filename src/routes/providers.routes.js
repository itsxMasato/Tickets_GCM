/* Documentado por: Miguel Flores */
'use strict'
const express = require('express');
const router = express.Router();
const providersService = require('../services/providers.service');
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');

/**
 * GET / - Lista los proveedores externos. Requiere usuario autenticado.
 * Por defecto solo devuelve los activos; con ?all=true incluye también los inactivos.
 * @returns {Promise<void>} responde con { providers }
 */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { all } = req.query;
    res.json({ providers: await providersService.list({ activeOnly: all !== 'true' }, req.user) });
  } catch (err) { next(err); }
});

/**
 * POST / - Crea un nuevo proveedor externo. Requiere rol 'sac'.
 * @returns {Promise<void>} responde 201 con { provider }
 */
router.post('/', requireAuth, requireRole('sac'), async (req, res, next) => {
  try {
    const provider = await providersService.create((req.body || {}).name, req.user);
    res.status(201).json({ provider });
  } catch (err) { next(err); }
});

/**
 * PATCH /:id - Actualiza un proveedor existente por id. Requiere rol 'sac'.
 * @returns {Promise<void>} responde con { provider } actualizado
 */
router.patch('/:id', requireAuth, requireRole('sac'), async (req, res, next) => {
  try {
    const provider = await providersService.update(parseInt(req.params.id, 10), req.body || {}, req.user);
    res.json({ provider });
  } catch (err) { next(err); }
});

/**
 * DELETE /:id - Elimina (o desactiva) un proveedor por id. Requiere rol 'sac'.
 * @returns {Promise<void>} responde 204 sin contenido
 */
router.delete('/:id', requireAuth, requireRole('sac'), async (req, res, next) => {
  try {
    await providersService.remove(parseInt(req.params.id, 10), req.user);
    res.status(204).send();
  } catch (err) { next(err); }
});

module.exports = router;
