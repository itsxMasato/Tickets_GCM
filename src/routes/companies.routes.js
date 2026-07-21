/* Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. */
'use strict';
const express = require('express');
const router = express.Router();
const companiesService = require('../services/companies.service');
const requireAuth = require('../middleware/requireAuth');
const requirePlatformAdmin = require('../middleware/requirePlatformAdmin');
const { notFoundError } = require('../utils/validators');

/**
 * companies.routes — CRUD de empresas (multi-tenant core).
 *
 * Convenciones:
 *   - `buildRequester(req)` agrega `isPlatformAdmin` a req.user leyendo
 *     `req.session.isPlatformAdmin`. Hasta Fase 3 (donde requireAuth lo
 *     absorberá), esta función se duplica en cada router de Fase 2.
 *   - GET `/:id`: si el service devuelve null (defensa cross-tenant o
 *     empresa inexistente), respondemos 404 limpio.
 *   - POST/PATCH/DELETE: gated por `requirePlatformAdmin`. El service
 *     también re-valida internamente, defensa en profundidad.
 *   - `activeOnly` se lee de `req.query.all` (espejo de categories.routes.js).
 */

// Helper inline: setea isPlatformAdmin desde la sesión.
// Se elimina en Fase 3 cuando requireAuth lo absorba.
function buildRequester(req) {
  return { ...req.user, isPlatformAdmin: req.session.isPlatformAdmin === true };
}

// Listar empresas visibles para el requester.
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const companies = await companiesService.list({
      activeOnly: req.query.all !== 'true',
      requester: buildRequester(req),
    });
    res.json({ companies });
  } catch (err) { next(err); }
});

// Detalle de una empresa.
router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const company = await companiesService.getById(req.params.id, {
      requester: buildRequester(req),
    });
    if (!company) throw notFoundError('Empresa no encontrada.');
    res.json({ company });
  } catch (err) { next(err); }
});

// Crear empresa (solo platform admin).
router.post('/', requireAuth, requirePlatformAdmin, async (req, res, next) => {
  try {
    const company = await companiesService.create(req.body || {}, buildRequester(req));
    res.status(201).json({ company });
  } catch (err) { next(err); }
});

// Modificar empresa (solo platform admin).
router.patch('/:id', requireAuth, requirePlatformAdmin, async (req, res, next) => {
  try {
    const company = await companiesService.update(req.params.id, req.body || {}, buildRequester(req));
    res.json({ company });
  } catch (err) { next(err); }
});

// Soft-delete empresa (solo platform admin).
router.delete('/:id', requireAuth, requirePlatformAdmin, async (req, res, next) => {
  try {
    const company = await companiesService.softDelete(req.params.id, buildRequester(req));
    res.json({ company });
  } catch (err) { next(err); }
});

module.exports = router;
