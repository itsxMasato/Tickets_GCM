/* Documentado por: Miguel Flores */
'use strict'

const express = require('express');
const router = express.Router();

const calendarService = require('../services/calendar.service');
const requireAuth = require('../middleware/requireAuth');

router.get('/events/schedulable-tickets', requireAuth, async (req, res, next) => {
  try {
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit || '30', 10) || 30));
    const tickets = await calendarService.listSchedulableTickets(req.user, { limit });
    res.json({ tickets });
  } catch (err) { next(err); }
});

router.get('/events', requireAuth, async (req, res, next) => {
  try {
    const events = await calendarService.listEvents({
      user: req.user,
      from: req.query.from,
      to: req.query.to,
    });
    res.json({ events });
  } catch (err) { next(err); }
});

router.post('/events', requireAuth, async (req, res, next) => {
  try {
    const event = await calendarService.createEvent(req.body || {}, req.user);
    res.status(201).json({ event });
  } catch (err) { next(err); }
});

router.patch('/events/:id', requireAuth, async (req, res, next) => {
  try {
    const event = await calendarService.updateEvent(parseInt(req.params.id, 10), req.body || {}, req.user);
    res.json({ event });
  } catch (err) { next(err); }
});

router.delete('/events/:id', requireAuth, async (req, res, next) => {
  try {
    const result = await calendarService.deleteEvent(parseInt(req.params.id, 10), req.user);
    res.json(result);
  } catch (err) { next(err); }
});

module.exports = router;

