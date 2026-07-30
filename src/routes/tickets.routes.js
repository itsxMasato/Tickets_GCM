/* Documentado por: Miguel Flores */
'use strict'
const express = require('express');
const router = express.Router();
const ticketsService = require('../services/tickets.service');
const attachmentsService = require('../services/attachments.service');
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');
const { upload } = require('../middleware/upload');

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const result = await ticketsService.listTickets(req.query, req.user);
    res.json(result);
  } catch (err) { next(err); }
});

router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const ticket = await ticketsService.getTicket(parseInt(req.params.id, 10), req.user);
    res.json({ ticket });
  } catch (err) { next(err); }
});

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const ticket = await ticketsService.createTicket(req.body || {}, req.user);
    res.status(201).json({ ticket });
  } catch (err) { next(err); }
});

router.patch('/:id', requireAuth, async (req, res, next) => {
  try {
    const ticket = await ticketsService.updateTicket(parseInt(req.params.id, 10), req.body || {}, req.user);
    res.json({ ticket });
  } catch (err) { next(err); }
});

router.post('/:id/assign', requireAuth, requireRole('sac', 'jefe_inmediato'), async (req, res, next) => {
  try {
    const ticket = await ticketsService.assignTicket(parseInt(req.params.id, 10), req.body || {}, req.user);
    res.json({ ticket });
  } catch (err) { next(err); }
});

router.post('/:id/status', requireAuth, async (req, res, next) => {
  try {
    const ticket = await ticketsService.changeStatus(parseInt(req.params.id, 10), req.body || {}, req.user);
    res.json({ ticket });
  } catch (err) { next(err); }
});

router.post('/:id/comments', requireAuth, async (req, res, next) => {
  try {
    const comment = await ticketsService.addComment(parseInt(req.params.id, 10), req.body || {}, req.user);
    res.status(201).json({ comment });
  } catch (err) { next(err); }
});

router.post('/:id/attachments', requireAuth, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: { code: 'NO_FILE', message: 'No se envió ningún archivo.' } });
    const att = await ticketsService.addAttachment(parseInt(req.params.id, 10), req.file, req.user);
    res.status(201).json({ attachment: att });
  } catch (err) {
    if (req.file && req.file.path) {
      try { require('fs').unlinkSync(req.file.path); } catch (_) {}
    }
    next(err);
  }
});

router.get('/:id/attachments/:attId', requireAuth, async (req, res, next) => {
  try {
    const { filePath, att } = await attachmentsService.streamAttachment(parseInt(req.params.attId, 10), req.user);
    res.setHeader('Content-Type', att.mime_type);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(att.original_name)}"`);
    res.sendFile(filePath);
  } catch (err) { next(err); }
});

module.exports = router;

