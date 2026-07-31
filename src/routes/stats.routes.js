/* Documentado por: Miguel Flores */
'use strict'
const express = require('express');
const router = express.Router();
const statsService = require('../services/stats.service');
const auditService = require('../services/audit.service');
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');

/**
 * GET /dashboard - Devuelve las estadísticas globales del dashboard principal. Requiere rol 'sac'.
 * @returns {Promise<void>} responde con el resultado de statsService.dashboard()
 */
router.get('/dashboard', requireAuth, requireRole('sac'), async (req, res, next) => {
  try {
    res.json(await statsService.dashboard(req.user));
  } catch (err) { next(err); }
});

/**
 * GET /me - Devuelve las estadísticas personalizadas según el rol del usuario autenticado
 * (admin_area, supervisor_campo o jefe_inmediato); para otros roles devuelve un objeto vacío.
 * @returns {Promise<void>} responde con las estadísticas correspondientes al rol
 */
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const role = req.user.role;
    if (role === 'admin_area') {
      return res.json(await statsService.forUser(req.user.id, req.user));
    }
    if (role === 'supervisor_campo') {
      return res.json(await statsService.forSupervisor(req.user.id, req.user));
    }
    if (role === 'jefe_inmediato') {
      return res.json(await statsService.forJefe(req.user.area, req.user));
    }
    return res.json({});
  } catch (err) { next(err); }
});

/**
 * GET /audit - Lista el log de auditoría paginado por cursor. Requiere rol 'sac'.
 * Acepta filtros por query string: cursor, limit, user_id, action_type, date_from, date_to, search.
 * @returns {Promise<void>} responde con el resultado paginado de auditService.list()
 */
router.get('/audit', requireAuth, requireRole('sac'), async (req, res, next) => {
  try {
    const cursor = req.query.cursor || null;
    const limit = parseInt(req.query.limit, 10) || 50;
    const user_id = req.query.user_id ? parseInt(req.query.user_id, 10) : null;
    const action_type = req.query.action_type || null;
    const date_from = req.query.date_from || null;
    const date_to = req.query.date_to || null;
    const search = req.query.search || null;

    const result = await auditService.list({
      cursor, limit, user_id, action_type, date_from, date_to, search,
      requester: req.user,
    });
    res.json(result);
  } catch (err) { next(err); }
});

/**
 * GET /audit/action-types - Lista los tipos de acción distintos presentes en el log de auditoría. Requiere rol 'sac'.
 * @returns {Promise<void>} responde con { types }
 */
router.get('/audit/action-types', requireAuth, requireRole('sac'), async (req, res, next) => {
  try {
    const types = await auditService.getActionTypes();
    res.json({ types });
  } catch (err) { next(err); }
});

/**
 * GET /audit/active-users - Lista los usuarios que tienen actividad registrada en el log de auditoría. Requiere rol 'sac'.
 * @returns {Promise<void>} responde con { users }
 */
router.get('/audit/active-users', requireAuth, requireRole('sac'), async (req, res, next) => {
  try {
    const users = await auditService.getActiveUsers();
    res.json({ users });
  } catch (err) { next(err); }
});

module.exports = router;
