'use strict';
const { getDb } = require('../db/connection');
const {
  validationError, notFoundError, forbiddenError, conflictError,
  requireString, optionalString, optionalEnum, TICKET_STATUS, PRIORITIES, STATUS_LABEL,
} = require('../utils/validators');
const { ticketCodeFor, now } = require('../utils/time');
const notificationsService = require('./notifications.service');

// Transiciones válidas por estado (regla del negocio)
const TRANSITIONS = {
  recibido:    ['asignado', 'cerrado'],
  asignado:    ['en_proceso', 'asignado'],     // 'asignado' = reasignación (handled in /assign)
  en_proceso:  ['solucionado', 'asignado'],    // idem
  solucionado: ['cerrado', 'reabierto', 'en_proceso'],
  cerrado:     ['reabierto'],
  reabierto:   ['en_proceso', 'asignado'],
};

// ¿Puede ver este ticket?
function canView(ticket, user) {
  if (user.role === 'sac') return true; // SAC ve todo
  if (user.role === 'jefe_inmediato') {
    // Jefe solo ve los de su área
    return ticket.area === user.area;
  }
  if (user.role === 'admin_area') {
    // Ve los asignados a él o donde él es creador/área coincida
    if (ticket.assigned_to && ticket.assigned_to === user.id) return true;
    if (ticket.created_by && ticket.created_by === user.id) return true;
    return false;
  }
  if (user.role === 'supervisor_campo') {
    return ticket.created_by === user.id;
  }
  return false;
}

function canEditMeta(ticket, user) {
  if (user.role === 'sac') return true;
  if (user.role === 'supervisor_campo') return ticket.created_by === user.id && ticket.status === 'recibido';
  return false;
}

function canAssign(user) {
  return user.role === 'sac' || user.role === 'jefe_inmediato';
}

function canClose(user) {
  return user.role === 'jefe_inmediato' || user.role === 'sac';
}

function canReopen(user) {
  return user.role === 'jefe_inmediato' || user.role === 'sac';
}

function canChangeStatus(ticket, user, next) {
  if (user.role === 'sac') return true; // SAC fuerza cualquier transición válida
  if (user.role === 'jefe_inmediato') {
    // Jefe solo cierra y reabre (no toca en_proceso)
    return ['cerrado', 'reabierto'].includes(next);
  }
  if (user.role === 'admin_area') {
    if (ticket.assigned_to !== user.id) return false;
    return ['en_proceso', 'solucionado'].includes(next);
  }
  return false;
}

function generateUniqueCode(db) {
  const prefix = ticketCodeFor();
  const last = db
    .prepare('SELECT code FROM tickets WHERE code LIKE ? ORDER BY id DESC LIMIT 1')
    .get(`${prefix}%`);
  let seq = 1;
  if (last) {
    const n = parseInt(last.code.split('-')[2], 10);
    if (!isNaN(n)) seq = n + 1;
  }
  return `${prefix}${String(seq).padStart(4, '0')}`;
}

function createTicket(payload, user) {
  const title = requireString(payload.title, 'título', 200);
  const description = requireString(payload.description, 'descripción', 5000);
  const priority = optionalEnum(payload.priority, 'prioridad', PRIORITIES) || 'media';
  const category_id = payload.category_id ? parseInt(payload.category_id, 10) : null;

  if (category_id) {
    const exists = getDb().prepare('SELECT 1 FROM categories WHERE id = ? AND active = 1').get(category_id);
    if (!exists) throw validationError('La categoría seleccionada no existe.');
  }

  const db = getDb();
  const code = generateUniqueCode(db);
  const result = db
    .prepare(`INSERT INTO tickets (code, title, description, category_id, status, priority, created_by)
              VALUES (?, ?, ?, ?, 'recibido', ?, ?)`)
    .run(code, title, description, category_id, priority, user.id);

  const ticket = db
    .prepare('SELECT * FROM tickets WHERE id = ?')
    .get(result.lastInsertRowid);

  // Notificar a todos los SAC
  const sacUsers = db.prepare("SELECT id, full_name FROM users WHERE role = 'sac' AND active = 1").all();
  for (const u of sacUsers) {
    notificationsService.create({
      user_id: u.id,
      type: 'ticket_created',
      ticket_id: ticket.id,
      title: `Nuevo ticket: ${ticket.code}`,
      body: `${user.full_name} creó el ticket "${ticket.title}".`,
    });
  }

  emit('ticket:created', { ticket: decorate(ticket, db) }, { role: 'sac' });
  return decorate(ticket, db);
}

function listTickets(filters, user) {
  const db = getDb();
  const where = [];
  const params = [];

  // Visibilidad por rol
  if (user.role === 'supervisor_campo') {
    where.push('t.created_by = ?');
    params.push(user.id);
  } else if (user.role === 'admin_area') {
    where.push('(t.assigned_to = ? OR t.created_by = ?)');
    params.push(user.id, user.id);
  }
  // 'sac' y 'jefe_inmediato' ven todos

  if (filters.status) { where.push('t.status = ?'); params.push(filters.status); }
  if (filters.priority) { where.push('t.priority = ?'); params.push(filters.priority); }
  if (filters.category_id) { where.push('t.category_id = ?'); params.push(parseInt(filters.category_id, 10)); }
  if (filters.assigned_to) { where.push('t.assigned_to = ?'); params.push(parseInt(filters.assigned_to, 10)); }
  if (filters.area) { where.push('t.area = ?'); params.push(filters.area); }
  if (filters.date_from) { where.push('t.created_at >= ?'); params.push(filters.date_from); }
  if (filters.date_to) { where.push('t.created_at <= ?'); params.push(filters.date_to); }
  if (filters.search) {
    where.push('(t.title LIKE ? OR t.code LIKE ? OR t.description LIKE ?)');
    const q = `%${filters.search}%`;
    params.push(q, q, q);
  }

  const page = Math.max(1, parseInt(filters.page || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(filters.limit || '25', 10)));
  const offset = (page - 1) * limit;

  const whereSql = where.length ? ' WHERE ' + where.join(' AND ') : '';
  const total = db.prepare(`SELECT COUNT(*) AS c FROM tickets t${whereSql}`).get(...params).c;
  const rows = db
    .prepare(`SELECT t.*, c.name AS category_name,
                     u.full_name AS assigned_to_name, u.area AS assigned_to_area,
                     b.full_name AS created_by_name
              FROM tickets t
              LEFT JOIN categories c ON c.id = t.category_id
              LEFT JOIN users u ON u.id = t.assigned_to
              LEFT JOIN users b ON b.id = t.created_by
              ${whereSql}
              ORDER BY t.created_at DESC
              LIMIT ? OFFSET ?`)
    .all(...params, limit, offset);

  return { total, page, limit, tickets: rows.map((r) => decorate(r, db)) };
}

function getTicket(id, user) {
  const db = getDb();
  const row = db
    .prepare(`SELECT t.*, c.name AS category_name,
                     u.full_name AS assigned_to_name, u.area AS assigned_to_area, u.role AS assigned_to_role,
                     b.full_name AS created_by_name, b.area AS created_by_area, b.role AS created_by_role
              FROM tickets t
              LEFT JOIN categories c ON c.id = t.category_id
              LEFT JOIN users u ON u.id = t.assigned_to
              LEFT JOIN users b ON b.id = t.created_by
              WHERE t.id = ?`)
    .get(id);
  if (!row) throw notFoundError('Ticket no encontrado.');
  if (!canView(row, user)) throw forbiddenError();

  const assignments = db
    .prepare(`SELECT a.*, fu.full_name AS from_user_name, tu.full_name AS to_user_name,
                     au.full_name AS assigned_by_name
              FROM ticket_assignments a
              LEFT JOIN users fu ON fu.id = a.from_user_id
              LEFT JOIN users tu ON tu.id = a.to_user_id
              LEFT JOIN users au ON au.id = a.assigned_by
              WHERE a.ticket_id = ?
              ORDER BY a.assigned_at ASC`)
    .all(id);

  const comments = db
    .prepare(`SELECT c.*, u.full_name AS user_name, u.role AS user_role
              FROM ticket_comments c
              JOIN users u ON u.id = c.user_id
              WHERE c.ticket_id = ?
              ORDER BY c.created_at ASC`)
    .all(id);

  const attachments = db
    .prepare(`SELECT a.*, u.full_name AS user_name, u.role AS user_role
              FROM attachments a
              JOIN users u ON u.id = a.user_id
              WHERE a.ticket_id = ?
              ORDER BY a.uploaded_at ASC`)
    .all(id);

  return {
    ...decorate(row, db),
    assignments,
    comments,
    attachments,
  };
}

function updateTicket(id, payload, user) {
  const db = getDb();
  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(id);
  if (!ticket) throw notFoundError('Ticket no encontrado.');
  if (!canEditMeta(ticket, user)) throw forbiddenError();

  const fields = [];
  const params = [];
  if (payload.title !== undefined) { fields.push('title = ?'); params.push(requireString(payload.title, 'título', 200)); }
  if (payload.description !== undefined) { fields.push('description = ?'); params.push(requireString(payload.description, 'descripción', 5000)); }
  if (payload.priority !== undefined) { fields.push('priority = ?'); params.push(optionalEnum(payload.priority, 'prioridad', PRIORITIES) || ticket.priority); }
  if (payload.category_id !== undefined) {
    const cid = payload.category_id ? parseInt(payload.category_id, 10) : null;
    if (cid) {
      const exists = db.prepare('SELECT 1 FROM categories WHERE id = ? AND active = 1').get(cid);
      if (!exists) throw validationError('La categoría seleccionada no existe.');
    }
    fields.push('category_id = ?'); params.push(cid);
  }
  if (fields.length === 0) return decorate(ticket, db);
  fields.push('updated_at = ?'); params.push(now());
  params.push(id);
  db.prepare(`UPDATE tickets SET ${fields.join(', ')} WHERE id = ?`).run(...params);
  const updated = db.prepare('SELECT * FROM tickets WHERE id = ?').get(id);
  emit('ticket:updated', { ticketId: id, ticket: decorate(updated, db), by: user.id }, { room: 'tickets' });
  return decorate(updated, db);
}

function assignTicket(id, payload, user) {
  if (!canAssign(user)) throw forbiddenError('Solo SAC o jefes inmediatos pueden asignar tickets.');
  const to_user_id = parseInt(payload.to_user_id, 10);
  if (!to_user_id) throw validationError('Debe indicar el encargado destino.');
  const notes = optionalString(payload.notes, 'notas', 1000) || null;

  const db = getDb();
  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(id);
  if (!ticket) throw notFoundError('Ticket no encontrado.');

  const target = db.prepare('SELECT id, full_name, role, area, active FROM users WHERE id = ?').get(to_user_id);
  if (!target) throw notFoundError('El usuario destino no existe.');
  if (!target.active) throw validationError('El usuario destino está inactivo.');
  if (target.role !== 'admin_area' && target.role !== 'jefe_inmediato') {
    throw validationError('El ticket debe asignarse a un administrador de área o jefe inmediato.');
  }

  const from_user_id = ticket.assigned_to || null;
  const newStatus = ticket.status === 'recibido' || ticket.status === 'reabierto' ? 'asignado' : ticket.status;

  const tx = db.transaction(() => {
    db.prepare(`INSERT INTO ticket_assignments (ticket_id, from_user_id, to_user_id, assigned_by, notes)
                VALUES (?, ?, ?, ?, ?)`)
      .run(id, from_user_id, to_user_id, user.id, notes);
    db.prepare(`UPDATE tickets SET assigned_to = ?, area = ?, status = ?, updated_at = ?, closed_at = NULL WHERE id = ?`)
      .run(to_user_id, target.area || null, newStatus, now(), id);
  });
  tx();

  const updated = db.prepare('SELECT * FROM tickets WHERE id = ?').get(id);

  notificationsService.create({
    user_id: to_user_id,
    type: 'ticket_assigned',
    ticket_id: id,
    title: `Te asignaron un ticket: ${updated.code}`,
    body: `Asignado por ${user.full_name}${notes ? ` — ${notes}` : ''}`,
  });
  emit('ticket:assigned', {
    ticketId: id,
    ticket: decorate(updated, db),
    from: from_user_id,
    to: to_user_id,
    by: user.id,
    notes,
  }, { user: to_user_id, role: 'sac', room: 'tickets' });
  return decorate(updated, db);
}

function changeStatus(id, payload, user) {
  const next = optionalEnum(payload.status, 'estado', TICKET_STATUS);
  if (!next) throw validationError('Debe indicar un estado válido.');
  const comment = optionalString(payload.comment, 'comentario', 2000) || null;

  const db = getDb();
  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(id);
  if (!ticket) throw notFoundError('Ticket no encontrado.');
  if (!canView(ticket, user)) throw forbiddenError();
  if (!canChangeStatus(ticket, user, next)) throw forbiddenError('No puede cambiar a este estado.');

  const allowed = TRANSITIONS[ticket.status] || [];
  if (!allowed.includes(next)) {
    throw conflictError(`Transición no permitida: ${ticket.status} → ${next}.`);
  }

  // Al cerrar/reabrir ajustamos closed_at
  let closed_at = ticket.closed_at;
  if (next === 'cerrado') closed_at = now();
  if (next === 'reabierto') closed_at = null;
  if (next === 'en_proceso' || next === 'solucionado' || next === 'asignado') closed_at = null;

  const tx = db.transaction(() => {
    db.prepare(`UPDATE tickets SET status = ?, updated_at = ?, closed_at = ? WHERE id = ?`)
      .run(next, now(), closed_at, id);
    if (comment) {
      db.prepare(`INSERT INTO ticket_comments (ticket_id, user_id, comment) VALUES (?, ?, ?)`)
        .run(id, user.id, comment);
    }
  });
  tx();

  // Notificar a contraparte
  const counterpart = next === 'cerrado' || next === 'solucionado'
    ? ticket.assigned_to
    : (ticket.assigned_to || ticket.created_by);
  if (counterpart && counterpart !== user.id) {
    notificationsService.create({
      user_id: counterpart,
      type: next === 'reabierto' ? 'ticket_reopened' : 'ticket_status_changed',
      ticket_id: id,
      title: `Cambio de estado: ${ticket.code}`,
      body: `${user.full_name} cambió el estado a "${STATUS_LABEL[next] || next}".`,
    });
  }
  // Si queda "solucionado", avisar al jefe inmediato del área para que cierre
  if (next === 'solucionado' && ticket.area) {
    const ticketArea = ticket.area;
    const jefeRow = db
      .prepare("SELECT id FROM users WHERE role = 'jefe_inmediato' AND area = ? AND active = 1 AND id != ?")
      .get(ticketArea, user.id);
    if (jefeRow) {
      notificationsService.create({
        user_id: jefeRow.id,
        type: 'ticket_transferred',
        ticket_id: id,
        title: `Listo para cerrar: ${ticket.code}`,
        body: `${user.full_name} marcó el ticket como solucionado. Revisa y ciérralo.`,
      });
    }
  }
  // Si cierra jefe, notificar a SAC también
  if (next === 'cerrado') {
    const sacUsers = db.prepare("SELECT id FROM users WHERE role = 'sac' AND active = 1 AND id != ?").all(user.id);
    for (const u of sacUsers) {
      notificationsService.create({
        user_id: u.id,
        type: 'ticket_closed',
        ticket_id: id,
        title: `Ticket cerrado: ${ticket.code}`,
        body: `${user.full_name} cerró el ticket.`,
      });
    }
  }
  // Si reabre, notificar al asignado
  if (next === 'reabierto' && ticket.assigned_to && ticket.assigned_to !== user.id) {
    notificationsService.create({
      user_id: ticket.assigned_to,
      type: 'ticket_reopened',
      ticket_id: id,
      title: `Ticket reabierto: ${ticket.code}`,
      body: `${user.full_name} reabrió el ticket.`,
    });
  }

  emit('ticket:status_changed', {
    ticketId: id,
    status: next,
    by: user.id,
  }, { user: counterpart, role: 'sac', room: 'tickets' });
  return decorate(db.prepare('SELECT * FROM tickets WHERE id = ?').get(id), db);
}

function addComment(id, payload, user) {
  const comment = requireString(payload.comment, 'comentario', 2000);

  const db = getDb();
  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(id);
  if (!ticket) throw notFoundError('Ticket no encontrado.');
  if (!canView(ticket, user)) throw forbiddenError();

  const result = db
    .prepare(`INSERT INTO ticket_comments (ticket_id, user_id, comment) VALUES (?, ?, ?)`)
    .run(id, user.id, comment);
  const row = db
    .prepare(`SELECT c.*, u.full_name AS user_name, u.role AS user_role FROM ticket_comments c JOIN users u ON u.id = c.user_id WHERE c.id = ?`)
    .get(result.lastInsertRowid);

  // Notificar a contraparte
  const counterpart = ticket.assigned_to === user.id ? ticket.created_by : ticket.assigned_to;
  if (counterpart && counterpart !== user.id) {
    notificationsService.create({
      user_id: counterpart,
      type: 'ticket_commented',
      ticket_id: id,
      title: `Nuevo comentario: ${ticket.code}`,
      body: `${user.full_name}: ${comment.slice(0, 120)}`,
    });
  }
  emit('ticket:commented', { ticketId: id, comment: row }, { user: ticket.assigned_to, role: 'sac', room: 'tickets' });
  return row;
}

function addAttachment(id, file, user) {
  const db = getDb();
  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(id);
  if (!ticket) throw notFoundError('Ticket no encontrado.');
  if (!canView(ticket, user)) throw forbiddenError();

  const result = db
    .prepare(`INSERT INTO attachments (ticket_id, user_id, filename, original_name, mime_type, size)
              VALUES (?, ?, ?, ?, ?, ?)`)
    .run(id, user.id, file.filename, file.originalname, file.mimetype, file.size);
  const row = db
    .prepare(`SELECT a.*, u.full_name AS user_name, u.role AS user_role FROM attachments a JOIN users u ON u.id = a.user_id WHERE a.id = ?`)
    .get(result.lastInsertRowid);

  // Notificar a contraparte
  const counterpart = ticket.assigned_to === user.id ? ticket.created_by : ticket.assigned_to;
  if (counterpart && counterpart !== user.id) {
    notificationsService.create({
      user_id: counterpart,
      type: 'ticket_commented',
      ticket_id: id,
      title: `Adjunto nuevo: ${ticket.code}`,
      body: `${user.full_name} subió "${file.originalname}".`,
    });
  }
  emit('attachment:added', { ticketId: id, attachment: row }, { user: counterpart, role: 'sac', room: 'tickets' });
  return row;
}

function decorate(row, db) {
  if (!row) return null;
  const _db = db || getDb();
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    description: row.description,
    category_id: row.category_id,
    category_name: row.category_name || null,
    area: row.area || row.assigned_to_area || row.created_by_area || null,
    status: row.status,
    status_label: STATUS_LABEL[row.status] || row.status,
    priority: row.priority,
    created_by: row.created_by,
    created_by_name: row.created_by_name || null,
    created_by_role: row.created_by_role || null,
    created_by_area: row.created_by_area || null,
    assigned_to: row.assigned_to,
    assigned_to_name: row.assigned_to_name || null,
    assigned_to_role: row.assigned_to_role || null,
    assigned_to_area: row.assigned_to_area || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    closed_at: row.closed_at,
  };
}

function emit(event, payload, { room, role, user } = {}) {
  try {
    const io = require('../sockets').getIO();
    if (!io) return;
    if (user) io.to(`user:${user}`).emit(event, payload);
    if (role === 'sac') io.to('sac').emit(event, payload);
    if (room) io.to(room).emit(event, payload);
  } catch (e) { /* socket no inicializado aún */ }
}

module.exports = {
  createTicket, listTickets, getTicket, updateTicket,
  assignTicket, changeStatus, addComment, addAttachment,
  canView, canEditMeta, canAssign, canClose, canReopen, canChangeStatus,
  TRANSITIONS, STATUS_LABEL, TICKET_STATUS,
};
