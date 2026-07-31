/* Documentado por: Miguel Flores */
'use strict'
const fs = require('fs');
const path = require('path');
const config = require('../config');
const firestoreData = require('../firestoreData');
const { notFoundError, forbiddenError } = require('../utils/validators');
const { canViewTicket } = require('../utils/ticket-access');

/**
 * Obtiene un adjunto por id, enriquecido con metadatos del ticket al que pertenece (asignación, estado, área, empresa).
 * @param {String|Number} id - id del adjunto
 * @returns {Promise<Object>} adjunto con datos del ticket asociado
 */
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

/**
 * Obtiene un adjunto verificando que pertenezca al ticket indicado.
 * @param {String|Number} ticketId - id del ticket esperado
 * @param {String|Number} attachmentId - id del adjunto
 * @returns {Promise<Object|null>} adjunto si pertenece al ticket, null en caso contrario
 */
async function getAttachmentForTicket(ticketId, attachmentId) {
  const row = await getAttachment(attachmentId);
  return String(row.ticket_id) === String(ticketId) ? row : null;
}

/**
 * Resuelve la ruta física de un adjunto para poder transmitirlo, validando que el usuario tenga permiso para ver el ticket.
 * @param {String|Number} id - id del adjunto
 * @param {Object} user - usuario que solicita el archivo
 * @returns {Promise<Object>} objeto con la ruta física del archivo y el registro del adjunto
 */
async function streamAttachment(id, user) {
  const att = await getAttachment(id);
  if (!canViewTicket(att, user)) throw forbiddenError();
  const filePath = path.join(config.uploadDir, att.filename);
  if (!fs.existsSync(filePath)) throw notFoundError('Archivo físico no disponible.');
  return { filePath, att };
}

/**
 * Crea el registro de un adjunto ya subido a disco y lo asocia a un ticket.
 * @param {Object} params - datos del adjunto
 * @param {String|Number} params.ticket_id - id del ticket al que pertenece
 * @param {String|Number} params.user_id - id del usuario que lo subió
 * @param {String} params.filename - nombre físico almacenado en disco
 * @param {String} params.original_name - nombre original del archivo
 * @param {String} params.mime_type - tipo MIME del archivo
 * @param {Number} params.size - tamaño del archivo en bytes
 * @returns {Promise<String|Number>} id del adjunto creado
 */
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

/**
 * Alias asíncrono de `create`.
 * @param {Object} params - datos del adjunto
 * @param {String|Number} params.ticket_id - id del ticket al que pertenece
 * @param {String|Number} params.user_id - id del usuario que lo subió
 * @param {String} params.filename - nombre físico almacenado en disco
 * @param {String} params.original_name - nombre original del archivo
 * @param {String} params.mime_type - tipo MIME del archivo
 * @param {Number} params.size - tamaño del archivo en bytes
 * @returns {Promise<String|Number>} id del adjunto creado
 */
async function createAsync({ ticket_id, user_id, filename, original_name, mime_type, size }) {
  return create({ ticket_id, user_id, filename, original_name, mime_type, size });
}

/**
 * Obtiene un adjunto junto con los datos del usuario que lo subió (join).
 * @param {String|Number} attachmentId - id del adjunto
 * @returns {Promise<Object>} adjunto con datos del usuario asociado
 */
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

