'use strict';
const orm = require('../orm');
const { AppDataSource } = orm;
const auditService = require('./audit.service');
const {
  validationError, notFoundError, forbiddenError, conflictError,
  requireString, optionalString, optionalEnum, TICKET_STATUS, PRIORITIES, STATUS_LABEL,
} = require('../utils/validators');
const { ticketCodeFor } = require('../utils/time');
const notificationsService = require('./notifications.service');
const attachmentsService = require('./attachments.service');

// ── Helpers de shape legacy ─────────────────────────────────────────────────
// SQLite devolvía las fechas como string 'YYYY-MM-DD HH:MM:SS'.
// TypeORM con mssql devuelve `Date`. Mapeamos al mismo string que la API
// histórica entregaba, igual que hacen audit/notifications/attachments.
function toSql(v) {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().replace('T', ' ').slice(0, 19);
  return v;
}

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

// ── Query helpers (createQueryBuilder) ──────────────────────────────────────
// Mantienen la shape de la query SQLite original (joins a categories y users
// ×2 para assigned_to/created_by con full_name + area + role).
function selectTicketQb(repo) {
  return repo.createQueryBuilder('t')
    .leftJoin('categories', 'c', 'c.id = t.category_id')
    .leftJoin('users', 'u', 'u.id = t.assigned_to')
    .leftJoin('users', 'b', 'b.id = t.created_by')
    .select([
      't.id            AS id',
      't.code          AS code',
      't.title         AS title',
      't.description   AS description',
      't.category_id   AS category_id',
      'c.name          AS category_name',
      't.area          AS area',
      't.status        AS status',
      't.priority      AS priority',
      't.created_by    AS created_by',
      'b.full_name     AS created_by_name',
      'b.area          AS created_by_area',
      'b.role          AS created_by_role',
      't.assigned_to   AS assigned_to',
      'u.full_name     AS assigned_to_name',
      'u.area          AS assigned_to_area',
      'u.role          AS assigned_to_role',
      't.closed_by     AS closed_by',
      't.created_at    AS created_at',
      't.updated_at    AS updated_at',
      't.closed_at     AS closed_at',
    ]);
}

async function generateUniqueCode() {
  const prefix = ticketCodeFor();
  const repo = await orm.getRepository(orm.Ticket);
  const last = await repo.createQueryBuilder('t')
    .select('t.code AS code')
    .where('t.code LIKE :p', { p: `${prefix}%` })
    .orderBy('t.id', 'DESC')
    .limit(1)
    .getRawOne();
  let seq = 1;
  if (last && last.code) {
    const parts = last.code.split('-');
    const n = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(n)) seq = n + 1;
  }
  return `${prefix}${String(seq).padStart(4, '0')}`;
}

async function createTicket(payload, user) {
  const title = requireString(payload.title, 'título', 200);
  const description = requireString(payload.description, 'descripción', 5000);
  const priority = optionalEnum(payload.priority, 'prioridad', PRIORITIES) || 'media';
  const category_id = payload.category_id ? parseInt(payload.category_id, 10) : null;

  if (category_id) {
    const catRepo = await orm.getRepository(orm.Category);
    const exists = await catRepo.findOne({ where: { id: category_id, active: 1 } });
    if (!exists) throw validationError('La categoría seleccionada no existe.');
  }

  const code = await generateUniqueCode();
  const repo = await orm.getRepository(orm.Ticket);
  const saved = await repo.save(repo.create({
    code, title, description, category_id,
    status: 'recibido', priority,
    created_by: user.id,
  }));
  const row = await selectTicketQb(repo).where('t.id = :id', { id: saved.id }).getRawOne();
  const ticket = decorate(row);

  // Notificar a todos los SAC
  const userRepo = await orm.getRepository(orm.User);
  const sacUsers = await userRepo.find({ where: { role: 'sac', active: 1 } });
  for (const u of sacUsers) {
    await notificationsService.createAsync({
      user_id: u.id,
      type: 'ticket_created',
      ticket_id: ticket.id,
      title: `Nuevo ticket: ${ticket.code}`,
      body: `${user.full_name} creó el ticket "${ticket.title}".`,
    });
  }

  // Registrar en auditoría
  await auditService.logAsync({
    user_id: user.id,
    action_type: 'ticket_created',
    target_type: 'ticket',
    target_id: ticket.id,
    target_code: ticket.code,
    description: `Creó el ticket "${title}"`,
    new_value: { code: ticket.code, title, priority, status: 'recibido' },
  });

  emit('ticket:created', { ticket }, { role: 'sac' });
  return ticket;
}

async function listTickets(filters, user) {
  const repo = await orm.getRepository(orm.Ticket);
  const qb = selectTicketQb(repo);
  const params = {};

  // Visibilidad por rol
  if (user.role === 'supervisor_campo') {
    qb.andWhere('t.created_by = :uid', { uid: user.id });
  } else if (user.role === 'admin_area') {
    qb.andWhere('(t.assigned_to = :uid OR t.created_by = :uid)', { uid: user.id });
  }
  // 'sac' y 'jefe_inmediato' ven todos

  if (filters.status) { qb.andWhere('t.status = :status', { status: filters.status }); }
  if (filters.priority) { qb.andWhere('t.priority = :priority', { priority: filters.priority }); }
  if (filters.category_id) { qb.andWhere('t.category_id = :category_id', { category_id: parseInt(filters.category_id, 10) }); }
  if (filters.assigned_to) { qb.andWhere('t.assigned_to = :assigned_to', { assigned_to: parseInt(filters.assigned_to, 10) }); }
  if (filters.area) { qb.andWhere('t.area = :area', { area: filters.area }); }
  if (filters.date_from) { qb.andWhere('t.created_at >= :date_from', { date_from: filters.date_from }); }
  if (filters.date_to) { qb.andWhere('t.created_at <= :date_to', { date_to: filters.date_to }); }
  if (filters.search) {
    qb.andWhere('(t.title LIKE :s OR t.code LIKE :s OR t.description LIKE :s)', { s: `%${filters.search}%` });
  }

  const page = Math.max(1, parseInt(filters.page || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(filters.limit || '25', 10)));
  const offset = (page - 1) * limit;

  // Total: query aparte (mismo WHERE, sin JOIN ni LIMIT/OFFSET) para
  // mantener consistencia con la implementación SQLite previa.
  const countQb = repo.createQueryBuilder('t');
  if (user.role === 'supervisor_campo') {
    countQb.andWhere('t.created_by = :uid', { uid: user.id });
  } else if (user.role === 'admin_area') {
    countQb.andWhere('(t.assigned_to = :uid OR t.created_by = :uid)', { uid: user.id });
  }
  if (filters.status) { countQb.andWhere('t.status = :status', { status: filters.status }); }
  if (filters.priority) { countQb.andWhere('t.priority = :priority', { priority: filters.priority }); }
  if (filters.category_id) { countQb.andWhere('t.category_id = :category_id', { category_id: parseInt(filters.category_id, 10) }); }
  if (filters.assigned_to) { countQb.andWhere('t.assigned_to = :assigned_to', { assigned_to: parseInt(filters.assigned_to, 10) }); }
  if (filters.area) { countQb.andWhere('t.area = :area', { area: filters.area }); }
  if (filters.date_from) { countQb.andWhere('t.created_at >= :date_from', { date_from: filters.date_from }); }
  if (filters.date_to) { countQb.andWhere('t.created_at <= :date_to', { date_to: filters.date_to }); }
  if (filters.search) {
    countQb.andWhere('(t.title LIKE :s OR t.code LIKE :s OR t.description LIKE :s)', { s: `%${filters.search}%` });
  }
  const total = await countQb.getCount();

  qb.orderBy('t.created_at', 'DESC').limit(limit).offset(offset);
  const rows = await qb.getRawMany();
  return { total, page, limit, tickets: rows.map(decorate) };
}

async function getTicket(id, user) {
  const repo = await orm.getRepository(orm.Ticket);
  const row = await selectTicketQb(repo).where('t.id = :id', { id }).getRawOne();
  if (!row) throw notFoundError('Ticket no encontrado.');
  if (!canView(row, user)) throw forbiddenError();
  const ticket = decorate(row);

  const assignRepo = await orm.getRepository(orm.TicketAssignment);
  const assignments = await assignRepo.createQueryBuilder('a')
    .leftJoin('users', 'fu', 'fu.id = a.from_user_id')
    .leftJoin('users', 'tu', 'tu.id = a.to_user_id')
    .leftJoin('users', 'au', 'au.id = a.assigned_by')
    .select([
      'a.id            AS id',
      'a.ticket_id     AS ticket_id',
      'a.from_user_id  AS from_user_id',
      'a.to_user_id    AS to_user_id',
      'a.assigned_by   AS assigned_by',
      'a.notes         AS notes',
      'a.assigned_at   AS assigned_at',
      'fu.full_name    AS from_user_name',
      'tu.full_name    AS to_user_name',
      'au.full_name    AS assigned_by_name',
    ])
    .where('a.ticket_id = :id', { id })
    .orderBy('a.assigned_at', 'ASC')
    .getRawMany();

  const commentRepo = await orm.getRepository(orm.TicketComment);
  const comments = await commentRepo.createQueryBuilder('c')
    .leftJoin('users', 'u', 'u.id = c.user_id')
    .select([
      'c.id          AS id',
      'c.ticket_id   AS ticket_id',
      'c.user_id     AS user_id',
      'c.comment     AS comment',
      'c.attachment_id AS attachment_id',
      'c.created_at  AS created_at',
      'u.full_name   AS user_name',
      'u.role        AS user_role',
    ])
    .where('c.ticket_id = :id', { id })
    .orderBy('c.created_at', 'ASC')
    .getRawMany();

  // Adjuntos: no hay attachmentsService.listByTicket, se inlinea el JOIN.
  const attRepo = await orm.getRepository(orm.Attachment);
  const attachments = await attRepo.createQueryBuilder('a')
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
    .where('a.ticket_id = :id', { id })
    .orderBy('a.uploaded_at', 'ASC')
    .getRawMany();

  return {
    ...ticket,
    assignments: assignments.map(serializeAssignment),
    comments: comments.map(serializeComment),
    attachments: attachments.map(serializeAttachment),
  };
}

function serializeAssignment(row) {
  if (!row) return null;
  return {
    ...row,
    assigned_at: toSql(row.assigned_at),
  };
}

function serializeComment(row) {
  if (!row) return null;
  return {
    ...row,
    created_at: toSql(row.created_at),
  };
}

function serializeAttachment(row) {
  if (!row) return null;
  return {
    ...row,
    uploaded_at: toSql(row.uploaded_at),
  };
}

async function updateTicket(id, payload, user) {
  const repo = await orm.getRepository(orm.Ticket);
  const ticket = await repo.findOne({ where: { id } });
  if (!ticket) throw notFoundError('Ticket no encontrado.');
  if (!canEditMeta(ticket, user)) throw forbiddenError();

  const fields = {};
  if (payload.title !== undefined) fields.title = requireString(payload.title, 'título', 200);
  if (payload.description !== undefined) fields.description = requireString(payload.description, 'descripción', 5000);
  if (payload.priority !== undefined) fields.priority = optionalEnum(payload.priority, 'prioridad', PRIORITIES) || ticket.priority;
  if (payload.category_id !== undefined) {
    const cid = payload.category_id ? parseInt(payload.category_id, 10) : null;
    if (cid) {
      const catRepo = await orm.getRepository(orm.Category);
      const exists = await catRepo.findOne({ where: { id: cid, active: 1 } });
      if (!exists) throw validationError('La categoría seleccionada no existe.');
    }
    fields.category_id = cid;
  }
  if (Object.keys(fields).length === 0) {
    const row = await selectTicketQb(repo).where('t.id = :id', { id }).getRawOne();
    return decorate(row);
  }
  fields.updated_at = new Date();
  await repo.update({ id }, fields);
  const row = await selectTicketQb(repo).where('t.id = :id', { id }).getRawOne();
  const updated = decorate(row);
  emit('ticket:updated', { ticketId: id, ticket: updated, by: user.id }, { room: 'tickets' });
  return updated;
}

async function assignTicket(id, payload, user) {
  if (!canAssign(user)) throw forbiddenError('Solo SAC o jefes inmediatos pueden asignar tickets.');
  const to_user_id = parseInt(payload.to_user_id, 10);
  if (!to_user_id) throw validationError('Debe indicar el encargado destino.');
  const notes = optionalString(payload.notes, 'notas', 1000) || null;

  const ticketRepo = await orm.getRepository(orm.Ticket);
  const userRepo = await orm.getRepository(orm.User);
  const assignRepo = await orm.getRepository(orm.TicketAssignment);

  const ticket = await ticketRepo.findOne({ where: { id } });
  if (!ticket) throw notFoundError('Ticket no encontrado.');

  const target = await userRepo.createQueryBuilder('u')
    .select(['u.id AS id', 'u.full_name AS full_name', 'u.role AS role', 'u.area AS area', 'u.active AS active'])
    .where('u.id = :id', { id: to_user_id })
    .getRawOne();
  if (!target) throw notFoundError('El usuario destino no existe.');
  if (!target.active) throw validationError('El usuario destino está inactivo.');
  if (target.role !== 'admin_area' && target.role !== 'jefe_inmediato') {
    throw validationError('El ticket debe asignarse a un administrador de área o jefe inmediato.');
  }

  const from_user_id = ticket.assigned_to || null;
  const newStatus = ticket.status === 'recibido' || ticket.status === 'reabierto' ? 'asignado' : ticket.status;

  await AppDataSource.transaction(async (manager) => {
    const tRepo = manager.getRepository(orm.Ticket);
    const aRepo = manager.getRepository(orm.TicketAssignment);
    await aRepo.save(aRepo.create({
      ticket_id: id, from_user_id, to_user_id, assigned_by: user.id, notes,
    }));
    await tRepo.update({ id }, {
      assigned_to: to_user_id,
      area: target.area || null,
      status: newStatus,
      updated_at: new Date(),
      closed_at: null,
    });
  });

  const row = await selectTicketQb(ticketRepo).where('t.id = :id', { id }).getRawOne();
  const updated = decorate(row);

  await notificationsService.createAsync({
    user_id: to_user_id,
    type: 'ticket_assigned',
    ticket_id: id,
    title: `Te asignaron un ticket: ${updated.code}`,
    body: `Asignado por ${user.full_name}${notes ? ` — ${notes}` : ''}`,
  });

  // Registrar en auditoría
  await auditService.logAsync({
    user_id: user.id,
    action_type: 'ticket_assigned',
    target_type: 'ticket',
    target_id: id,
    target_code: updated.code,
    description: `Asignó el ticket a ${target.full_name}${notes ? ` — ${notes}` : ''}`,
    old_value: from_user_id ? { assigned_to: from_user_id } : null,
    new_value: { assigned_to: to_user_id, status: newStatus },
  });

  emit('ticket:assigned', {
    ticketId: id,
    ticket: updated,
    from: from_user_id,
    to: to_user_id,
    by: user.id,
    notes,
  }, { user: to_user_id, role: 'sac', room: 'tickets' });
  return updated;
}

async function changeStatus(id, payload, user) {
  const next = optionalEnum(payload.status, 'estado', TICKET_STATUS);
  if (!next) throw validationError('Debe indicar un estado válido.');
  const comment = optionalString(payload.comment, 'comentario', 2000) || null;

  const ticketRepo = await orm.getRepository(orm.Ticket);
  const ticket = await ticketRepo.findOne({ where: { id } });
  if (!ticket) throw notFoundError('Ticket no encontrado.');
  if (!canView(ticket, user)) throw forbiddenError();
  if (!canChangeStatus(ticket, user, next)) throw forbiddenError('No puede cambiar a este estado.');

  const allowed = TRANSITIONS[ticket.status] || [];
  if (!allowed.includes(next)) {
    throw conflictError(`Transición no permitida: ${ticket.status} → ${next}.`);
  }

  // Al cerrar/reabrir ajustamos closed_at
  let closed_at = ticket.closed_at ? new Date(ticket.closed_at) : null;
  if (next === 'cerrado') closed_at = new Date();
  if (next === 'reabierto') closed_at = null;
  if (next === 'en_proceso' || next === 'solucionado' || next === 'asignado') closed_at = null;

  await AppDataSource.transaction(async (manager) => {
    const tRepo = manager.getRepository(orm.Ticket);
    const cRepo = manager.getRepository(orm.TicketComment);
    await tRepo.update({ id }, {
      status: next,
      updated_at: new Date(),
      closed_at,
    });
    if (comment) {
      await cRepo.save(cRepo.create({ ticket_id: id, user_id: user.id, comment }));
    }
  });

  // Notificar a contraparte
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
  // Si queda "solucionado", avisar al jefe inmediato del área para que cierre
  if (next === 'solucionado' && ticket.area) {
    const ticketArea = ticket.area;
    const userRepo = await orm.getRepository(orm.User);
    const jefeRow = await userRepo.createQueryBuilder('u')
      .select('u.id AS id')
      .where("u.role = 'jefe_inmediato'")
      .andWhere('u.area = :area', { area: ticketArea })
      .andWhere('u.active = 1')
      .andWhere('u.id != :uid', { uid: user.id })
      .getRawOne();
    if (jefeRow) {
      await notificationsService.createAsync({
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
    const userRepo = await orm.getRepository(orm.User);
    const sacUsers = await userRepo.createQueryBuilder('u')
      .select('u.id AS id')
      .where("u.role = 'sac'")
      .andWhere('u.active = 1')
      .andWhere('u.id != :uid', { uid: user.id })
      .getRawMany();
    for (const u of sacUsers) {
      await notificationsService.createAsync({
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
    await notificationsService.createAsync({
      user_id: ticket.assigned_to,
      type: 'ticket_reopened',
      ticket_id: id,
      title: `Ticket reabierto: ${ticket.code}`,
      body: `${user.full_name} reabrió el ticket.`,
    });
  }

  // Registrar en auditoría
  await auditService.logAsync({
    user_id: user.id,
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

  const row = await selectTicketQb(ticketRepo).where('t.id = :id', { id }).getRawOne();
  return decorate(row);
}

async function addComment(id, payload, user) {
  const comment = requireString(payload.comment, 'comentario', 2000);

  const ticketRepo = await orm.getRepository(orm.Ticket);
  const commentRepo = await orm.getRepository(orm.TicketComment);
  const ticket = await ticketRepo.findOne({ where: { id } });
  if (!ticket) throw notFoundError('Ticket no encontrado.');
  if (!canView(ticket, user)) throw forbiddenError();

  const saved = await commentRepo.save(commentRepo.create({
    ticket_id: id, user_id: user.id, comment,
  }));
  const row = await commentRepo.createQueryBuilder('c')
    .leftJoin('users', 'u', 'u.id = c.user_id')
    .select([
      'c.id          AS id',
      'c.ticket_id   AS ticket_id',
      'c.user_id     AS user_id',
      'c.comment     AS comment',
      'c.attachment_id AS attachment_id',
      'c.created_at  AS created_at',
      'u.full_name   AS user_name',
      'u.role        AS user_role',
    ])
    .where('c.id = :id', { id: saved.id })
    .getRawOne();

  // Notificar a contraparte
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

  // Registrar en auditoría
  await auditService.logAsync({
    user_id: user.id,
    action_type: 'comment_added',
    target_type: 'ticket',
    target_id: id,
    target_code: ticket.code,
    description: `Añadió un comentario: "${comment.slice(0, 80)}${comment.length > 80 ? '...' : ''}"`,
    new_value: { comment },
  });

  emit('ticket:commented', { ticketId: id, comment: serializeComment(row) }, { user: ticket.assigned_to, role: 'sac', room: 'tickets' });
  return serializeComment(row);
}

async function addAttachment(id, file, user) {
  const ticketRepo = await orm.getRepository(orm.Ticket);
  const ticket = await ticketRepo.findOne({ where: { id } });
  if (!ticket) throw notFoundError('Ticket no encontrado.');
  if (!canView(ticket, user)) throw forbiddenError();

  // attachments.service.createAsync: INSERT puro, devuelve el id.
  // createWithJoin (async) re-lee con JOIN a users para mantener la shape
  // que el socket emit y el frontend esperan.
  const attachmentId = await attachmentsService.createAsync({
    ticket_id: id,
    user_id: user.id,
    filename: file.filename,
    original_name: file.originalname,
    mime_type: file.mimetype,
    size: file.size,
  });
  const row = await attachmentsService.createWithJoin(attachmentId);

  // Notificar a contraparte
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

  // Registrar en auditoría
  await auditService.logAsync({
    user_id: user.id,
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

function decorate(row) {
  if (!row) return null;
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
    created_at: toSql(row.created_at),
    updated_at: toSql(row.updated_at),
    closed_at: toSql(row.closed_at),
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
