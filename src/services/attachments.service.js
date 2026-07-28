/* Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. */
﻿'use strict';
const fs = require('fs');
const path = require('path');
const config = require('../config');
const firestoreData = require('../firestoreData');
const { notFoundError, forbiddenError } = require('../utils/validators');
const { canViewTicket } = require('../utils/ticket-access');

async function getAttachment(id) {
  const row = await firestoreData.getAttachment(id);
  if (!row) throw notFoundError('Adjunto no encontrado.');
  const ticket = await firestoreData.getTicketById(row.ticket_id);
  return {
    ...row,
    assigned_to: ticket?.assigned_to || null,
    created_by: ticket?.created_by || null,
    // canViewTicket() (ticket-access.js) necesita el status real del ticket
    // para el chequeo de jefe_inmediato (solo ve solucionado); sin esto
    // quedaba undefined y jefe_inmediato nunca podia ver ningun adjunto.
    status: ticket?.status || null,
  };
}

async function getAttachmentForTicket(ticketId, attachmentId) {
  const row = await getAttachment(attachmentId);
  return String(row.ticket_id) === String(ticketId) ? row : null;
}

async function streamAttachment(id, user) {
  const att = await getAttachment(id);
  if (!canViewTicket(att, user)) throw forbiddenError();
  const filePath = path.join(config.uploadDir, att.filename);
  if (!fs.existsSync(filePath)) throw notFoundError('Archivo físico no disponible.');
  return { filePath, att };
}

async function create({ ticket_id, user_id, filename, original_name, mime_type, size }) {
  const row = await firestoreData.addAttachment({
    ticket_id,
    user_id,
    filename,
    original_name,
    mime_type,
    size,
  });
  return row.id;
}

async function createAsync({ ticket_id, user_id, filename, original_name, mime_type, size }) {
  return create({ ticket_id, user_id, filename, original_name, mime_type, size });
}

async function createWithJoin(attachmentId) {
  const row = await firestoreData.getAttachmentWithUser(attachmentId);
  if (!row) throw notFoundError('Adjunto no encontrado.');
  return row;
}

module.exports = {
  getAttachment,
  streamAttachment,
  getAttachmentForTicket,
  canViewTicket,
  create,
  createAsync,
  createWithJoin,
};
