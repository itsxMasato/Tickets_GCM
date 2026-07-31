/* Documentado por: Miguel Flores */
'use strict'
const express = require('express');
const router = express.Router();
const notificationsService = require('../services/notifications.service');
const requireAuth = require('../middleware/requireAuth');

/**
 * GET / - Lista las notificaciones del usuario autenticado, más recientes primero.
 * Acepta ?limit= (máx 100, default 30) y ?unread=true para filtrar solo no leídas.
 * Además emite un log de diagnóstico ([diag:bell]) con detalle de la consulta.
 * @returns {Promise<void>} responde con { notifications }
 */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { limit, unread } = req.query;
    const opts = {
      limit: limit ? Math.min(100, parseInt(limit, 10)) : 30,
      onlyUnread: unread === 'true',
    };
    const list = await notificationsService.listForUser(req.user.id, opts);
    console.log('[diag:bell] GET /api/notifications', {
      userId: req.user.id,
      role: req.user.role,
      query: { limit, unread },
      opts,
      resultCount: list.length,
      firstItems: list.slice(0, 2).map((n) => ({
        id: n.id, type: n.type, read: n.read, ticket_id: n.ticket_id, created_at: n.created_at,
      })),
    });
    res.json({ notifications: list });
  } catch (err) { next(err); }
});

/**
 * GET /unread-count - Devuelve la cantidad de notificaciones no leídas del usuario autenticado.
 * @returns {Promise<void>} responde con { count }
 */
router.get('/unread-count', requireAuth, async (req, res, next) => {
  try {
    const c = await notificationsService.getUnreadCountAsync(req.user.id);
    res.json({ count: c });
  } catch (err) { next(err); }
});

/**
 * POST /mark-read - Marca como leídas una o varias notificaciones del usuario autenticado
 * según lo indicado en el body (ids específicos o todas).
 * @returns {Promise<void>} responde con el resultado de la operación de marcado
 */
router.post('/mark-read', requireAuth, async (req, res, next) => {
  try {
    const result = await notificationsService.markRead(req.user.id, req.body || {});
    res.json(result);
  } catch (err) { next(err); }
});

module.exports = router;

