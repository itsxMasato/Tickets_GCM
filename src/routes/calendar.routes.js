/* Documentado por: Miguel Flores */
'use strict'

const express = require('express');
const router = express.Router();

const calendarService = require('../services/calendar.service');
const requireAuth = require('../middleware/requireAuth');

/**
 * GET /events/schedulable-tickets - Lista tickets que pueden programarse en el calendario
 * para el usuario autenticado. Acepta ?limit= (entre 1 y 50, default 30).
 * @returns {Promise<void>} responde con { tickets }
 */
router.get('/events/schedulable-tickets', requireAuth, async (req, res, next) => {
  try {
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit || '30', 10) || 30));
    const tickets = await calendarService.listSchedulableTickets(req.user, { limit });
    res.json({ tickets });
  } catch (err) { next(err); }
});

/**
 * GET /events - Lista eventos de calendario visibles para el usuario autenticado,
 * opcionalmente acotados por rango de fechas (?from=, ?to=).
 * @returns {Promise<void>} responde con { events }
 */
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

/**
 * POST /events - Crea un nuevo evento de calendario. Requiere usuario autenticado.
 * @returns {Promise<void>} responde 201 con { event }
 */
router.post('/events', requireAuth, async (req, res, next) => {
  try {
    const event = await calendarService.createEvent(req.body || {}, req.user);
    res.status(201).json({ event });
  } catch (err) { next(err); }
});

/**
 * PATCH /events/:id - Actualiza un evento de calendario existente por id.
 * @returns {Promise<void>} responde con { event } actualizado
 */
router.patch('/events/:id', requireAuth, async (req, res, next) => {
  try {
    const event = await calendarService.updateEvent(parseInt(req.params.id, 10), req.body || {}, req.user);
    res.json({ event });
  } catch (err) { next(err); }
});

/**
 * DELETE /events/:id - Elimina un evento de calendario por id.
 * @returns {Promise<void>} responde con el resultado de la eliminación
 */
router.delete('/events/:id', requireAuth, async (req, res, next) => {
  try {
    const result = await calendarService.deleteEvent(parseInt(req.params.id, 10), req.user);
    res.json(result);
  } catch (err) { next(err); }
});

module.exports = router;

