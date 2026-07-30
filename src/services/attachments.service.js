/* Documentado por: Miguel Flores */
'use strict'
const fs = require('fs');
const path = require('path');
const config = require('../config');
const firestoreData = require('../firestoreData');
const { notFoundError, forbiddenError } = require('../utils/validators');
const { canViewTicket } = require('../utils/ticket-access');

async function getAttachment(id) {
  const row = await firestoreData.getAttachment(id);
  if (!row)
    throw notFoundError('Adjunto no encontrado.');
  const ticket = await firestoreData.getTicketWithArea(row.ticket_id);
  return {
    ...row,
    assigned_to: ticket?.assigned_to || null,
    created_by: ticket?.created_by || null,
    status: ticket?.status || null,
    company_id: ticket?.company_id ?? null,
    area: ticket?.area || null,
    assigned_to_area: ticket?.assigned_to_area || null,
    created_by_area: ticket?.created_by_area || null,
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

