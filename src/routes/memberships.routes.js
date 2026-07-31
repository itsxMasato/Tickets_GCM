/* Documentado por: Miguel Flores */
'use strict'
const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const requirePlatformAdmin = require('../middleware/requirePlatformAdmin');
const membershipsService = require('../services/memberships.service');

/**
 * Construye el objeto "requester" combinando el usuario de la request con su flag
 * de administrador de plataforma (leído de la sesión), para pasarlo al servicio de membresías.
 * @param {Request} req - request de Express con user y session
 * @returns {Object} usuario enriquecido con isPlatformAdmin
 */
function buildRequester(req) {
  return { ...req.user, isPlatformAdmin: req.session.isPlatformAdmin === true };
}

const userMemberships = express.Router();

/**
 * GET /:userId/memberships - Lista las membresías (empresa/área) de un usuario. Requiere usuario autenticado.
 * @returns {Promise<void>} responde con { memberships }
 */
userMemberships.get('/:userId/memberships', requireAuth, async (req, res, next) => {
  try {
    const memberships = await membershipsService.listByUser(req.params.userId, {
      requester: buildRequester(req),
    });
    res.json({ memberships });
  } catch (err) { next(err); }
});

/**
 * POST /:userId/memberships - Crea una nueva membresía para un usuario. Requiere ser administrador de plataforma.
 * @returns {Promise<void>} responde 201 con { membership }
 */
userMemberships.post('/:userId/memberships', requireAuth, requirePlatformAdmin, async (req, res, next) => {
  try {
    const membership = await membershipsService.create(
      req.params.userId,
      req.body || {},
      buildRequester(req),
    );
    res.status(201).json({ membership });
  } catch (err) { next(err); }
});

/**
 * PATCH /:userId/memberships/:id - Actualiza una membresía existente por id. Requiere ser administrador de plataforma.
 * @returns {Promise<void>} responde con { membership } actualizada
 */
userMemberships.patch('/:userId/memberships/:id', requireAuth, requirePlatformAdmin, async (req, res, next) => {
  try {
    const membership = await membershipsService.update(
      req.params.id,
      req.body || {},
      buildRequester(req),
    );
    res.json({ membership });
  } catch (err) { next(err); }
});

/**
 * DELETE /:userId/memberships/:id - Desactiva (borrado lógico) una membresía por id. Requiere ser administrador de plataforma.
 * @returns {Promise<void>} responde con { membership } desactivada
 */
userMemberships.delete('/:userId/memberships/:id', requireAuth, requirePlatformAdmin, async (req, res, next) => {
  try {
    const membership = await membershipsService.softDelete(
      req.params.id,
      buildRequester(req),
    );
    res.json({ membership });
  } catch (err) { next(err); }
});

const companyMemberships = express.Router();

/**
 * GET /:companyId/memberships - Lista las membresías de una empresa. Requiere usuario autenticado.
 * Por defecto solo las activas; con ?all=true incluye inactivas.
 * @returns {Promise<void>} responde con { memberships }
 */
companyMemberships.get('/:companyId/memberships', requireAuth, async (req, res, next) => {
  try {
    const memberships = await membershipsService.listByCompany(req.params.companyId, {
      activeOnly: req.query.all !== 'true',
      requester: buildRequester(req),
    });
    res.json({ memberships });
  } catch (err) { next(err); }
});

module.exports = { userMemberships, companyMemberships };

