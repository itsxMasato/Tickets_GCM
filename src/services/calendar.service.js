/* Documentado por: Miguel Flores */
'use strict'

const firestore = require('../firestore');
const firestoreData = require('../firestoreData');
const auditService = require('./audit.service');
const { toId, getTicketById } = firestoreData;
const {
  validationError, notFoundError, forbiddenError,
  requireString, optionalString, optionalEnum,
} = require('../utils/validators');
const { CALENDAR_EVENT_TYPE_VALUES, CALENDAR_EVENT_COLORS } = require('../orm/enums');

/**
 * Convierte un valor de fecha a formato SQL ("YYYY-MM-DD HH:mm:ss"), devolviendo null si es inválido o vacío.
 * @param {Date|String|Number} value - fecha a convertir
 * @returns {String|null} fecha en formato SQL, o null si no es válida
 */
function toSqlDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().replace('T', ' ').slice(0, 19);
}

/**
 * Convierte un registro crudo de evento de calendario al formato plano expuesto por la API.
 * @param {Object} row - registro crudo del evento
 * @returns {Object|null} evento decorado, o null si no se recibió registro
 */
function decorate(row) {
  if (!row) return null;
  return {
    id: toId(row.id),
    user_id: toId(row.user_id),
    ticket_id: row.ticket_id != null ? toId(row.ticket_id) : null,
    title: row.title || '',
    notes: row.notes || null,
    start_at: row.start_at || null,
    end_at: row.end_at || null,
    color: row.color || null,
    type: row.type || 'personal',
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  };
}

/**
 * Valida y normaliza el payload de un evento de calendario (título, notas, fechas, color, tipo, ticket vinculado), en modo completo o parcial (para updates).
 * @param {Object} payload - datos del evento a validar
 * @param {Object} [options] - opciones de validación
 * @param {Boolean} [options.partial=false] - si true, solo valida los campos presentes (para actualizaciones parciales)
 * @returns {Object} campos validados y normalizados
 */
function validateEventPayload(payload, { partial = false } = {}) {
  const out = {};

  if (!partial || payload.title !== undefined) {
    const title = requireString(payload.title, 'título', 200);
    if (title.length > 200) throw validationError('El título no puede superar los 200 caracteres.');
    out.title = title;
  }

  if (payload.notes !== undefined) {
    out.notes = optionalString(payload.notes, 'notas', 2000);
  }

  if (!partial || payload.start_at !== undefined) {
    const start = toSqlDate(payload.start_at);
    if (!start) throw validationError('La fecha de inicio es obligatoria.');
    out.start_at = start;
  }

  if (!partial || payload.end_at !== undefined) {
    const end = toSqlDate(payload.end_at);
    if (!end) throw validationError('La fecha de fin es obligatoria.');
    out.end_at = end;
  }

  if (out.start_at && out.end_at) {
    if (new Date(out.start_at.replace(' ', 'T')) >= new Date(out.end_at.replace(' ', 'T'))) {
      throw validationError('La hora de fin debe ser posterior a la hora de inicio.');
    }
  }

  if (payload.color !== undefined && payload.color !== null && payload.color !== '') {
    const color = String(payload.color);
    if (!CALENDAR_EVENT_COLORS.includes(color)) {
      throw validationError('Color no válido. Usa: ' + CALENDAR_EVENT_COLORS.join(', '));
    }
    out.color = color;
  } else if (payload.color === null || payload.color === '') {
    out.color = null;
  }

  if (!partial || payload.type !== undefined) {
    const type = optionalEnum(payload.type, 'tipo', CALENDAR_EVENT_TYPE_VALUES) || 'personal';
    out.type = type;
  }

  if (payload.ticket_id !== undefined) {
    out.ticket_id = payload.ticket_id == null || payload.ticket_id === ''
      ? null
      : toId(payload.ticket_id);
  }

  return out;
}

/**
 * Lista los eventos de calendario activos de un usuario dentro de un rango de fechas, ordenados por fecha de inicio.
 * @param {Object} params - parámetros de consulta
 * @param {Object} params.user - usuario dueño de los eventos
 * @param {Date|String} [params.from] - fecha desde la cual filtrar
 * @param {Date|String} [params.to] - fecha hasta la cual filtrar
 * @returns {Promise<Array>} eventos del usuario en el rango indicado
 */
async function listEvents({ user, from, to }) {
  const fromSql = toSqlDate(from) || '1970-01-01 00:00:00';
  const toSql = toSqlDate(to) || '2999-12-31 23:59:59';

  const rows = await firestore.findMany(
    'calendar_events',
    [
      ['user_id', '==', toId(user.id)],
    ]
  );

  return rows
    .filter((row) => row.active !== 0 && row.active !== false)
    .filter((row) => row.start_at <= toSql && row.end_at >= fromSql)
    .sort((a, b) => {
      if (a.start_at === b.start_at) return 0;
      if (a.start_at === undefined || a.start_at === null) return 1;
      if (b.start_at === undefined || b.start_at === null) return -1;
      return a.start_at < b.start_at ? -1 : 1;
    })
    .map(decorate);
}

/**
 * Crea un evento de calendario para un usuario, opcionalmente vinculado a un ticket existente. Registra auditoría y notifica en tiempo real.
 * @param {Object} payload - datos del evento a crear
 * @param {Object} user - usuario dueño del evento
 * @returns {Promise<Object>} evento creado decorado
 */
async function createEvent(payload, user) {
  const data = validateEventPayload(payload, { partial: false });
  if (data.ticket_id != null) {
    const ticket = await getTicketById(data.ticket_id);
    if (!ticket) throw validationError('El ticket indicado no existe.');
  }
  const now = firestore.nowSql();
  const doc = await firestore.createDoc('calendar_events', {
    user_id: toId(user.id),
    ticket_id: data.ticket_id != null ? toId(data.ticket_id) : null,
    title: data.title,
    notes: data.notes || null,
    start_at: data.start_at,
    end_at: data.end_at,
    color: data.color || 'ocean',
    type: data.type || (data.ticket_id ? 'ticket_linked' : 'personal'),
    active: 1,
    created_at: now,
    updated_at: now,
  });
  const decorated = decorate(doc);

  await auditService.logAsync({
    user_id: user.id,
    company_id: user.activeCompanyId,
    action_type: 'calendar_event_created',
    target_type: 'calendar_event',
    target_id: decorated.id,
    target_code: null,
    description: `Programó "${decorated.title}" en su calendario`,
    new_value: { title: decorated.title, start_at: decorated.start_at, end_at: decorated.end_at, ticket_id: decorated.ticket_id },
  });

  emit('calendar:event_created', { event: decorated }, { user: user.id });
  return decorated;
}

/**
 * Actualiza un evento de calendario existente, validando que pertenezca al usuario y que el rango de fechas siga siendo válido. Registra auditoría y notifica en tiempo real.
 * @param {String|Number} id - id del evento a actualizar
 * @param {Object} payload - campos a actualizar
 * @param {Object} user - usuario que realiza la actualización
 * @returns {Promise<Object>} evento actualizado decorado
 */
async function updateEvent(id, payload, user) {
  const existing = decorate(await firestore.getById('calendar_events', id));
  if (!existing) throw notFoundError('Evento de calendario no encontrado.');
  if (toId(existing.user_id) !== toId(user.id)) {
    throw forbiddenError('No puedes modificar eventos de otro usuario.');
  }
  const patch = validateEventPayload(payload, { partial: true });
  if (Object.keys(patch).length === 0)
    return existing;

  const newStart = patch.start_at || existing.start_at;
  const newEnd = patch.end_at || existing.end_at;
  if (new Date(newStart.replace(' ', 'T')) >= new Date(newEnd.replace(' ', 'T'))) {
    throw validationError('La hora de fin debe ser posterior a la hora de inicio.');
  }

  if (patch.ticket_id !== undefined && patch.ticket_id != null) {
    const ticket = await getTicketById(patch.ticket_id);
    if (!ticket) throw validationError('El ticket indicado no existe.');
  }

  patch.updated_at = firestore.nowSql();
  if (patch.ticket_id !== undefined) {
    patch.type = patch.ticket_id ? 'ticket_linked' : 'personal';
  }
  const updated = await firestore.updateDoc('calendar_events', id, patch);
  const decorated = decorate(updated);

  await auditService.logAsync({
    user_id: user.id,
    company_id: user.activeCompanyId,
    action_type: 'calendar_event_updated',
    target_type: 'calendar_event',
    target_id: decorated.id,
    target_code: null,
    description: `Modificó el evento "${decorated.title}"`,
    old_value: { title: existing.title, start_at: existing.start_at, end_at: existing.end_at },
    new_value: { title: decorated.title, start_at: decorated.start_at, end_at: decorated.end_at },
  });

  emit('calendar:event_updated', { event: decorated }, { user: user.id });
  return decorated;
}

/**
 * Elimina (desactiva) un evento de calendario, validando que pertenezca al usuario. Registra auditoría y notifica en tiempo real.
 * @param {String|Number} id - id del evento a eliminar
 * @param {Object} user - usuario que realiza la eliminación
 * @returns {Promise<Object>} objeto con el id del evento eliminado
 */
async function deleteEvent(id, user) {
  const existing = decorate(await firestore.getById('calendar_events', id));
  if (!existing) throw notFoundError('Evento de calendario no encontrado.');
  if (toId(existing.user_id) !== toId(user.id)) {
    throw forbiddenError('No puedes eliminar eventos de otro usuario.');
  }
  await firestore.updateDoc('calendar_events', id, { active: 0, updated_at: firestore.nowSql() });

  await auditService.logAsync({
    user_id: user.id,
    company_id: user.activeCompanyId,
    action_type: 'calendar_event_deleted',
    target_type: 'calendar_event',
    target_id: existing.id,
    target_code: null,
    description: `Eliminó el evento "${existing.title}"`,
    old_value: { title: existing.title, start_at: existing.start_at, end_at: existing.end_at },
  });

  emit('calendar:event_deleted', { eventId: existing.id }, { user: user.id });
  return { id: existing.id };
}

/**
 * Lista tickets del usuario que están en un estado programable (recibido, asignado, en_proceso) para poder vincularlos a un evento de calendario.
 * @param {Object} user - usuario para el cual se listan los tickets
 * @param {Object} [options] - opciones de listado
 * @param {Number} [options.limit=30] - cantidad máxima de tickets a devolver
 * @returns {Promise<Array>} tickets programables
 */
async function listSchedulableTickets(user, { limit = 30 } = {}) {
  const allowedStatuses = new Set(['recibido', 'asignado', 'en_proceso']);
  const result = await firestoreData.listTickets({}, user, { limit: Math.max(limit * 5, 100) });
  return (result.tickets || [])
    .filter((t) => allowedStatuses.has(t.status))
    .slice(0, limit);
}

/**
 * Emite por socket.io un evento relacionado a un evento de calendario. Silencia errores de socket.
 * @param {String} event - nombre del evento a emitir
 * @param {Object} payload - datos del evento
 * @param {Object} [opts] - opciones de enrutamiento del socket (ej. user)
 * @returns {void}
 */
function emit(event, payload, opts = {}) {
  try {
    const { emit: emitSocket } = require('../sockets');
    emitSocket(event, payload, opts);
  } catch (e) {}
}

module.exports = {
  listEvents,
  createEvent,
  updateEvent,
  deleteEvent,
  listSchedulableTickets,
  toSqlDate,
  validateEventPayload,
  CALENDAR_EVENT_COLORS,
  CALENDAR_EVENT_TYPE_VALUES,
};

