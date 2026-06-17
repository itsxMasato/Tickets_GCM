'use strict';
const express = require('express');
const router = express.Router();
const ticketsService = require('../services/tickets.service');
const attachmentsService = require('../services/attachments.service');
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');
const { upload } = require('../middleware/upload');

// Listar
router.get('/', requireAuth, (req, res, next) => {
  try {
    const result = ticketsService.listTickets(req.query, req.user);
    res.json(result);
  } catch (err) { next(err); }
});

// Detalle
router.get('/:id', requireAuth, (req, res, next) => {
  try {
    const ticket = ticketsService.getTicket(parseInt(req.params.id, 10), req.user);
    res.json({ ticket });
  } catch (err) { next(err); }
});

// Crear
router.post('/', requireAuth, (req, res, next) => {
  try {
    const ticket = ticketsService.createTicket(req.body || {}, req.user);
    res.status(201).json({ ticket });
  } catch (err) { next(err); }
});

// Editar metadatos
router.patch('/:id', requireAuth, (req, res, next) => {
  try {
    const ticket = ticketsService.updateTicket(parseInt(req.params.id, 10), req.body || {}, req.user);
    res.json({ ticket });
  } catch (err) { next(err); }
});

// Asignar / reasignar
router.post('/:id/assign', requireAuth, requireRole('sac', 'jefe_inmediato'), (req, res, next) => {
  try {
    const ticket = ticketsService.assignTicket(parseInt(req.params.id, 10), req.body || {}, req.user);
    res.json({ ticket });
  } catch (err) { next(err); }
});

// Cambiar estado
router.post('/:id/status', requireAuth, (req, res, next) => {
  try {
    const ticket = ticketsService.changeStatus(parseInt(req.params.id, 10), req.body || {}, req.user);
    res.json({ ticket });
  } catch (err) { next(err); }
});

// Comentar
router.post('/:id/comments', requireAuth, (req, res, next) => {
  try {
    const comment = ticketsService.addComment(parseInt(req.params.id, 10), req.body || {}, req.user);
    res.status(201).json({ comment });
  } catch (err) { next(err); }
});

// Subir adjunto
router.post('/:id/attachments', requireAuth, upload.single('file'), (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: { code: 'NO_FILE', message: 'No se envió ningún archivo.' } });
    const att = ticketsService.addAttachment(parseInt(req.params.id, 10), req.file, req.user);
    res.status(201).json({ attachment: att });
  } catch (err) {
    // Si multer guardó el archivo pero falló la lógica, intentar eliminarlo
    if (req.file && req.file.path) {
      try { require('fs').unlinkSync(req.file.path); } catch (_) {}
    }
    next(err);
  }
});

// Descargar adjunto
router.get('/:id/attachments/:attId', requireAuth, (req, res, next) => {
  try {
    const { filePath, att } = attachmentsService.streamAttachment(parseInt(req.params.attId, 10), req.user);
    res.setHeader('Content-Type', att.mime_type);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(att.original_name)}"`);
    res.sendFile(filePath);
  } catch (err) { next(err); }
});

module.exports = router;
