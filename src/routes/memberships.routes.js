/* Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. */
'use strict';
const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const requirePlatformAdmin = require('../middleware/requirePlatformAdmin');
const membershipsService = require('../services/memberships.service');

/**
 * memberships.routes — CRUD de membresías usuario ↔ empresa.
 *
 * Exporta DOS routers porque las membresías son sub-recurso tanto del
 * user (membresías de un user) como de la empresa (miembros de una
 * empresa). Ver MULTITENANT.md §6.3.
 *
 *   - userMemberships     → montado en /api/users
 *                            CRUD de las membresías de un user
 *                            (`/:userId/memberships[/:id]`)
 *   - companyMemberships  → montado en /api/companies
 *                            listado de miembros de una empresa
 *                            (`/:companyId/memberships`)
 *
 * `buildRequester(req)` es el helper inline estándar de Fase 2 que
 * setea `isPlatformAdmin` desde la sesión. Se elimina en Fase 3.
 *
 * POST recibe en el body: { company_id, role, is_default? }.
 * El `:userId` de la URL es load-bearing (el service lo usa para crear).
 */

function buildRequester(req) {
  return { ...req.user, isPlatformAdmin: req.session.isPlatformAdmin === true };
}

const userMemberships = express.Router();

// GET /api/users/:userId/memberships — listar membresías del user.
userMemberships.get('/:userId/memberships', requireAuth, async (req, res, next) => {
  try {
    const memberships = await membershipsService.listByUser(req.params.userId, {
      requester: buildRequester(req),
    });
    res.json({ memberships });
  } catch (err) { next(err); }
});

// POST /api/users/:userId/memberships — crear membresía (solo platform admin).
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

// PATCH /api/users/:userId/memberships/:id — modificar (solo platform admin).
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

// DELETE /api/users/:userId/memberships/:id — soft-delete (solo platform admin).
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

// GET /api/companies/:companyId/memberships — listar miembros de una empresa.
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
