/* Documentado por: Miguel Flores */
'use strict'
const firestoreData = require('../firestoreData');
const auditService = require('./audit.service');
const notificationsService = require('./notifications.service');
const attachmentsService = require('./attachments.service');
const { canViewTicket: canView, sameCompany, resolveTicketArea } = require('../utils/ticket-access');
const {
  validationError, notFoundError, forbiddenError, conflictError,
  requireString, optionalString, optionalEnum, TICKET_STATUS, PRIORITIES, STATUS_LABEL,
} = require('../utils/validators');

const TRANSITIONS = {
  recibido:    ['asignado', 'cerrado'],
  asignado:    ['en_proceso', 'asignado'],
  en_proceso:  ['solucionado', 'asignado'],
  solucionado: ['cerrado', 'reabierto', 'en_proceso'],
  cerrado:     ['reabierto'],
  reabierto:   ['en_proceso', 'asignado'],
};

/**
 * Determina si un usuario puede editar los metadatos (título, descripción, prioridad, categoría) de un ticket: admins de plataforma siempre, SAC de la misma empresa, o el supervisor de campo creador mientras el ticket siga en estado "recibido".
 * @param {Object} ticket - ticket a evaluar
 * @param {Object} user - usuario que intenta editar
 * @returns {Boolean} true si puede editar los metadatos
 */
function canEditMeta(ticket, user) {
  if (user.isPlatformAdmin)
    return true;
  if (user.role === 'sac')
    return sameCompany(ticket, user);
  if (user.role === 'supervisor_campo') {
    return ticket.created_by === user.id && ticket.status === 'recibido';
  }
  return false;
}

/**
 * Determina si un usuario puede asignar un ticket a un responsable: admins de plataforma siempre, o SAC/jefe inmediato de la misma empresa.
 * @param {Object} ticket - ticket a evaluar
 * @param {Object} user - usuario que intenta asignar
 * @returns {Boolean} true si puede asignar el ticket
 */
function canAssign(ticket, user) {
  if (user.isPlatformAdmin) return true;
  if (user.role === 'sac' || user.role === 'jefe_inmediato') return sameCompany(ticket, user);
  return false;
}

/**
 * Determina si el rol del usuario tiene permiso para cerrar tickets (jefe inmediato o SAC).
 * @param {Object} user - usuario a evaluar
 * @returns {Boolean} true si puede cerrar tickets
 */
function canClose(user) {
  return user.role === 'jefe_inmediato' || user.role === 'sac';
}

/**
 * Determina si el rol del usuario tiene permiso para reabrir tickets (jefe inmediato o SAC).
 * @param {Object} user - usuario a evaluar
 * @returns {Boolean} true si puede reabrir tickets
 */
function canReopen(user) {
  return user.role === 'jefe_inmediato' || user.role === 'sac';
}

/**
 * Determina si un usuario puede cambiar el estado de un ticket al estado destino indicado, según reglas específicas por rol: admin de plataforma siempre; SAC de la misma empresa; jefe inmediato solo para cerrar/reabrir tickets de su área; admin de área solo sobre tickets que tiene asignados y solo hacia en_proceso/solucionado.
 * @param {Object} ticket - ticket a evaluar
 * @param {Object} user - usuario que intenta cambiar el estado
 * @param {String} next - estado destino propuesto
 * @returns {Boolean} true si la transición está permitida para ese usuario
 */
function canChangeStatus(ticket, user, next) {
  if (user.isPlatformAdmin) return true;
  if (user.role === 'sac') return sameCompany(ticket, user);
  if (user.role === 'jefe_inmediato') {
    if (!sameCompany(ticket, user) || !['cerrado', 'reabierto'].includes(next)) return false;
    const area = resolveTicketArea(ticket);
    return area == null || area === user.area;
  }
  if (user.role === 'admin_area') {
    if (ticket.assigned_to !== user.id) return false;
    return ['en_proceso', 'solucionado'].includes(next);
  }
  return false;
}

/**
 * Enriquece un ticket con el área resuelta (asignado/creador) y la etiqueta legible de su estado.
 * @param {Object} ticket - ticket crudo a decorar
 * @returns {Object|null} ticket decorado, o null si no se recibió ticket
 */
function decorate(ticket) {
  if (!ticket) return null;
  return {
    ...ticket,
    area: ticket.area || ticket.assigned_to_area || ticket.created_by_area || null,
    status_label: STATUS_LABEL[ticket.status] || ticket.status,
  };
}

/**
 * Crea un nuevo ticket para la empresa activa del usuario, notifica a todos los usuarios SAC y registra la creación en auditoría.
 * @param {Object} payload - datos del ticket (title, description, priority, category_id)
 * @param {Object} user - usuario que crea el ticket
 * @returns {Promise<Object>} ticket creado decorado
 */
async function createTicket(payload, user) {
  if (user.activeCompanyId == null && !user.isPlatformAdmin) {
    throw validationError('Tu usuario no tiene una empresa activa asignada. Contactá al administrador antes de crear un ticket.');
  }
  const title = requireString(payload.title, 'título', 200);
  const description = requireString(payload.description, 'descripción', 5000);
  const priority = optionalEnum(payload.priority, 'prioridad', PRIORITIES) || 'media';
  const category_id = payload.category_id ? parseInt(payload.category_id, 10) : null;

  const ticket = await firestoreData.createTicket({ title, description, category_id, priority }, user);
  const decorated = decorate(ticket);

  const sacUsers = await firestoreData.listUsers({ role: 'sac', active: true });
  for (const sacUser of sacUsers) {
    await notificationsService.createAsync({
      user_id: sacUser.id,
      type: 'ticket_created',
      ticket_id: decorated.id,
      title: `Nuevo ticket: ${decorated.code}`,
      body: `${user.full_name} creó el ticket "${decorated.title}".`,
    });
  }

  await auditService.logAsync({
    user_id: user.id,
    company_id: user.activeCompanyId,
    action_type: 'ticket_created',
    target_type: 'ticket',
    target_id: decorated.id,
    target_code: decorated.code,
    description: `Creó el ticket "${title}"`,
    new_value: { code: decorated.code, title, priority, status: 'recibido' },
  });

  emit('ticket:created', { ticket: decorated }, { role: 'sac' });
  return decorated;
}

/**
 * Lista tickets paginados aplicando filtros y el alcance de visibilidad del usuario.
 * @param {Object} filters - filtros de búsqueda y paginación (incluye limit, cursor)
 * @param {Object} user - usuario que realiza la consulta
 * @returns {Promise<Object>} resultado paginado con tickets decorados
 */
async function listTickets(filters, user) {
  const limit = Math.min(100, Math.max(1, parseInt(filters.limit || '25', 10)));
  const cursor = typeof filters.cursor === 'string' && filters.cursor ? filters.cursor : null;
  const result = await firestoreData.listTickets(filters, user, { cursor, limit });
  return { ...result, tickets: result.tickets.map(decorate) };
}

/**
 * Obtiene el detalle de un ticket por id, validando que el usuario tenga permiso para verlo.
 * @param {String|Number} id - id del ticket
 * @param {Object} user - usuario que solicita el ticket
 * @returns {Promise<Object>} ticket decorado
 */
async function getTicket(id, user) {
  const ticket = await firestoreData.getTicketDetail(id, user);
  if (!ticket) throw notFoundError('Ticket no encontrado.');
  if (!canView(ticket, user)) throw forbiddenError();
  return decorate(ticket);
}

/**
 * Actualiza los metadatos de un ticket (título, descripción, prioridad, categoría), validando permisos del usuario y notificando el cambio en tiempo real.
 * @param {String|Number} id - id del ticket a actualizar
 * @param {Object} payload - campos a actualizar
 * @param {Object} user - usuario que realiza la actualización
 * @returns {Promise<Object>} ticket actualizado decorado
 */
async function updateTicket(id, payload, user) {
  const ticket = await firestoreData.getTicketById(id);
  if (!ticket) throw notFoundError('Ticket no encontrado.');
  if (!canEditMeta(ticket, user)) throw forbiddenError();

  const patch = {};
  if (payload.title !== undefined) patch.title = requireString(payload.title, 'título', 200);
  if (payload.description !== undefined) patch.description = requireString(payload.description, 'descripción', 5000);
  if (payload.priority !== undefined) patch.priority = optionalEnum(payload.priority, 'prioridad', PRIORITIES) || ticket.priority;
  if (payload.category_id !== undefined) patch.category_id = payload.category_id ? parseInt(payload.category_id, 10) : null;

  if (Object.keys(patch).length === 0) {
    return decorate(await firestoreData.getTicketDetail(id, user));
  }

  const updated = await firestoreData.updateTicket(id, patch);
  const decorated = decorate(updated);
  emit('ticket:updated', { ticketId: id, ticket: decorated, by: user.id }, { room: 'tickets' });
  return decorated;
}

/**
 * Asigna un ticket a un usuario responsable, notifica al nuevo encargado, registra auditoría y emite el cambio en tiempo real.
 * @param {String|Number} id - id del ticket a asignar
 * @param {Object} payload - datos de la asignación (to_user_id, notes)
 * @param {Object} user - usuario que realiza la asignación
 * @returns {Promise<Object>} ticket actualizado decorado
 */
async function assignTicket(id, payload, user) {
  const ticket = await firestoreData.getTicketById(id);
  if (!ticket) throw notFoundError('Ticket no encontrado.');
  if (!canAssign(ticket, user)) throw forbiddenError('Solo SAC o jefes inmediatos pueden asignar tickets.');
  const to_user_id = parseInt(payload.to_user_id, 10);
  if (!to_user_id) throw validationError('Debe indicar el encargado destino.');
  const notes = optionalString(payload.notes, 'notas', 1000) || null;

  let updated;
  try {
    updated = await firestoreData.assignTicket(id, to_user_id, user, notes);
  } catch (err) {
    if (err.code === 'NOT_FOUND') throw notFoundError(err.message);
    if (err.code === 'VALIDATION_ERROR') throw validationError(err.message);
    throw err;
  }
  const decorated = decorate(updated);

  await notificationsService.createAsync({
    user_id: to_user_id,
    type: 'ticket_assigned',
    ticket_id: id,
    title: `Te asignaron un ticket: ${decorated.code}`,
    body: `Asignado por ${user.full_name}${notes ? ` — ${notes}` : ''}`,
  });

  await auditService.logAsync({
    user_id: user.id,
    company_id: user.activeCompanyId,
    action_type: 'ticket_assigned',
    target_type: 'ticket',
    target_id: id,
    target_code: decorated.code,
    description: `Asignó el ticket a ${updated.assigned_to_name}${notes ? ` — ${notes}` : ''}`,
    old_value: ticket.assigned_to ? { assigned_to: ticket.assigned_to } : null,
    new_value: { assigned_to: to_user_id, status: updated.status },
  });

  emit('ticket:assigned', {
    ticketId: id,
    ticket: decorated,
    from: ticket.assigned_to || null,
    to: to_user_id,
    by: user.id,
    notes,
  }, { user: to_user_id, role: 'sac', room: 'tickets' });
  return decorated;
}

/**
 * Cambia el estado de un ticket validando permisos y la matriz de transiciones permitidas (TRANSITIONS), notificando a las partes relevantes según el nuevo estado (encargado, jefe de área al solucionar, SAC al cerrar, encargado al reabrir), registrando auditoría y emitiendo el cambio en tiempo real.
 * @param {String|Number} id - id del ticket
 * @param {Object} payload - datos del cambio (status, comment)
 * @param {Object} user - usuario que realiza el cambio de estado
 * @returns {Promise<Object>} ticket actualizado decorado
 */
async function changeStatus(id, payload, user) {
  const next = optionalEnum(payload.status, 'estado', TICKET_STATUS);
  if (!next) throw validationError('Debe indicar un estado válido.');
  const comment = optionalString(payload.comment, 'comentario', 2000) || null;

  const ticket = await firestoreData.getTicketWithArea(id);
  if (!ticket) throw notFoundError('Ticket no encontrado.');
  if (!canView(ticket, user)) throw forbiddenError();
  if (!canChangeStatus(ticket, user, next)) throw forbiddenError('No puede cambiar a este estado.');

  const allowed = TRANSITIONS[ticket.status] || [];
  if (!allowed.includes(next)) {
    throw conflictError(`Transición no permitida: ${ticket.status} → ${next}.`);
  }

  let updated;
  try {
    updated = await firestoreData.changeTicketStatus(id, next, comment, user);
  } catch (err) {
    if (err.code === 'CONFLICT')
      throw conflictError(err.message);
    if (err.code === 'NOT_FOUND') throw notFoundError(err.message);
    throw err;
  }
  const decorated = decorate(updated);

  const counterpart = next === 'cerrado' || next === 'solucionado'
    ? ticket.assigned_to
    : (ticket.assigned_to || ticket.created_by);
  if (counterpart && counterpart !== user.id) {
    await notificationsService.createAsync({
      user_id: counterpart,
      type: next === 'reabierto' ? 'ticket_reopened' : 'ticket_status_changed',
      ticket_id: id,
      title: `Cambio de estado: ${ticket.code}`,
      body: `${user.full_name} cambió el estado a "${STATUS_LABEL[next] || next}".`,
    });
  }

  if (next === 'solucionado' && ticket.area) {
    const users = await firestoreData.listUsers({ role: 'jefe_inmediato', active: true });
    const jefe = users.find((u) => u.area === ticket.area && u.id !== user.id);
    if (jefe) {
      await notificationsService.createAsync({
        user_id: jefe.id,
        type: 'ticket_transferred',
        ticket_id: id,
        title: `Listo para cerrar: ${ticket.code}`,
        body: `${user.full_name} marcó el ticket como solucionado. Revisa y ciérralo.`,
      });
    }
  }

  if (next === 'cerrado') {
    const sacUsers = await firestoreData.listUsers({ role: 'sac', active: true });
    for (const u of sacUsers) {
      if (u.id === user.id) continue;
      await notificationsService.createAsync({
        user_id: u.id,
        type: 'ticket_closed',
        ticket_id: id,
        title: `Ticket cerrado: ${ticket.code}`,
        body: `${user.full_name} cerró el ticket.`,
      });
    }
  }

  if (next === 'reabierto' && ticket.assigned_to && ticket.assigned_to !== user.id) {
    await notificationsService.createAsync({
      user_id: ticket.assigned_to,
      type: 'ticket_reopened',
      ticket_id: id,
      title: `Ticket reabierto: ${ticket.code}`,
      body: `${user.full_name} reabrió el ticket.`,
    });
  }

  await auditService.logAsync({
    user_id: user.id,
    company_id: user.activeCompanyId,
    action_type: 'ticket_status_changed',
    target_type: 'ticket',
    target_id: id,
    target_code: ticket.code,
    description: `Cambió el estado a "${STATUS_LABEL[next] || next}"${comment ? ` — ${comment}` : ''}`,
    old_value: { status: ticket.status },
    new_value: { status: next },
  });

  emit('ticket:status_changed', {
    ticketId: id,
    status: next,
    by: user.id,
  }, { user: counterpart, role: 'sac', room: 'tickets' });

  return decorated;
}

/**
 * Agrega un comentario a un ticket, notifica a la contraparte (encargado o creador, según quién comenta) y registra auditoría.
 * @param {String|Number} id - id del ticket
 * @param {Object} payload - datos del comentario (comment)
 * @param {Object} user - usuario que comenta
 * @returns {Promise<Object>} comentario creado
 */
async function addComment(id, payload, user) {
  const comment = requireString(payload.comment, 'comentario', 4000);

  const ticket = await firestoreData.getTicketWithArea(id);
  if (!ticket) throw notFoundError('Ticket no encontrado.');
  if (!canView(ticket, user)) throw forbiddenError();

  const row = await firestoreData.addComment(id, comment, user);
  const decorated = decorate(ticket);

  const counterpart = ticket.assigned_to === user.id ? ticket.created_by : ticket.assigned_to;
  if (counterpart && counterpart !== user.id) {
    await notificationsService.createAsync({
      user_id: counterpart,
      type: 'ticket_commented',
      ticket_id: id,
      title: `Nuevo comentario: ${ticket.code}`,
      body: `${user.full_name}: ${comment.slice(0, 120)}`,
    });
  }

  await auditService.logAsync({
    user_id: user.id,
    company_id: user.activeCompanyId,
    action_type: 'comment_added',
    target_type: 'ticket',
    target_id: id,
    target_code: ticket.code,
    description: `Añadió un comentario: "${comment.slice(0, 80)}${comment.length > 80 ? '...' : ''}"`,
    new_value: { comment },
  });

  emit('ticket:commented', { ticketId: id, comment: row }, { user: ticket.assigned_to, role: 'sac', room: 'tickets' });
  return row;
}

/**
 * Sube un adjunto a un ticket, notifica a la contraparte, registra auditoría y emite el evento en tiempo real.
 * @param {String|Number} id - id del ticket
 * @param {Object} file - archivo subido (filename, originalname, mimetype, size)
 * @param {Object} user - usuario que sube el adjunto
 * @returns {Promise<Object>} adjunto creado con datos del usuario
 */
async function addAttachment(id, file, user) {
  const ticket = await firestoreData.getTicketWithArea(id);
  if (!ticket) throw notFoundError('Ticket no encontrado.');
  if (!canView(ticket, user)) throw forbiddenError();

  const attachmentId = await attachmentsService.createAsync({
    ticket_id: id,
    user_id: user.id,
    filename: file.filename,
    original_name: file.originalname,
    mime_type: file.mimetype,
    size: file.size,
  });
  const row = await attachmentsService.createWithJoin(attachmentId);
  const decorated = decorate(ticket);

  const counterpart = ticket.assigned_to === user.id ? ticket.created_by : ticket.assigned_to;
  if (counterpart && counterpart !== user.id) {
    await notificationsService.createAsync({
      user_id: counterpart,
      type: 'ticket_commented',
      ticket_id: id,
      title: `Adjunto nuevo: ${ticket.code}`,
      body: `${user.full_name} subió "${file.originalname}".`,
    });
  }

  await auditService.logAsync({
    user_id: user.id,
    company_id: user.activeCompanyId,
    action_type: 'attachment_added',
    target_type: 'ticket',
    target_id: id,
    target_code: ticket.code,
    description: `Subió un adjunto: "${file.originalname}" (${file.size} bytes)`,
    new_value: { filename: file.originalname, size: file.size, mime_type: file.mimetype },
  });

  emit('attachment:added', { ticketId: id, attachment: row }, { user: counterpart, role: 'sac', room: 'tickets' });
  return row;
}

/**
 * Emite por socket.io un evento relacionado a tickets, dirigido opcionalmente a un usuario específico, al rol SAC y/o a una sala. Silencia errores de socket.
 * @param {String} event - nombre del evento a emitir
 * @param {Object} payload - datos del evento
 * @param {Object} [opts] - opciones de enrutamiento del socket
 * @param {String} [opts.room] - sala a la que emitir
 * @param {String} [opts.role] - si es 'sac', emite también a la sala del rol SAC
 * @param {String|Number} [opts.user] - id de usuario destinatario específico
 * @returns {void}
 */
function emit(event, payload, { room, role, user } = {}) {
  try {
    const io = require('../sockets').getIO();
    if (!io) return;
    if (user) io.to(`user:${user}`).emit(event, payload);
    if (role === 'sac') io.to('sac').emit(event, payload);
    if (room) io.to(room).emit(event, payload);
  } catch (e) {}
}

module.exports = {
  createTicket, listTickets, getTicket, updateTicket,
  assignTicket, changeStatus, addComment, addAttachment,
  canView, canEditMeta, canAssign, canClose, canReopen, canChangeStatus,
  TRANSITIONS, STATUS_LABEL, TICKET_STATUS,
};

