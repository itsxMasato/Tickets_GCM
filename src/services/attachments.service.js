'use strict';
const fs = require('fs');
const path = require('path');
const { getDb } = require('../db/connection');
const config = require('../config');
const { notFoundError, forbiddenError } = require('../utils/validators');

function getAttachment(id) {
  const db = getDb();
  const att = db
    .prepare(`SELECT a.*, t.assigned_to, t.created_by
              FROM attachments a
              JOIN tickets t ON t.id = a.ticket_id
              WHERE a.id = ?`)
    .get(id);
  if (!att) throw notFoundError('Adjunto no encontrado.');
  return att;
}

function streamAttachment(id, user) {
  const att = getAttachment(id);
  if (!canViewTicket(att, user)) throw forbiddenError();
  const filePath = path.join(config.uploadDir, att.filename);
  if (!fs.existsSync(filePath)) throw notFoundError('Archivo físico no disponible.');
  return { filePath, att };
}

function canViewTicket(ticket, user) {
  if (!user) return false;
  if (user.role === 'admin_area' || user.role === 'sac') return true;
  if (ticket.assigned_to && ticket.assigned_to === user.id) return true;
  if (ticket.created_by && ticket.created_by === user.id) return true;
  return false;
}

function getAttachmentForTicket(ticketId, attachmentId) {
  const db = getDb();
  return db
    .prepare('SELECT * FROM attachments WHERE id = ? AND ticket_id = ?')
    .get(attachmentId, ticketId);
}

module.exports = { getAttachment, streamAttachment, getAttachmentForTicket, canViewTicket };
