/* Documentado por: Miguel Flores */
'use strict'
const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const requirePlatformAdmin = require('../middleware/requirePlatformAdmin');
const membershipsService = require('../services/memberships.service');

function buildRequester(req) {
  return { ...req.user, isPlatformAdmin: req.session.isPlatformAdmin === true };
}

const userMemberships = express.Router();

userMemberships.get('/:userId/memberships', requireAuth, async (req, res, next) => {
  try {
    const memberships = await membershipsService.listByUser(req.params.userId, {
      requester: buildRequester(req),
    });
    res.json({ memberships });
  } catch (err) { next(err); }
});

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

