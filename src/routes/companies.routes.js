/* Documentado por: Miguel Flores */
'use strict'
const express = require('express');
const router = express.Router();
const companiesService = require('../services/companies.service');
const requireAuth = require('../middleware/requireAuth');
const requirePlatformAdmin = require('../middleware/requirePlatformAdmin');
const { notFoundError } = require('../utils/validators');

/**
 * Construye el objeto "requester" combinando el usuario de la request con su flag
 * de administrador de plataforma (leído de la sesión), para pasarlo al servicio de empresas.
 * @param {Request} req - request de Express con user y session
 * @returns {Object} usuario enriquecido con isPlatformAdmin
 */
function buildRequester(req) {
  return { ...req.user, isPlatformAdmin: req.session.isPlatformAdmin === true };
}

/**
 * GET / - Lista las empresas visibles para el usuario autenticado.
 * Por defecto solo las activas; con ?all=true incluye inactivas (según permisos).
 * @returns {Promise<void>} responde con { companies }
 */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const companies = await companiesService.list({
      activeOnly: req.query.all !== 'true',
      requester: buildRequester(req),
    });
    res.json({ companies });
  } catch (err) { next(err); }
});

/**
 * GET /:id - Obtiene una empresa por id. Responde 404 si no existe.
 * @returns {Promise<void>} responde con { company }
 */
router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const company = await companiesService.getById(req.params.id, {
      requester: buildRequester(req),
    });
    if (!company) throw notFoundError('Empresa no encontrada.');
    res.json({ company });
  } catch (err) { next(err); }
});

/**
 * POST / - Crea una nueva empresa. Requiere ser administrador de plataforma.
 * @returns {Promise<void>} responde 201 con { company }
 */
router.post('/', requireAuth, requirePlatformAdmin, async (req, res, next) => {
  try {
    const company = await companiesService.create(req.body || {}, buildRequester(req));
    res.status(201).json({ company });
  } catch (err) { next(err); }
});

/**
 * PATCH /:id - Actualiza una empresa existente por id. Requiere ser administrador de plataforma.
 * @returns {Promise<void>} responde con { company } actualizada
 */
router.patch('/:id', requireAuth, requirePlatformAdmin, async (req, res, next) => {
  try {
    const company = await companiesService.update(req.params.id, req.body || {}, buildRequester(req));
    res.json({ company });
  } catch (err) { next(err); }
});

/**
 * DELETE /:id - Desactiva (borrado lógico) una empresa por id. Requiere ser administrador de plataforma.
 * @returns {Promise<void>} responde con { company } desactivada
 */
router.delete('/:id', requireAuth, requirePlatformAdmin, async (req, res, next) => {
  try {
    const company = await companiesService.softDelete(req.params.id, buildRequester(req));
    res.json({ company });
  } catch (err) { next(err); }
});

module.exports = router;

