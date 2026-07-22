/* Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. */
'use strict';

const firestore = require('../firestore');
const firestoreData = require('../firestoreData');
const auditService = require('./audit.service');
const { toId, getTicketById } = firestoreData;
const {
  validationError, notFoundError, forbiddenError,
  requireString, optionalString, optionalEnum,
} = require('../utils/validators');
const { CALENDAR_EVENT_TYPE_VALUES, CALENDAR_EVENT_COLORS } = require('../orm/enums');

// Coerce de fechas: el front envía ISO 8601 con Z, queremos string SQL
// 'YYYY-MM-DD HH:MM:SS' (mismo formato que firestore.nowSql() y los tickets).
function toSqlDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().replace('T', ' ').slice(0, 19);
}

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

// ── Validación ────────────────────────────────────────────────────────────────
// Centralizada: la usan createEvent y updateEvent. Lanza validationError(...)
// con mensajes específicos para que el front pueda mostrarlos en el modal.
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

  // start < end (cuando ambos están presentes en el payload)
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

// ── Listado por rango ────────────────────────────────────────────────────────
// Devuelve los eventos del usuario autenticado cuyo [start_at, end_at]
// intersecta [from, to]. Es O(n) sobre el rango del usuario (esperado < 200).
async function listEvents({ user, from, to }) {
  const fromSql = toSqlDate(from) || '1970-01-01 00:00:00';
  // Para el extremo superior: queremos cualquier evento que EMPIECE
  // dentro del rango O que ya haya empezado antes pero siga terminando
  // después del `from`. El query más simple (y suficiente para el uso
  // personal del Gantt) es: start_at <= to AND end_at >= from.
  const toSql = toSqlDate(to) || '2999-12-31 23:59:59';

  // Firestore still requires a composite index for `user_id == ...` plus
  // `start_at <= ...`, so only query by user and do the range overlap filter
  // in memory. The user's personal calendar event set is expected to be small.
  const rows = await firestore.findMany(
    'calendar_events',
    [
      ['user_id', '==', toId(user.id)],
    ]
  );

  return rows
    .filter((row) => row.start_at <= toSql && row.end_at >= fromSql)
    .sort((a, b) => {
      if (a.start_at === b.start_at) return 0;
      if (a.start_at === undefined || a.start_at === null) return 1;
      if (b.start_at === undefined || b.start_at === null) return -1;
      return a.start_at < b.start_at ? -1 : 1;
    })
    .map(decorate);
}

// ── Crear ────────────────────────────────────────────────────────────────────
async function createEvent(payload, user) {
  const data = validateEventPayload(payload, { partial: false });
  // Si el cliente envía ticket_id, validamos que exista (no pedimos
  // canView aquí — el front sólo lo vinculará desde un ticket que ya
  // puede ver; si no, el FK fallará al guardar).
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
    created_at: now,
    updated_at: now,
  });
  const decorated = decorate(doc);

  await auditService.logAsync({
    user_id: user.id,
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

// ── Actualizar ───────────────────────────────────────────────────────────────
// Solo el dueño. Validamos todos los campos presentes. Si el patch es
// parcial (sólo start_at, p. ej.) y ya hay un end_at previo, el orden se
// valida contra el patch combinado.
async function updateEvent(id, payload, user) {
  const existing = decorate(await firestore.getById('calendar_events', id));
  if (!existing) throw notFoundError('Evento de calendario no encontrado.');
  if (toId(existing.user_id) !== toId(user.id)) {
    throw forbiddenError('No puedes modificar eventos de otro usuario.');
  }
  const patch = validateEventPayload(payload, { partial: true });
  if (Object.keys(patch).length === 0) return existing;

  // Si el patch cambia start o end, validar el rango combinado.
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
  // Si el cliente subió un ticket_id, el type se ajusta automáticamente
  // (un evento vinculado a un ticket se considera 'ticket_linked').
  if (patch.ticket_id !== undefined) {
    patch.type = patch.ticket_id ? 'ticket_linked' : 'personal';
  }
  const updated = await firestore.updateDoc('calendar_events', id, patch);
  const decorated = decorate(updated);

  await auditService.logAsync({
    user_id: user.id,
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

// ── Borrar ───────────────────────────────────────────────────────────────────
async function deleteEvent(id, user) {
  const existing = decorate(await firestore.getById('calendar_events', id));
  if (!existing) throw notFoundError('Evento de calendario no encontrado.');
  if (toId(existing.user_id) !== toId(user.id)) {
    throw forbiddenError('No puedes eliminar eventos de otro usuario.');
  }
  const db = firestore.getFirestore();
  await db.collection('calendar_events').doc(String(id)).delete();

  await auditService.logAsync({
    user_id: user.id,
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

// ── Tickets "disponibles" para arrastrar al Gantt ────────────────────────────
// Devuelve los tickets que el usuario puede ver y que aún no han sido cerrados
// y están pendientes de iniciar o ya están en proceso.
async function listSchedulableTickets(user, { limit = 30 } = {}) {
  // `firestoreData.listTickets` no soporta filtros de negación como
  // `status: '!cerrado'`, por lo que traemos los tickets visibles al usuario
  // y filtramos por los estados permitidos en memoria.
  const allowedStatuses = new Set(['recibido', 'asignado', 'en_proceso']);
  const result = await firestoreData.listTickets({}, user, 1, Math.max(limit * 5, 100));
  return (result.tickets || [])
    .filter((t) => allowedStatuses.has(t.status))
    .slice(0, limit);
}

function emit(event, payload, opts = {}) {
  try {
    const { emit: emitSocket } = require('../sockets');
    emitSocket(event, payload, opts);
  } catch (e) {
    /* socket no inicializado aún */
  }
}

module.exports = {
  listEvents,
  createEvent,
  updateEvent,
  deleteEvent,
  listSchedulableTickets,
  // Helpers expuestos para los tests y posibles consumers internos.
  toSqlDate,
  validateEventPayload,
  CALENDAR_EVENT_COLORS,
  CALENDAR_EVENT_TYPE_VALUES,
};
