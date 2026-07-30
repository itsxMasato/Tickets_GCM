/* Documentado por: Miguel Flores */
'use strict'
const express = require('express');
const router = express.Router();
const companiesService = require('../services/companies.service');
const requireAuth = require('../middleware/requireAuth');
const requirePlatformAdmin = require('../middleware/requirePlatformAdmin');
const { notFoundError } = require('../utils/validators');

function buildRequester(req) {
  return { ...req.user, isPlatformAdmin: req.session.isPlatformAdmin === true };
}

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const companies = await companiesService.list({
      activeOnly: req.query.all !== 'true',
      requester: buildRequester(req),
    });
    res.json({ companies });
  } catch (err) { next(err); }
});

router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const company = await companiesService.getById(req.params.id, {
      requester: buildRequester(req),
    });
    if (!company) throw notFoundError('Empresa no encontrada.');
    res.json({ company });
  } catch (err) { next(err); }
});

router.post('/', requireAuth, requirePlatformAdmin, async (req, res, next) => {
  try {
    const company = await companiesService.create(req.body || {}, buildRequester(req));
    res.status(201).json({ company });
  } catch (err) { next(err); }
});

router.patch('/:id', requireAuth, requirePlatformAdmin, async (req, res, next) => {
  try {
    const company = await companiesService.update(req.params.id, req.body || {}, buildRequester(req));
    res.json({ company });
  } catch (err) { next(err); }
});

router.delete('/:id', requireAuth, requirePlatformAdmin, async (req, res, next) => {
  try {
    const company = await companiesService.softDelete(req.params.id, buildRequester(req));
    res.json({ company });
  } catch (err) { next(err); }
});

module.exports = router;

