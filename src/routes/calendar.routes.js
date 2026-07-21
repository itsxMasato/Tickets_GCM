/* Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. */
'use strict';

const express = require('express');
const router = express.Router();

const calendarService = require('../services/calendar.service');
const requireAuth = require('../middleware/requireAuth');

// Todas las rutas requieren login. Cada usuario sólo puede ver/editar sus
// propios eventos — la verificación está dentro del service.

// GET /api/calendar/events?from=ISO&to=ISO
//   Devuelve los eventos del usuario en el rango (default: semana actual).
// GET /api/calendar/events/schedulable-tickets
//   Devuelve tickets visibles por el usuario que aún no están cerrados —
//   son los que se muestran en el panel lateral para arrastrar al Gantt.
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

// POST /api/calendar/events
router.post('/events', requireAuth, async (req, res, next) => {
  try {
    const event = await calendarService.createEvent(req.body || {}, req.user);
    res.status(201).json({ event });
  } catch (err) { next(err); }
});

// PATCH /api/calendar/events/:id
router.patch('/events/:id', requireAuth, async (req, res, next) => {
  try {
    const event = await calendarService.updateEvent(parseInt(req.params.id, 10), req.body || {}, req.user);
    res.json({ event });
  } catch (err) { next(err); }
});

// DELETE /api/calendar/events/:id
router.delete('/events/:id', requireAuth, async (req, res, next) => {
  try {
    const result = await calendarService.deleteEvent(parseInt(req.params.id, 10), req.user);
    res.json(result);
  } catch (err) { next(err); }
});

module.exports = router;
