/* Documentado por: Miguel Flores */
'use strict'
const express = require('express');
const router = express.Router();
const ticketsService = require('../services/tickets.service');
const attachmentsService = require('../services/attachments.service');
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');
const { upload } = require('../middleware/upload');

/**
 * GET / - Lista tickets visibles para el usuario autenticado, según los filtros
 * pasados por query string (estado, categoría, área, etc.) y su rol/alcance.
 * @returns {Promise<void>} responde con el resultado paginado de ticketsService.listTickets()
 */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const result = await ticketsService.listTickets(req.query, req.user);
    res.json(result);
  } catch (err) { next(err); }
});

/**
 * GET /:id - Obtiene el detalle de un ticket por id, si el usuario autenticado tiene acceso.
 * @returns {Promise<void>} responde con { ticket }
 */
router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const ticket = await ticketsService.getTicket(parseInt(req.params.id, 10), req.user);
    res.json({ ticket });
  } catch (err) { next(err); }
});

/**
 * POST / - Crea un nuevo ticket. Requiere usuario autenticado.
 * @returns {Promise<void>} responde 201 con { ticket }
 */
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const ticket = await ticketsService.createTicket(req.body || {}, req.user);
    res.status(201).json({ ticket });
  } catch (err) { next(err); }
});

/**
 * PATCH /:id - Actualiza campos de un ticket existente por id.
 * @returns {Promise<void>} responde con { ticket } actualizado
 */
router.patch('/:id', requireAuth, async (req, res, next) => {
  try {
    const ticket = await ticketsService.updateTicket(parseInt(req.params.id, 10), req.body || {}, req.user);
    res.json({ ticket });
  } catch (err) { next(err); }
});

/**
 * POST /:id/assign - Asigna un ticket a un usuario/área. Requiere rol 'sac' o 'jefe_inmediato'.
 * @returns {Promise<void>} responde con { ticket } actualizado
 */
router.post('/:id/assign', requireAuth, requireRole('sac', 'jefe_inmediato'), async (req, res, next) => {
  try {
    const ticket = await ticketsService.assignTicket(parseInt(req.params.id, 10), req.body || {}, req.user);
    res.json({ ticket });
  } catch (err) { next(err); }
});

/**
 * POST /:id/status - Cambia el estado de un ticket (ej. en curso, solucionado).
 * @returns {Promise<void>} responde con { ticket } actualizado
 */
router.post('/:id/status', requireAuth, async (req, res, next) => {
  try {
    const ticket = await ticketsService.changeStatus(parseInt(req.params.id, 10), req.body || {}, req.user);
    res.json({ ticket });
  } catch (err) { next(err); }
});

/**
 * POST /:id/location - Cambia la ubicación física de un ticket (taller / proveedor externo).
 * @returns {Promise<void>} responde con { ticket } actualizado
 */
router.post('/:id/location', requireAuth, async (req, res, next) => {
  try {
    const ticket = await ticketsService.changeLocation(parseInt(req.params.id, 10), req.body || {}, req.user);
    res.json({ ticket });
  } catch (err) { next(err); }
});

/**
 * POST /:id/comments - Agrega un comentario a un ticket.
 * @returns {Promise<void>} responde 201 con { comment }
 */
router.post('/:id/comments', requireAuth, async (req, res, next) => {
  try {
    const comment = await ticketsService.addComment(parseInt(req.params.id, 10), req.body || {}, req.user);
    res.status(201).json({ comment });
  } catch (err) { next(err); }
});

/**
 * POST /:id/attachments - Sube un archivo adjunto a un ticket (multipart, campo 'file').
 * Si no se envía archivo responde 400; si falla el guardado, borra el archivo temporal subido.
 * @returns {Promise<void>} responde 201 con { attachment }
 */
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

/**
 * GET /:id/attachments/:attId - Descarga/streamea un archivo adjunto de un ticket,
 * seteando Content-Type y Content-Disposition según el adjunto.
 * @returns {Promise<void>} envía el archivo como respuesta
 */
router.get('/:id/attachments/:attId', requireAuth, async (req, res, next) => {
  try {
    const { filePath, att } = await attachmentsService.streamAttachment(parseInt(req.params.attId, 10), req.user);
    res.setHeader('Content-Type', att.mime_type);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(att.original_name)}"`);
    res.sendFile(filePath);
  } catch (err) { next(err); }
});

module.exports = router;

