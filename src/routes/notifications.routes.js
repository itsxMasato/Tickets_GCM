'use strict';
const express = require('express');
const router = express.Router();
const notificationsService = require('../services/notifications.service');
const requireAuth = require('../middleware/requireAuth');

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { limit, unread } = req.query;
    const list = await notificationsService.listForUser(req.user.id, {
      limit: limit ? Math.min(100, parseInt(limit, 10)) : 30,
      onlyUnread: unread === 'true',
    });
    res.json({ notifications: list });
  } catch (err) { next(err); }
});

router.get('/unread-count', requireAuth, async (req, res, next) => {
  try {
    const c = await notificationsService.getUnreadCountAsync(req.user.id);
    res.json({ count: c });
  } catch (err) { next(err); }
});

router.post('/mark-read', requireAuth, async (req, res, next) => {
  try {
    const result = await notificationsService.markRead(req.user.id, req.body || {});
    res.json(result);
  } catch (err) { next(err); }
});

module.exports = router;
