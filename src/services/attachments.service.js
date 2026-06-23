'use strict';
const fs = require('fs');
const path = require('path');
const orm = require('../orm');
const config = require('../config');
const { notFoundError, forbiddenError } = require('../utils/validators');

// ── serialize ────────────────────────────────────────────────────────────────
// SQLite devolvía el row crudo (text/INTEGER) tal cual.
// TypeORM (createQueryBuilder + getRawOne/getRawMany) devuelve las columnas
// planas con `uploaded_at` como Date. Mapeamos a string con el formato que
// el frontend espera (formatDateTime).
function serialize(row) {
  if (!row) return null;
  return {
    ...row,
    uploaded_at: row.uploaded_at instanceof Date
      ? row.uploaded_at.toISOString().replace('T', ' ').slice(0, 19)
      : row.uploaded_at,
  };
}

// ── canViewTicket ────────────────────────────────────────────────────────────
// Set ESTRICTAMENTE conservador: solo admin_area, sac, asignado y creador
// pueden descargar adjuntos. NO se unifica con tickets.service.canView,
// que también permite jefe_inmediato y supervisor_campo con reglas distintas.
//
// La diferencia es intencional: la decisión de quién puede VER un adjunto es
// más conservadora que quién puede VER/EDITAR el ticket. Documentado para
// batch 3 (tickets.service) cuando esa función se revise.
function canViewTicket(ticket, user) {
  if (!user) return false;
  if (user.role === 'admin_area' || user.role === 'sac') return true;
  if (ticket.assigned_to && ticket.assigned_to === user.id) return true;
  if (ticket.created_by && ticket.created_by === user.id) return true;
  return false;
}

// ── getAttachment(id) — async ────────────────────────────────────────────────
// JOIN con tickets para traer assigned_to / created_by (los usa canViewTicket).
// Patrón: createQueryBuilder.leftJoin sobre la tabla 'tickets' (igual que
// audit.service.list hace con 'users'). La Attachment entity no declara la
// relation porque las FKs las emite el DBA en T-SQL.
async function getAttachment(id) {
  const repo = await orm.getRepository(orm.Attachment);
  const row = await repo.createQueryBuilder('a')
    .leftJoin('tickets', 't', 't.id = a.ticket_id')
    .select([
      'a.id            AS id',
      'a.ticket_id     AS ticket_id',
      'a.user_id       AS user_id',
      'a.comment_id    AS comment_id',
      'a.filename      AS filename',
      'a.original_name AS original_name',
      'a.mime_type     AS mime_type',
      'a.size          AS size',
      'a.uploaded_at   AS uploaded_at',
      't.assigned_to   AS assigned_to',
      't.created_by    AS created_by',
    ])
    .where('a.id = :id', { id })
    .getRawOne();
  if (!row) throw notFoundError('Adjunto no encontrado.');
  return row;
}

// ── getAttachmentForTicket(ticketId, attachmentId) — async ───────────────────
// Dead code hoy (sin call-sites en el repo). Se mantiene por simetría con el
// resto del servicio y como API pública para un futuro caller. Migración
// trivial; eliminarlo es un PR de una línea cuando se confirme que no se usa.
async function getAttachmentForTicket(ticketId, attachmentId) {
  const repo = await orm.getRepository(orm.Attachment);
  const row = await repo.findOne({ where: { id: attachmentId, ticket_id: ticketId } });
  return serialize(row);
}

// ── streamAttachment(id, user) — async ───────────────────────────────────────
async function streamAttachment(id, user) {
  const att = await getAttachment(id);
  if (!canViewTicket(att, user)) throw forbiddenError();
  const filePath = path.join(config.uploadDir, att.filename);
  if (!fs.existsSync(filePath)) throw notFoundError('Archivo físico no disponible.');
  return { filePath, att };
}

// ── create(payload) — SYNC (legacy) ─────────────────────────────────────────
// Conservada por compatibilidad con call-sites externos que aún no migraron
// al ORM. Cuando todos los call-sites estén migrados, create se borra.
//
// Solo hace el INSERT puro (no check). La autorización ya la corrió
// addAttachment via tickets.service.canView (más permisiva que canViewTicket).
function create({ ticket_id, user_id, filename, original_name, mime_type, size }) {
  const repo = orm.getRepositorySync(orm.Attachment);
  const saved = repo.save(repo.create({
    ticket_id, user_id, filename, original_name, mime_type, size,
  }));
  return saved.id;
}

// ── createAsync(payload) — async ───────────────────────────────────────────
// Versión async que consumen los servicios migrados al ORM (tickets desde
// batch 3). Misma semántica: INSERT puro, devuelve el id de la fila nueva.
// Migrar create → createAsync en un call-site es 1 línea (agregar await y
// renombrar).
async function createAsync({ ticket_id, user_id, filename, original_name, mime_type, size }) {
  const repo = await orm.getRepository(orm.Attachment);
  const saved = await repo.save(repo.create({
    ticket_id, user_id, filename, original_name, mime_type, size,
  }));
  return saved.id;
}

// ── createWithJoin(attachmentId) — async ─────────────────────────────────────
// Re-read del row joined con users (full_name → user_name, role → user_role)
// para que el emit('attachment:added', ...) mantenga la shape legacy que el
// frontend (client/components/attachments.js) y el socket esperan.
async function createWithJoin(attachmentId) {
  const repo = await orm.getRepository(orm.Attachment);
  const row = await repo.createQueryBuilder('a')
    .leftJoin('users', 'u', 'u.id = a.user_id')
    .select([
      'a.id            AS id',
      'a.ticket_id     AS ticket_id',
      'a.user_id       AS user_id',
      'a.comment_id    AS comment_id',
      'a.filename      AS filename',
      'a.original_name AS original_name',
      'a.mime_type     AS mime_type',
      'a.size          AS size',
      'a.uploaded_at   AS uploaded_at',
      'u.full_name     AS user_name',
      'u.role          AS user_role',
    ])
    .where('a.id = :id', { id: attachmentId })
    .getRawOne();
  return serialize(row);
}

module.exports = {
  getAttachment,
  streamAttachment,
  getAttachmentForTicket,
  canViewTicket,
  create,            // sync (legacy)
  createAsync,       // async (lo usan los servicios migrados al ORM)
  createWithJoin,
};
