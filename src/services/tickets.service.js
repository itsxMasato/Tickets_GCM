/* Documentado por: Miguel Flores */
'use strict'
const { In } = require('typeorm');
const orm = require('../orm');
const auditService = require('./audit.service');
const notificationsService = require('./notifications.service');
const attachmentsService = require('./attachments.service');
const { canViewTicket: canView, sameCompany, resolveTicketArea } = require('../utils/ticket-access');
const {
  validationError, notFoundError, forbiddenError, conflictError,
  requireString, optionalString, optionalEnum, TICKET_STATUS, PRIORITIES, STATUS_LABEL,
  LOCATION_TYPES, LOCATION_REASONS, LOCATION_REASON_LABEL,
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
 * Determina si un usuario puede cambiar la ubicación física de un ticket (taller / proveedor externo): admins de plataforma siempre; SAC de la misma empresa; admin de área solo sobre tickets que tiene asignados. Independiente de la máquina de transiciones de `status`.
 * @param {Object} ticket - ticket a evaluar
 * @param {Object} user - usuario que intenta cambiar la ubicación
 * @returns {Boolean} true si puede cambiar la ubicación
 */
function canChangeLocation(ticket, user) {
  if (user.isPlatformAdmin) return true;
  if (user.role === 'sac') return sameCompany(ticket, user);
  if (user.role === 'admin_area') return ticket.assigned_to === user.id;
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
 * Resuelve el prefijo de código de una empresa (o 'TKT' si no tiene uno configurado) y
 * genera el siguiente código secuencial libre para ese prefijo, reintentando si otra
 * inserción concurrente ya tomó el número (choca contra la constraint UNIQUE de `code`).
 * @param {String|Number|null} companyId - id de la empresa del ticket, o null
 * @param {Object} manager - EntityManager de la transacción en curso
 * @returns {Promise<String>} código único generado, ej. 'ZZCC-000038'
 */
async function generateUniqueCode(companyId, manager) {
  let prefix = 'TKT';
  if (companyId != null) {
    const company = await manager.getRepository(orm.Company).findOneBy({ id: Number(companyId) });
    if (company?.code_prefix) prefix = company.code_prefix;
  }
  const base = `${prefix}-`;
  const ticketRepo = manager.getRepository(orm.Ticket);
  const existingCodes = await ticketRepo.createQueryBuilder('t')
    .select('t.code', 'code')
    .where('t.code LIKE :pattern', { pattern: `${base}%` })
    .getRawMany();
  let maxSeq = 0;
  for (const { code } of existingCodes) {
    const n = parseInt(code.slice(base.length), 10);
    if (Number.isFinite(n) && n > maxSeq) maxSeq = n;
  }
  for (let attempt = 1; attempt <= 5; attempt++) {
    const code = `${base}${String(maxSeq + attempt).padStart(6, '0')}`;
    const clash = await ticketRepo.findOneBy({ code });
    if (!clash) return code;
  }
  throw new Error('No se pudo generar un código de ticket único tras varios intentos.');
}

/**
 * Enriquece filas crudas de tickets con el nombre de la categoría y con nombre/área/rol
 * de quien lo creó y de quien tiene asignado, resolviendo esas referencias en lote
 * (una sola consulta por tabla relacionada, no N+1).
 * @param {Array<Object>} rows - filas crudas de tickets (entidad Ticket)
 * @returns {Promise<Array<Object>>} tickets enriquecidos con category_name/*_name/*_area/*_role
 */
async function enrichTickets(rows) {
  if (!rows.length) return [];
  const categoryIds = Array.from(new Set(rows.map((t) => t.category_id).filter((id) => id != null)));
  const providerIds = Array.from(new Set(rows.map((t) => t.location_provider_id).filter((id) => id != null)));
  const userIds = Array.from(new Set([
    ...rows.map((t) => t.created_by),
    ...rows.map((t) => t.assigned_to),
  ].filter((id) => id != null)));

  const [categories, providers, users] = await Promise.all([
    categoryIds.length ? (await orm.getRepository(orm.Category)).findBy({ id: In(categoryIds) }) : [],
    providerIds.length ? (await orm.getRepository(orm.Provider)).findBy({ id: In(providerIds) }) : [],
    userIds.length ? (await orm.getRepository(orm.User)).findBy({ id: In(userIds) }) : [],
  ]);
  const categoriesById = new Map(categories.map((c) => [c.id, c]));
  const providersById = new Map(providers.map((p) => [p.id, p]));
  const usersById = new Map(users.map((u) => [u.id, u]));

  return rows.map((t) => {
    const category = t.category_id != null ? categoriesById.get(t.category_id) : null;
    const provider = t.location_provider_id != null ? providersById.get(t.location_provider_id) : null;
    const createdBy = t.created_by != null ? usersById.get(t.created_by) : null;
    const assignedTo = t.assigned_to != null ? usersById.get(t.assigned_to) : null;
    return {
      ...t,
      category_name: category?.name || null,
      location_provider_name: provider?.name || null,
      created_by_name: createdBy?.full_name || null,
      created_by_area: createdBy?.area || null,
      created_by_role: createdBy?.role || null,
      assigned_to_name: assignedTo?.full_name || null,
      assigned_to_area: assignedTo?.area || null,
      assigned_to_role: assignedTo?.role || null,
    };
  });
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
  const companyId = user.activeCompanyId != null ? Number(user.activeCompanyId) : null;

  const ds = await orm.getDataSource();
  const created = await ds.transaction(async (manager) => {
    let category = null;
    if (category_id) {
      category = await manager.getRepository(orm.Category).findOneBy({ id: category_id });
    }
    const code = await generateUniqueCode(companyId, manager);
    return manager.getRepository(orm.Ticket).save({
      code,
      title,
      description,
      category_id,
      area: category?.area || null,
      company_id: companyId,
      status: 'recibido',
      priority,
      created_by: Number(user.id),
      assigned_to: null,
      closed_by: null,
    });
  });

  const [ticket] = await enrichTickets([created]);
  const decorated = decorate(ticket);

  const sacRepo = await orm.getRepository(orm.User);
  const sacUsers = await sacRepo.find({ where: { role: 'sac', active: true } });
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
 * Codifica un cursor de paginación en base64 a partir de created_at e id de una fila.
 * @param {Object} row - fila con campos created_at (Date) e id
 * @returns {String|null} cursor codificado en base64, o null si no hay fila
 */
function encodeCursor(row) {
  if (!row) return null;
  return Buffer.from(JSON.stringify([new Date(row.created_at).toISOString(), row.id])).toString('base64');
}

/**
 * Decodifica un cursor de paginación generado por encodeCursor.
 * @param {String} cursor - cursor codificado en base64
 * @returns {[Date, Number]|null} par [created_at, id] decodificado, o null si el cursor es inválido/vacío
 */
function decodeCursor(cursor) {
  if (!cursor) return null;
  try {
    const [createdAt, id] = JSON.parse(Buffer.from(cursor, 'base64').toString('utf8'));
    return [new Date(createdAt), Number(id)];
  } catch (_) {
    return null;
  }
}

/**
 * Aplica los filtros de búsqueda y el alcance de visibilidad por rol/empresa a un
 * QueryBuilder de Ticket.
 * @param {Object} qb - QueryBuilder de TypeORM sobre Ticket, alias 't'
 * @param {Object} filters - filtros (status, priority, category_id, assigned_to, company_id, area, date_from, date_to, search)
 * @param {Object} user - usuario que realiza la consulta
 * @returns {Object} el mismo QueryBuilder, con los WHERE aplicados
 */
function applyTicketScope(qb, filters, user) {
  if (user.role === 'jefe_inmediato') {
    // jefe_inmediato solo ve tickets solucionados de su empresa/área (ver ticket-access.js#canViewTicket)
    qb.andWhere('t.status = :jefeStatus', { jefeStatus: 'solucionado' });
  } else if (filters.status) {
    qb.andWhere('t.status = :status', { status: filters.status });
  }
  if (filters.priority) qb.andWhere('t.priority = :priority', { priority: filters.priority });
  if (filters.category_id) qb.andWhere('t.category_id = :categoryId', { categoryId: Number(filters.category_id) });
  if (filters.assigned_to) qb.andWhere('t.assigned_to = :assignedTo', { assignedTo: Number(filters.assigned_to) });
  if (filters.company_id) qb.andWhere('t.company_id = :companyId', { companyId: Number(filters.company_id) });
  if (filters.area && user.role !== 'jefe_inmediato') qb.andWhere('t.area = :area', { area: filters.area });
  if (filters.date_from) qb.andWhere('t.created_at >= :dateFrom', { dateFrom: new Date(filters.date_from) });
  if (filters.date_to) {
    const dateTo = /^\d{4}-\d{2}-\d{2}$/.test(filters.date_to) ? new Date(`${filters.date_to}T23:59:59.999Z`) : new Date(filters.date_to);
    qb.andWhere('t.created_at <= :dateTo', { dateTo });
  }
  if (filters.search) {
    qb.andWhere('(t.title LIKE :needle OR t.code LIKE :needle OR t.description LIKE :needle)', { needle: `%${filters.search}%` });
  }

  if (user.role === 'supervisor_campo') {
    qb.andWhere('t.created_by = :requesterId', { requesterId: Number(user.id) });
  } else if (user.role === 'admin_area') {
    qb.andWhere('(t.created_by = :requesterId OR t.assigned_to = :requesterId)', { requesterId: Number(user.id) });
  }

  const companyScoped = user.role !== 'sac' && user.activeCompanyId != null && !user.isPlatformAdmin;
  if (companyScoped) {
    qb.andWhere('(t.company_id IS NULL OR t.company_id = :activeCompanyId)', { activeCompanyId: Number(user.activeCompanyId) });
  }
  return qb;
}

/**
 * Lista tickets paginados (keyset por created_at+id) aplicando filtros y el alcance de
 * visibilidad del usuario.
 * @param {Object} filters - filtros de búsqueda y paginación (incluye limit, cursor)
 * @param {Object} user - usuario que realiza la consulta
 * @returns {Promise<Object>} resultado paginado con tickets decorados
 */
async function listTickets(filters, user) {
  const limit = Math.min(100, Math.max(1, parseInt(filters.limit || '25', 10)));
  const cursor = typeof filters.cursor === 'string' && filters.cursor ? filters.cursor : null;

  const repo = await orm.getRepository(orm.Ticket);
  const pageQb = applyTicketScope(repo.createQueryBuilder('t'), filters, user)
    .orderBy('t.created_at', 'DESC')
    .addOrderBy('t.id', 'DESC')
    .take(limit + 1);

  const cursorState = decodeCursor(cursor);
  if (cursorState) {
    const [cCreatedAt, cId] = cursorState;
    pageQb.andWhere('(t.created_at < :cCreatedAt OR (t.created_at = :cCreatedAt AND t.id < :cId))', { cCreatedAt, cId });
  }

  const rows = await pageQb.getMany();
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? encodeCursor(pageRows[pageRows.length - 1]) : null;

  const total = filters.search ? null : await applyTicketScope(repo.createQueryBuilder('t'), filters, user).getCount();

  const enriched = await enrichTickets(pageRows);
  return { total, limit, hasMore, nextCursor, tickets: enriched.map(decorate) };
}

/**
 * Obtiene el detalle completo de un ticket: datos decorados, asignaciones, comentarios,
 * adjuntos e historial de auditoría relacionado, validando que el usuario tenga permiso
 * para verlo.
 * @param {String|Number} id - id del ticket
 * @param {Object} user - usuario que solicita el ticket
 * @returns {Promise<Object>} ticket decorado con { assignments, comments, attachments, history }
 */
async function getTicket(id, user) {
  const ticketRepo = await orm.getRepository(orm.Ticket);
  const raw = await ticketRepo.findOneBy({ id: Number(id) });
  if (!raw) throw notFoundError('Ticket no encontrado.');
  const [ticket] = await enrichTickets([raw]);
  if (!canView(ticket, user)) throw forbiddenError();

  const [assignmentRepo, commentRepo, attachmentRepo, auditRepo] = await Promise.all([
    orm.getRepository(orm.TicketAssignment),
    orm.getRepository(orm.TicketComment),
    orm.getRepository(orm.Attachment),
    orm.getRepository(orm.AuditLog),
  ]);
  const [assignments, comments, attachments, historyEntries] = await Promise.all([
    assignmentRepo.find({ where: { ticket_id: ticket.id }, order: { assigned_at: 'ASC' } }),
    commentRepo.find({ where: { ticket_id: ticket.id }, order: { created_at: 'ASC' } }),
    attachmentRepo.find({ where: { ticket_id: ticket.id }, order: { uploaded_at: 'ASC' } }),
    auditRepo.find({ where: { target_type: 'ticket', target_id: ticket.id }, order: { created_at: 'ASC' }, take: 200 }),
  ]);

  const userIds = Array.from(new Set([
    ...assignments.flatMap((a) => [a.from_user_id, a.to_user_id, a.assigned_by]),
    ...comments.map((c) => c.user_id),
    ...attachments.map((a) => a.user_id),
    ...historyEntries.map((h) => h.user_id),
  ].filter((v) => v != null)));
  const userRepo = await orm.getRepository(orm.User);
  const users = userIds.length ? await userRepo.findBy({ id: In(userIds) }) : [];
  const usersById = new Map(users.map((u) => [u.id, u]));

  const decorated = decorate(ticket);
  return {
    ...decorated,
    assignments: assignments.map((a) => ({
      ...a,
      from_user_name: usersById.get(a.from_user_id)?.full_name || null,
      to_user_name: usersById.get(a.to_user_id)?.full_name || null,
      assigned_by_name: usersById.get(a.assigned_by)?.full_name || null,
    })),
    comments: comments.map((c) => ({
      ...c,
      user_name: usersById.get(c.user_id)?.full_name || null,
      user_role: usersById.get(c.user_id)?.role || null,
    })),
    attachments: attachments.map((a) => ({
      ...a,
      user_name: usersById.get(a.user_id)?.full_name || null,
      user_role: usersById.get(a.user_id)?.role || null,
    })),
    history: historyEntries.map((h) => ({
      ...h,
      user_name: usersById.get(h.user_id)?.full_name || null,
      old_value: parseJsonMaybe(h.old_value),
      new_value: parseJsonMaybe(h.new_value),
    })),
  };
}

/**
 * Parsea un valor de old_value/new_value desde JSON si es un string parseable, o lo devuelve tal cual.
 * @param {*} value - valor crudo almacenado en la columna
 * @returns {*} valor parseado, o el original si no era JSON válido
 */
function parseJsonMaybe(value) {
  if (typeof value !== 'string' || !value) return value;
  try { return JSON.parse(value); } catch (_) { return value; }
}

/**
 * Actualiza los metadatos de un ticket (título, descripción, prioridad, categoría), validando permisos del usuario y notificando el cambio en tiempo real.
 * @param {String|Number} id - id del ticket a actualizar
 * @param {Object} payload - campos a actualizar
 * @param {Object} user - usuario que realiza la actualización
 * @returns {Promise<Object>} ticket actualizado decorado
 */
async function updateTicket(id, payload, user) {
  const repo = await orm.getRepository(orm.Ticket);
  const raw = await repo.findOneBy({ id: Number(id) });
  if (!raw) throw notFoundError('Ticket no encontrado.');
  const [ticket] = await enrichTickets([raw]);
  if (!canEditMeta(ticket, user)) throw forbiddenError();

  const patch = {};
  if (payload.title !== undefined) patch.title = requireString(payload.title, 'título', 200);
  if (payload.description !== undefined) patch.description = requireString(payload.description, 'descripción', 5000);
  if (payload.priority !== undefined) patch.priority = optionalEnum(payload.priority, 'prioridad', PRIORITIES) || ticket.priority;
  if (payload.category_id !== undefined) {
    const cid = payload.category_id ? parseInt(payload.category_id, 10) : null;
    if (cid) {
      const category = await (await orm.getRepository(orm.Category)).findOneBy({ id: cid });
      if (!category) throw validationError('La categoría seleccionada no existe.');
    }
    patch.category_id = cid;
  }

  if (Object.keys(patch).length === 0) {
    return decorate(ticket);
  }

  await repo.update({ id: ticket.id }, patch);
  const [updated] = await enrichTickets([await repo.findOneBy({ id: ticket.id })]);
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
  const repo = await orm.getRepository(orm.Ticket);
  const raw = await repo.findOneBy({ id: Number(id) });
  if (!raw) throw notFoundError('Ticket no encontrado.');
  const [ticket] = await enrichTickets([raw]);
  if (!canAssign(ticket, user)) throw forbiddenError('Solo SAC o jefes inmediatos pueden asignar tickets.');
  const to_user_id = parseInt(payload.to_user_id, 10);
  if (!to_user_id) throw validationError('Debe indicar el encargado destino.');
  const notes = optionalString(payload.notes, 'notas', 1000) || null;

  const userRepo = await orm.getRepository(orm.User);
  const target = await userRepo.findOneBy({ id: to_user_id });
  if (!target) throw notFoundError('El usuario destino no existe.');
  if (!target.active) throw validationError('El usuario destino está inactivo.');
  if (target.role !== 'admin_area' && target.role !== 'jefe_inmediato') {
    throw validationError('El ticket debe asignarse a un administrador de área o jefe inmediato.');
  }

  const ds = await orm.getDataSource();
  await ds.transaction(async (manager) => {
    const fromUserId = raw.assigned_to || null;
    const newStatus = raw.status === 'recibido' || raw.status === 'reabierto' ? 'asignado' : raw.status;
    await manager.getRepository(orm.TicketAssignment).save({
      ticket_id: ticket.id,
      from_user_id: fromUserId,
      to_user_id,
      assigned_by: Number(user.id),
      notes,
    });
    await manager.getRepository(orm.Ticket).update({ id: ticket.id }, {
      assigned_to: to_user_id,
      area: target.area || null,
      status: newStatus,
      closed_at: null,
    });
  });

  const [updated] = await enrichTickets([await repo.findOneBy({ id: ticket.id })]);
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

  const repo = await orm.getRepository(orm.Ticket);
  const raw = await repo.findOneBy({ id: Number(id) });
  if (!raw) throw notFoundError('Ticket no encontrado.');
  const [ticket] = await enrichTickets([raw]);
  if (!canView(ticket, user)) throw forbiddenError();
  if (!canChangeStatus(ticket, user, next)) throw forbiddenError('No puede cambiar a este estado.');

  const allowed = TRANSITIONS[ticket.status] || [];
  if (!allowed.includes(next)) {
    throw conflictError(`Transición no permitida: ${ticket.status} → ${next}.`);
  }

  const ds = await orm.getDataSource();
  await ds.transaction(async (manager) => {
    const patch = { status: next };
    patch.closed_at = next === 'cerrado' ? new Date() : null;
    await manager.getRepository(orm.Ticket).update({ id: ticket.id }, patch);
    if (comment) {
      await manager.getRepository(orm.TicketComment).save({
        ticket_id: ticket.id,
        user_id: Number(user.id),
        comment,
        attachment_id: null,
      });
    }
  });

  const [updated] = await enrichTickets([await repo.findOneBy({ id: ticket.id })]);
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
    const userRepo = await orm.getRepository(orm.User);
    const jefes = await userRepo.find({ where: { role: 'jefe_inmediato', active: true, area: ticket.area } });
    const jefe = jefes.find((u) => u.id !== user.id);
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
    const userRepo = await orm.getRepository(orm.User);
    const sacUsers = await userRepo.find({ where: { role: 'sac', active: true } });
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
 * Cambia la ubicación física de un ticket (taller / proveedor externo), validando permisos, notificando a la contraparte, registrando auditoría y emitiendo el cambio en tiempo real. Independiente de `status`: un ticket puede seguir "en_proceso" mientras está afuera, en un proveedor.
 * @param {String|Number} id - id del ticket
 * @param {Object} payload - datos del cambio (location_type, provider_id, reason)
 * @param {Object} user - usuario que realiza el cambio de ubicación
 * @returns {Promise<Object>} ticket actualizado decorado
 */
async function changeLocation(id, payload, user) {
  const next = optionalEnum(payload.location_type, 'ubicación', LOCATION_TYPES);
  if (!next) throw validationError('Debe indicar una ubicación válida.');

  const repo = await orm.getRepository(orm.Ticket);
  const raw = await repo.findOneBy({ id: Number(id) });
  if (!raw) throw notFoundError('Ticket no encontrado.');
  const [ticket] = await enrichTickets([raw]);
  if (!canView(ticket, user)) throw forbiddenError();
  if (!canChangeLocation(ticket, user)) throw forbiddenError('No puede cambiar la ubicación de este ticket.');

  let provider = null;
  let reason = null;
  const patch = { location_type: next, location_changed_at: new Date(), location_changed_by: Number(user.id) };

  if (next === 'proveedor') {
    const providerId = payload.provider_id ? parseInt(payload.provider_id, 10) : null;
    if (!providerId) throw validationError('Debe indicar el proveedor.');
    provider = await (await orm.getRepository(orm.Provider)).findOneBy({ id: providerId });
    if (!provider || !provider.active) throw validationError('El proveedor seleccionado no existe.');
    if (provider.company_id != null && String(provider.company_id) !== String(ticket.company_id)) {
      throw validationError('El proveedor seleccionado no pertenece a esta empresa.');
    }
    reason = optionalEnum(payload.reason, 'motivo', LOCATION_REASONS);
    if (!reason) throw validationError('Debe indicar el motivo del envío al proveedor.');
    patch.location_provider_id = provider.id;
    patch.location_reason = reason;
  } else {
    patch.location_provider_id = null;
    patch.location_reason = null;
  }

  await repo.update({ id: ticket.id }, patch);
  const [updated] = await enrichTickets([await repo.findOneBy({ id: ticket.id })]);
  const decorated = decorate(updated);

  const counterpart = ticket.assigned_to;
  if (counterpart && counterpart !== user.id) {
    await notificationsService.createAsync({
      user_id: counterpart,
      type: next === 'proveedor' ? 'ticket_sent_to_provider' : 'ticket_returned_to_shop',
      ticket_id: id,
      title: next === 'proveedor' ? `Enviado a proveedor: ${ticket.code}` : `De vuelta en el taller: ${ticket.code}`,
      body: next === 'proveedor'
        ? `${user.full_name} envió el ticket a "${provider.name}" (motivo: ${LOCATION_REASON_LABEL[reason]}).`
        : `${user.full_name} trajo el ticket de vuelta al taller.`,
    });
  }

  await auditService.logAsync({
    user_id: user.id,
    company_id: user.activeCompanyId,
    action_type: 'ticket_location_changed',
    target_type: 'ticket',
    target_id: id,
    target_code: ticket.code,
    description: next === 'proveedor'
      ? `Envió el ticket a proveedor "${provider.name}" (motivo: ${LOCATION_REASON_LABEL[reason]})`
      : `Regresó el ticket al taller`,
    old_value: {
      location_type: ticket.location_type,
      location_provider_id: ticket.location_provider_id,
      location_reason: ticket.location_reason,
    },
    new_value: {
      location_type: next,
      location_provider_id: patch.location_provider_id,
      location_reason: patch.location_reason,
    },
  });

  emit('ticket:location_changed', {
    ticketId: id,
    location_type: next,
    location_provider_id: patch.location_provider_id,
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

  const repo = await orm.getRepository(orm.Ticket);
  const raw = await repo.findOneBy({ id: Number(id) });
  if (!raw) throw notFoundError('Ticket no encontrado.');
  const [ticket] = await enrichTickets([raw]);
  if (!canView(ticket, user)) throw forbiddenError();

  const commentRepo = await orm.getRepository(orm.TicketComment);
  const row = await commentRepo.save({
    ticket_id: ticket.id,
    user_id: Number(user.id),
    comment,
    attachment_id: null,
  });
  const decoratedComment = { ...row, user_name: user.full_name, user_role: user.role };

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

  emit('ticket:commented', { ticketId: id, comment: decoratedComment }, { user: ticket.assigned_to, role: 'sac', room: 'tickets' });
  return decoratedComment;
}

/**
 * Sube un adjunto a un ticket, notifica a la contraparte, registra auditoría y emite el evento en tiempo real.
 * @param {String|Number} id - id del ticket
 * @param {Object} file - archivo subido (filename, originalname, mimetype, size)
 * @param {Object} user - usuario que sube el adjunto
 * @returns {Promise<Object>} adjunto creado con datos del usuario
 */
async function addAttachment(id, file, user) {
  const repo = await orm.getRepository(orm.Ticket);
  const raw = await repo.findOneBy({ id: Number(id) });
  if (!raw) throw notFoundError('Ticket no encontrado.');
  const [ticket] = await enrichTickets([raw]);
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
  assignTicket, changeStatus, changeLocation, addComment, addAttachment,
  canView, canEditMeta, canAssign, canClose, canReopen, canChangeStatus, canChangeLocation,
  TRANSITIONS, STATUS_LABEL, TICKET_STATUS,
};
