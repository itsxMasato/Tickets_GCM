/* Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. */
'use strict';
const express = require('express');
const router = express.Router();
const companyAreasService = require('../services/company-areas.service');
const requireAuth = require('../middleware/requireAuth');
const requirePlatformAdmin = require('../middleware/requirePlatformAdmin');
const { validationError } = require('../utils/validators');

/**
 * company-areas.routes — CRUD de áreas operativas por empresa.
 *
 * Path style: plano con `companyId` en query (GET) o body (POST).
 * El service `listByCompany(companyId, ...)` y `create(companyId, ...)`
 * reciben companyId como argumento separado, así que un solo mount
 * `/api/company-areas` cubre todo. Si en Fase 9 se quiere anidado
 * (`/api/companies/:companyId/areas`), se agrega un segundo router
 * sin romper este.
 *
 * - GET: cualquier autenticado puede listar áreas de una empresa
 *   donde sea miembro (o platform admin). El service valida.
 * - POST/PATCH/DELETE: solo platform admin.
 */

function buildRequester(req) {
  return { ...req.user, isPlatformAdmin: req.session.isPlatformAdmin === true };
}

// Listar áreas de una empresa.
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { companyId } = req.query;
    if (!companyId) throw validationError('El parámetro "companyId" es obligatorio.');
    const areas = await companyAreasService.listByCompany(companyId, {
      activeOnly: req.query.all !== 'true',
      requester: buildRequester(req),
    });
    res.json({ areas });
  } catch (err) { next(err); }
});

// Crear área en una empresa (solo platform admin).
router.post('/', requireAuth, requirePlatformAdmin, async (req, res, next) => {
  try {
    const { companyId, ...rest } = req.body || {};
    if (!companyId) throw validationError('El campo "companyId" es obligatorio.');
    const area = await companyAreasService.create(companyId, rest, buildRequester(req));
    res.status(201).json({ area });
  } catch (err) { next(err); }
});

// Modificar área (solo platform admin).
router.patch('/:id', requireAuth, requirePlatformAdmin, async (req, res, next) => {
  try {
    const area = await companyAreasService.update(req.params.id, req.body || {}, buildRequester(req));
    res.json({ area });
  } catch (err) { next(err); }
});

// Soft-delete área (solo platform admin).
router.delete('/:id', requireAuth, requirePlatformAdmin, async (req, res, next) => {
  try {
    const area = await companyAreasService.softDelete(req.params.id, buildRequester(req));
    res.json({ area });
  } catch (err) { next(err); }
});

module.exports = router;
