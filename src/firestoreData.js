'use strict';
const firestore = require('./firestore');

function normalizeString(value) {
  return value == null ? '' : String(value).trim();
}

function lower(value) {
  return value ? String(value).trim().toLowerCase() : null;
}

function toId(id) {
  if (id === undefined || id === null) return null;
  const str = String(id);
  return /^\d+$/.test(str) ? Number(str) : str;
}

function toLegacyDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().replace('T', ' ').slice(0, 19);
  return String(value);
}

function normalizeUser(row) {
  if (!row) return null;
  return {
    id: toId(row.id),
    username: row.username || '',
    full_name: row.full_name || '',
    role: row.role || '',
    area: row.area || null,
    active: row.active ? 1 : 0,
    created_at: toLegacyDate(row.created_at),
    email: row.email || null,
  };
}

function normalizeCategory(row) {
  if (!row) return null;
  return {
    id: toId(row.id),
    name: row.name || '',
    active: row.active ? 1 : 0,
    created_at: toLegacyDate(row.created_at),
  };
}

function normalizeNotification(row) {
  if (!row) return null;
  return {
    id: toId(row.id),
    user_id: toId(row.user_id),
    type: row.type || '',
    ticket_id: row.ticket_id != null ? toId(row.ticket_id) : null,
    title: row.title || '',
    body: row.body || null,
    read: row.read ? 1 : 0,
    created_at: toLegacyDate(row.created_at),
  };
}

function normalizeAudit(row) {
  if (!row) return null;
  let oldValue = row.old_value;
  let newValue = row.new_value;
  if (typeof oldValue === 'string' && oldValue) {
    try { oldValue = JSON.parse(oldValue); } catch (_) { }
  }
  if (typeof newValue === 'string' && newValue) {
    try { newValue = JSON.parse(newValue); } catch (_) { }
  }
  return {
    id: toId(row.id),
    user_id: toId(row.user_id),
    user_name: row.user_name || row.full_name || null,
    action_type: row.action_type || '',
    target_type: row.target_type || '',
    target_id: row.target_id != null ? toId(row.target_id) : null,
    target_code: row.target_code || null,
    description: row.description || null,
    old_value: oldValue,
    new_value: newValue,
    created_at: toLegacyDate(row.created_at),
  };
}

function normalizeTicket(row) {
  if (!row) return null;
  return {
    id: toId(row.id),
    code: row.code || '',
    title: row.title || '',
    description: row.description || '',
    category_id: row.category_id != null ? toId(row.category_id) : null,
    category_name: row.category_name || null,
    area: row.area || null,
    status: row.status || 'recibido',
    priority: row.priority || 'media',
    created_by: row.created_by != null ? toId(row.created_by) : null,
    created_by_name: row.created_by_name || null,
    created_by_area: row.created_by_area || null,
    created_by_role: row.created_by_role || null,
    assigned_to: row.assigned_to != null ? toId(row.assigned_to) : null,
    assigned_to_name: row.assigned_to_name || null,
    assigned_to_area: row.assigned_to_area || null,
    assigned_to_role: row.assigned_to_role || null,
    closed_by: row.closed_by != null ? toId(row.closed_by) : null,
    created_at: toLegacyDate(row.created_at),
    updated_at: toLegacyDate(row.updated_at),
    closed_at: row.closed_at ? toLegacyDate(row.closed_at) : null,
  };
}

function normalizeAssignment(row) {
  if (!row) return null;
  return {
    id: toId(row.id),
    ticket_id: toId(row.ticket_id),
    from_user_id: toId(row.from_user_id),
    to_user_id: toId(row.to_user_id),
    assigned_by: toId(row.assigned_by),
    notes: row.notes || null,
    assigned_at: toLegacyDate(row.assigned_at),
    from_user_name: row.from_user_name || null,
    to_user_name: row.to_user_name || null,
    assigned_by_name: row.assigned_by_name || null,
  };
}

function normalizeComment(row) {
  if (!row) return null;
  return {
    id: toId(row.id),
    ticket_id: toId(row.ticket_id),
    user_id: toId(row.user_id),
    comment: row.comment || '',
    attachment_id: row.attachment_id != null ? toId(row.attachment_id) : null,
    created_at: toLegacyDate(row.created_at),
    user_name: row.user_name || null,
    user_role: row.user_role || null,
  };
}

function normalizeAttachment(row) {
  if (!row) return null;
  return {
    id: toId(row.id),
    ticket_id: toId(row.ticket_id),
    user_id: toId(row.user_id),
    comment_id: row.comment_id != null ? toId(row.comment_id) : null,
    filename: row.filename || '',
    original_name: row.original_name || '',
    mime_type: row.mime_type || '',
    size: row.size || 0,
    uploaded_at: toLegacyDate(row.uploaded_at),
    user_name: row.user_name || null,
    user_role: row.user_role || null,
  };
}

async function getCollection(collectionName) {
  const db = firestore.getFirestore();
  const snapshot = await db.collection(collectionName).get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

async function getDoc(collectionName, id) {
  if (id == null) return null;
  const db = firestore.getFirestore();
  const ref = db.collection(collectionName).doc(String(id));
  const snap = await ref.get();
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() };
}

async function createDoc(collectionName, data, id = null) {
  const db = firestore.getFirestore();
  const docId = id != null ? String(id) : String(await firestore.getNextId(collectionName));
  const ref = db.collection(collectionName).doc(docId);
  await ref.set(data);
  return { id: docId, ...data };
}

async function updateDoc(collectionName, id, patch) {
  const db = firestore.getFirestore();
  const ref = db.collection(collectionName).doc(String(id));
  await ref.update(patch);
  const snap = await ref.get();
  return { id: snap.id, ...snap.data() };
}

async function findOne(collectionName, predicate) {
  const items = await getCollection(collectionName);
  return items.find(predicate) || null;
}

async function filterAll(collectionName, predicate) {
  const items = await getCollection(collectionName);
  return items.filter(predicate);
}

async function cacheById(collectionName, ids) {
  const result = {};
  if (!ids || !ids.length) return result;
  const db = firestore.getFirestore();
  const refs = ids.map((id) => db.collection(collectionName).doc(String(id)));
  const snaps = await db.getAll(...refs);
  for (const snap of snaps) {
    if (snap.exists) result[snap.id] = { id: snap.id, ...snap.data() };
  }
  return result;
}

async function getUserByIdentifier(identifier) {
  const normalized = normalizeString(identifier).toLowerCase();
  if (!normalized) return null;

  let user = await findOne('users', (item) => item.username_lower === normalized || item.email_lower === normalized);
  if (user) return user;

  if (normalized.includes('@')) {
    const local = normalized.split('@')[0];
    user = await findOne('users', (item) => item.username_lower === local);
  }
  return user;
}

async function listUsers({ role, active, area } = {}) {
  const users = await getCollection('users');
  return users.filter((user) => {
    if (role && user.role !== role) return false;
    if (active !== undefined && Boolean(user.active) !== Boolean(active)) return false;
    if (area && user.area !== area) return false;
    return true;
  }).map(normalizeUser);
}

async function getUserById(id) {
  const row = await getDoc('users', id);
  return normalizeUser(row);
}

async function createUser({ username, password_hash, full_name, role, area, email }) {
  const normalizedUsername = normalizeString(username);
  const lowerUsername = normalizedUsername.toLowerCase();
  const normalizedEmail = normalizeString(email);
  const lowerEmail = normalizedEmail ? normalizedEmail.toLowerCase() : null;

  const existing = await findOne('users', (item) => item.username_lower === lowerUsername || (lowerEmail && item.email_lower === lowerEmail));
  if (existing) {
    const error = new Error('El nombre de usuario ya existe.');
    error.code = 'CONFLICT';
    throw error;
  }

  const now = firestore.nowSql();
  const payload = {
    username: normalizedUsername,
    username_lower: lowerUsername,
    password_hash,
    full_name: normalizeString(full_name),
    email: normalizedEmail || null,
    email_lower: lowerEmail,
    role,
    area: normalizeString(area) || null,
    active: 1,
    created_at: now,
  };
  const doc = await createDoc('users', payload);
  return normalizeUser(doc);
}

async function updateUser(id, patch) {
  const existing = await getDoc('users', id);
  if (!existing) {
    const err = new Error('Usuario no encontrado.');
    err.code = 'NOT_FOUND';
    throw err;
  }
  const updatePayload = {};
  if (patch.full_name !== undefined) updatePayload.full_name = normalizeString(patch.full_name);
  if (patch.role !== undefined) updatePayload.role = normalizeString(patch.role);
  if (patch.area !== undefined) updatePayload.area = normalizeString(patch.area) || null;
  if (patch.email !== undefined) {
    const normalizedEmail = normalizeString(patch.email);
    updatePayload.email = normalizedEmail || null;
    updatePayload.email_lower = normalizedEmail ? normalizedEmail.toLowerCase() : null;
  }
  if (patch.active !== undefined) updatePayload.active = patch.active ? 1 : 0;
  if (patch.password) updatePayload.password_hash = patch.password;
  if (patch.username !== undefined) {
    const normalizedUsername = normalizeString(patch.username);
    updatePayload.username = normalizedUsername;
    updatePayload.username_lower = normalizedUsername.toLowerCase();
  }
  updatePayload.updated_at = firestore.nowSql();
  const updated = await updateDoc('users', id, updatePayload);
  return normalizeUser(updated);
}

async function listCategories(activeOnly = true) {
  const rows = await getCollection('categories');
  return rows.filter((row) => (activeOnly ? row.active : true)).map(normalizeCategory);
}

async function getCategoryById(id) {
  const row = await getDoc('categories', id);
  return normalizeCategory(row);
}

async function createCategory(name) {
  const normalizedName = normalizeString(name);
  const lowerName = normalizedName.toLowerCase();
  if (!normalizedName) {
    const err = new Error('El nombre de la categoría es obligatorio.');
    err.code = 'VALIDATION_ERROR';
    throw err;
  }
  const existing = await findOne('categories', (item) => item.name_lower === lowerName);
  if (existing) {
    const err = new Error('Ya existe una categoría con ese nombre.');
    err.code = 'VALIDATION_ERROR';
    throw err;
  }
  const now = firestore.nowSql();
  const doc = await createDoc('categories', {
    name: normalizedName,
    name_lower: lowerName,
    active: 1,
    created_at: now,
  });
  return normalizeCategory(doc);
}

async function updateCategory(id, { name, active } = {}) {
  const existing = await getDoc('categories', id);
  if (!existing) {
    const err = new Error('Categoría no encontrada.');
    err.code = 'NOT_FOUND';
    throw err;
  }
  const patch = {};
  if (name !== undefined) {
    const normalizedName = normalizeString(name);
    if (!normalizedName) {
      const err = new Error('El nombre no puede estar vacío.');
      err.code = 'VALIDATION_ERROR';
      throw err;
    }
    const exists = await findOne('categories', (item) => item.name_lower === normalizedName.toLowerCase() && item.id !== String(id));
    if (exists) {
      const err = new Error('Ya existe una categoría con ese nombre.');
      err.code = 'VALIDATION_ERROR';
      throw err;
    }
    patch.name = normalizedName;
    patch.name_lower = normalizedName.toLowerCase();
  }
  if (active !== undefined) patch.active = active ? 1 : 0;
  if (Object.keys(patch).length === 0) return normalizeCategory(existing);
  const updated = await updateDoc('categories', id, patch);
  return normalizeCategory(updated);
}

async function createNotification({ user_id, type, ticket_id, title, body }) {
  const now = firestore.nowSql();
  const doc = await createDoc('notifications', {
    user_id: toId(user_id),
    type,
    ticket_id: ticket_id != null ? toId(ticket_id) : null,
    title,
    body: body || null,
    read: 0,
    created_at: now,
  });
  return normalizeNotification(doc);
}

async function getUnreadCount(userId) {
  const rows = await getCollection('notifications');
  return rows.filter((row) => toId(row.user_id) === toId(userId) && !row.read).length;
}

async function listNotificationsForUser(userId, { limit = 30, onlyUnread = false } = {}) {
  const rows = await getCollection('notifications');
  const filtered = rows.filter((row) => toId(row.user_id) === toId(userId) && (!onlyUnread || !row.read));
  const sorted = filtered.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  return sorted.slice(0, limit).map(normalizeNotification);
}

async function markNotificationsRead(userId, { all = false, ids = [] } = {}) {
  const rows = await getCollection('notifications');
  const toUpdate = rows.filter((row) => {
    if (toId(row.user_id) !== toId(userId)) return false;
    if (all) return !row.read;
    return ids.includes(toId(row.id));
  });
  const db = firestore.getFirestore();
  const batch = db.batch();
  for (const row of toUpdate) {
    batch.update(db.collection('notifications').doc(String(row.id)), { read: 1 });
  }
  await batch.commit();
  return { updated: toUpdate.length };
}

async function logAudit(audit) {
  const now = firestore.nowSql();
  await createDoc('audit_log', {
    user_id: toId(audit.user_id),
    action_type: audit.action_type,
    target_type: audit.target_type,
    target_id: audit.target_id != null ? toId(audit.target_id) : null,
    target_code: audit.target_code || null,
    description: audit.description || null,
    old_value: typeof audit.old_value === 'object' ? JSON.stringify(audit.old_value) : audit.old_value || null,
    new_value: typeof audit.new_value === 'object' ? JSON.stringify(audit.new_value) : audit.new_value || null,
    ip_address: audit.ip_address || null,
    created_at: now,
  });
}

async function listAudit({ page = 1, limit = 50, user_id = null, action_type = null, date_from = null, date_to = null, search = null } = {}) {
  const rows = await getCollection('audit_log');
  const filtered = rows.filter((row) => {
    if (user_id && toId(row.user_id) !== toId(user_id)) return false;
    if (action_type && row.action_type !== action_type) return false;
    if (date_from && (!row.created_at || row.created_at < date_from)) return false;
    if (date_to && (!row.created_at || row.created_at > date_to)) return false;
    if (search) {
      const needle = search.toLowerCase();
      return (row.description || '').toLowerCase().includes(needle)
        || (row.target_code || '').toLowerCase().includes(needle);
    }
    return true;
  });
  const userCache = {};
  const userIds = Array.from(new Set(filtered.map((r) => String(r.user_id)).filter(Boolean)));
  const users = await cacheById('users', userIds);
  const data = filtered
    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
    .slice((page - 1) * limit, page * limit)
    .map((row) => normalizeAudit({ ...row, user_name: users[String(row.user_id)]?.full_name || null }));
  const actionCounts = data.reduce((acc, r) => {
    acc[r.action_type] = (acc[r.action_type] || 0) + 1;
    return acc;
  }, {});
  const mostFrequentAction = Object.entries(actionCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  const activeUserCount = new Set(data.map((r) => r.user_id).filter(Boolean)).size;
  return {
    data,
    total: filtered.length,
    page,
    limit,
    mostFrequentAction,
    activeUserCount,
  };
}

async function getActionTypes() {
  const rows = await getCollection('audit_log');
  return Array.from(new Set(rows.map((row) => row.action_type || ''))).filter(Boolean).sort();
}

async function getActiveAuditUsers() {
  const rows = await getCollection('audit_log');
  const userIds = Array.from(new Set(rows.map((r) => String(r.user_id)).filter(Boolean)));
  const users = await cacheById('users', userIds);
  return Object.values(users)
    .map((user) => ({ id: toId(user.id), username: user.username, full_name: user.full_name }))
    .sort((a, b) => String(a.full_name).localeCompare(String(b.full_name)));
}

async function getTicketById(id) {
  const ticket = await getDoc('tickets', id);
  return ticket ? { ...ticket, id: toId(ticket.id) } : null;
}

async function getTicketRelatedData(ticket) {
  const [category, createdBy, assignedTo, closedBy] = await Promise.all([
    ticket.category_id ? getDoc('categories', ticket.category_id) : null,
    ticket.created_by ? getDoc('users', ticket.created_by) : null,
    ticket.assigned_to ? getDoc('users', ticket.assigned_to) : null,
    ticket.closed_by ? getDoc('users', ticket.closed_by) : null,
  ]);
  return {
    ...ticket,
    category_name: category?.name || null,
    created_by_name: createdBy?.full_name || null,
    created_by_area: createdBy?.area || null,
    created_by_role: createdBy?.role || null,
    assigned_to_name: assignedTo?.full_name || null,
    assigned_to_area: assignedTo?.area || null,
    assigned_to_role: assignedTo?.role || null,
  };
}

async function decorateTicket(ticket) {
  if (!ticket) return null;
  const decorated = await getTicketRelatedData(ticket);
  return normalizeTicket(decorated);
}

async function createTicket({ title, description, category_id, priority }, user) {
  const now = firestore.nowSql();
  const code = await generateUniqueCode();
  const category = category_id ? await getDoc('categories', category_id) : null;
  const payload = {
    code,
    title,
    description,
    category_id: category_id != null ? toId(category_id) : null,
    category_name: category?.name || null,
    area: category?.area || null,
    status: 'recibido',
    priority,
    created_by: toId(user.id),
    assigned_to: null,
    closed_by: null,
    created_at: now,
    updated_at: now,
    closed_at: null,
  };
  const doc = await createDoc('tickets', payload);
  return normalizeTicket({ ...doc, category_name: category?.name || null });
}

async function listTickets(filters, user, page = 1, limit = 25) {
  const all = await getCollection('tickets');
  const filtered = all.filter((ticket) => {
    if (user.role === 'supervisor_campo' && toId(ticket.created_by) !== toId(user.id)) return false;
    if (user.role === 'admin_area' && toId(ticket.assigned_to) !== toId(user.id) && toId(ticket.created_by) !== toId(user.id)) return false;
    if (filters.status && ticket.status !== filters.status) return false;
    if (filters.priority && ticket.priority !== filters.priority) return false;
    if (filters.category_id && toId(ticket.category_id) !== toId(filters.category_id)) return false;
    if (filters.assigned_to && toId(ticket.assigned_to) !== toId(filters.assigned_to)) return false;
    if (filters.area && ticket.area !== filters.area) return false;
    if (filters.date_from && ticket.created_at < filters.date_from) return false;
    if (filters.date_to && ticket.created_at > filters.date_to) return false;
    if (filters.search) {
      const text = filters.search.toLowerCase();
      return String(ticket.title).toLowerCase().includes(text)
        || String(ticket.code).toLowerCase().includes(text)
        || String(ticket.description).toLowerCase().includes(text);
    }
    return true;
  });
  const sorted = filtered.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  const pageSlice = sorted.slice((page - 1) * limit, page * limit);
  const decorated = await Promise.all(pageSlice.map(decorateTicket));
  return { total: filtered.length, page, limit, tickets: decorated };
}

async function getTicketDetail(id, user) {
  const ticket = await getTicketById(id);
  if (!ticket) return null;
  const decorated = await decorateTicket(ticket);
  const [assignments, comments, attachments] = await Promise.all([
    getCollection('ticket_assignments'),
    getCollection('ticket_comments'),
    getCollection('attachments'),
  ]);
  const relatedAssignments = assignments.filter((a) => toId(a.ticket_id) === toId(id));
  const relatedComments = comments.filter((c) => toId(c.ticket_id) === toId(id));
  const relatedAttachments = attachments.filter((a) => toId(a.ticket_id) === toId(id));
  const userIds = Array.from(new Set([
    ...relatedAssignments.map((a) => a.from_user_id),
    ...relatedAssignments.map((a) => a.to_user_id),
    ...relatedAssignments.map((a) => a.assigned_by),
    ...relatedComments.map((c) => c.user_id),
    ...relatedAttachments.map((a) => a.user_id),
  ].filter(Boolean).map(String)));
  const users = await cacheById('users', userIds);
  const assignmentRows = relatedAssignments.map((row) => normalizeAssignment({
    ...row,
    from_user_name: users[String(row.from_user_id)]?.full_name || null,
    to_user_name: users[String(row.to_user_id)]?.full_name || null,
    assigned_by_name: users[String(row.assigned_by)]?.full_name || null,
  }));
  const commentRows = relatedComments.map((row) => normalizeComment({
    ...row,
    user_name: users[String(row.user_id)]?.full_name || null,
    user_role: users[String(row.user_id)]?.role || null,
  }));
  const attachmentRows = relatedAttachments.map((row) => normalizeAttachment({
    ...row,
    user_name: users[String(row.user_id)]?.full_name || null,
    user_role: users[String(row.user_id)]?.role || null,
  }));
  return {
    ...decorated,
    assignments: assignmentRows,
    comments: commentRows,
    attachments: attachmentRows,
  };
}

async function generateUniqueCode() {
  const prefix = require('./utils/time').ticketCodeFor();
  const tickets = await getCollection('tickets');
  const matches = tickets.filter((ticket) => String(ticket.code || '').startsWith(prefix));
  let seq = 1;
  for (const ticket of matches) {
    const parts = String(ticket.code).split('-');
    const n = parseInt(parts[parts.length - 1], 10);
    if (!Number.isNaN(n) && n >= seq) seq = n + 1;
  }
  return `${prefix}${String(seq).padStart(4, '0')}`;
}

async function updateTicket(id, patch, user) {
  const ticket = await getTicketById(id);
  if (!ticket) {
    const err = new Error('Ticket no encontrado.');
    err.code = 'NOT_FOUND';
    throw err;
  }
  const updatePayload = {};
  if (patch.title !== undefined) updatePayload.title = normalizeString(patch.title);
  if (patch.description !== undefined) updatePayload.description = normalizeString(patch.description);
  if (patch.priority !== undefined) updatePayload.priority = normalizeString(patch.priority);
  if (patch.category_id !== undefined) {
    const cid = patch.category_id ? toId(patch.category_id) : null;
    if (cid) {
      const category = await getCategoryById(cid);
      if (!category) {
        const err = new Error('La categoría seleccionada no existe.');
        err.code = 'VALIDATION_ERROR';
        throw err;
      }
      updatePayload.category_name = category.name;
    } else {
      updatePayload.category_name = null;
    }
    updatePayload.category_id = cid;
  }
  if (Object.keys(updatePayload).length === 0) {
    return decorateTicket(ticket);
  }
  updatePayload.updated_at = firestore.nowSql();
  const updated = await updateDoc('tickets', id, updatePayload);
  return decorateTicket(updated);
}

async function addComment(ticketId, comment, user) {
  const ticket = await getTicketById(ticketId);
  if (!ticket) {
    const err = new Error('Ticket no encontrado.');
    err.code = 'NOT_FOUND';
    throw err;
  }
  const now = firestore.nowSql();
  const doc = await createDoc('ticket_comments', {
    ticket_id: toId(ticketId),
    user_id: toId(user.id),
    comment,
    attachment_id: null,
    created_at: now,
  });
  return normalizeComment({ ...doc, user_name: user.full_name, user_role: user.role });
}

async function addAttachment({ ticket_id, user_id, filename, original_name, mime_type, size }) {
  const now = firestore.nowSql();
  const doc = await createDoc('attachments', {
    ticket_id: toId(ticket_id),
    user_id: toId(user_id),
    comment_id: null,
    filename,
    original_name,
    mime_type,
    size,
    uploaded_at: now,
  });
  return normalizeAttachment(doc);
}

async function getAttachment(id) {
  const row = await getDoc('attachments', id);
  return normalizeAttachment(row);
}

async function getAttachmentForTicket(ticketId, attachmentId) {
  const attachment = await getAttachment(attachmentId);
  if (!attachment || toId(attachment.ticket_id) !== toId(ticketId)) return null;
  return attachment;
}

async function getAttachmentWithUser(attachmentId) {
  const row = await getDoc('attachments', attachmentId);
  if (!row) return null;
  const user = await getDoc('users', row.user_id);
  return normalizeAttachment({
    ...row,
    user_name: user?.full_name || null,
    user_role: user?.role || null,
  });
}

async function getCategoryActiveOrNull(id) {
  if (!id) return null;
  return getCategoryById(id);
}

async function listTicketAssignments(ticketId) {
  const rows = await getCollection('ticket_assignments');
  return rows.filter((row) => toId(row.ticket_id) === toId(ticketId));
}

async function listTicketComments(ticketId) {
  const rows = await getCollection('ticket_comments');
  return rows.filter((row) => toId(row.ticket_id) === toId(ticketId));
}

async function listTicketAttachments(ticketId) {
  const rows = await getCollection('attachments');
  return rows.filter((row) => toId(row.ticket_id) === toId(ticketId));
}

async function assignTicket(id, to_user_id, user, notes) {
  const ticket = await getTicketById(id);
  if (!ticket) {
    const err = new Error('Ticket no encontrado.');
    err.code = 'NOT_FOUND';
    throw err;
  }
  const target = await getUserById(to_user_id);
  if (!target) {
    const err = new Error('El usuario destino no existe.');
    err.code = 'NOT_FOUND';
    throw err;
  }
  if (!target.active) {
    const err = new Error('El usuario destino está inactivo.');
    err.code = 'VALIDATION_ERROR';
    throw err;
  }
  if (target.role !== 'admin_area' && target.role !== 'jefe_inmediato') {
    const err = new Error('El ticket debe asignarse a un administrador de área o jefe inmediato.');
    err.code = 'VALIDATION_ERROR';
    throw err;
  }
  const fromUserId = ticket.assigned_to || null;
  const newStatus = ticket.status === 'recibido' || ticket.status === 'reabierto' ? 'asignado' : ticket.status;
  await createDoc('ticket_assignments', {
    ticket_id: toId(id),
    from_user_id: fromUserId,
    to_user_id: toId(to_user_id),
    assigned_by: toId(user.id),
    notes: notes || null,
    assigned_at: firestore.nowSql(),
  });
  await updateDoc('tickets', id, {
    assigned_to: toId(to_user_id),
    area: target.area || null,
    status: newStatus,
    updated_at: firestore.nowSql(),
    closed_at: null,
  });
  return getTicketDetail(id, user);
}

async function changeTicketStatus(id, next, comment, user) {
  const ticket = await getTicketById(id);
  if (!ticket) {
    const err = new Error('Ticket no encontrado.');
    err.code = 'NOT_FOUND';
    throw err;
  }
  const transitions = {
    recibido: ['asignado', 'cerrado'],
    asignado: ['en_proceso', 'asignado'],
    en_proceso: ['solucionado', 'asignado'],
    solucionado: ['cerrado', 'reabierto', 'en_proceso'],
    cerrado: ['reabierto'],
    reabierto: ['en_proceso', 'asignado'],
  };
  if (!(transitions[ticket.status] || []).includes(next)) {
    const err = new Error(`Transición no permitida: ${ticket.status} → ${next}.`);
    err.code = 'CONFLICT';
    throw err;
  }
  const updatePayload = { status: next, updated_at: firestore.nowSql() };
  if (next === 'cerrado') updatePayload.closed_at = firestore.nowSql();
  if (next !== 'cerrado') updatePayload.closed_at = null;
  await updateDoc('tickets', id, updatePayload);
  if (comment) {
    await createDoc('ticket_comments', {
      ticket_id: toId(id),
      user_id: toId(user.id),
      comment,
      attachment_id: null,
      created_at: firestore.nowSql(),
    });
  }
  return getTicketDetail(id, user);
}

async function getStats() {
  const tickets = await getCollection('tickets');
  const users = await getCollection('users');
  const categories = await getCollection('categories');
  const byStatus = Object.entries(tickets.reduce((acc, ticket) => {
    acc[ticket.status] = (acc[ticket.status] || 0) + 1;
    return acc;
  }, {})).map(([status, c]) => ({ status, c }));
  const byPriority = Object.entries(tickets.reduce((acc, ticket) => {
    acc[ticket.priority] = (acc[ticket.priority] || 0) + 1;
    return acc;
  }, {})).map(([priority, c]) => ({ priority, c }));
  const byArea = Object.entries(tickets.reduce((acc, ticket) => {
    const area = ticket.area || 'sin_area';
    acc[area] = (acc[area] || 0) + 1;
    return acc;
  }, {})).map(([area, c]) => ({ area, c }));
  const closedRows = tickets.filter((t) => t.closed_at);
  const avgHours = closedRows.length
    ? closedRows.reduce((acc, t) => {
      const created = new Date(String(t.created_at).replace(' ', 'T'));
      const closed = new Date(String(t.closed_at).replace(' ', 'T'));
      return acc + ((closed - created) / 36e5);
    }, 0) / closedRows.length
    : 0;
  const last30 = Object.entries(tickets.reduce((acc, ticket) => {
    if (!ticket.created_at) return acc;
    const date = String(ticket.created_at).slice(0, 10);
    const now = new Date();
    const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30);
    const ticketDate = new Date(date);
    if (ticketDate >= cutoff) {
      acc[date] = (acc[date] || 0) + 1;
    }
    return acc;
  }, {})).map(([day, c]) => ({ day, c })).sort((a, b) => a.day.localeCompare(b.day));
  const topCategories = Object.entries(tickets.reduce((acc, ticket) => {
    const categoryId = String(ticket.category_id || '');
    acc[categoryId] = (acc[categoryId] || 0) + 1;
    return acc;
  }, {})).map(([categoryId, c]) => ({ categoryId, c }));
  const categoryMap = categories.reduce((acc, cat) => { acc[String(cat.id)] = cat.name; return acc; }, {});
  const topCategoryRows = topCategories
    .map((item) => ({ id: item.categoryId || null, name: categoryMap[item.categoryId] || null, c: item.c }))
    .filter((item) => item.id)
    .sort((a, b) => b.c - a.c)
    .slice(0, 5);
  const totals = {
    total: tickets.length,
    open: tickets.filter((t) => t.status !== 'cerrado').length,
    closed: tickets.filter((t) => t.status === 'cerrado').length,
    resolved: tickets.filter((t) => t.status === 'solucionado').length,
    reopened: tickets.filter((t) => t.status === 'reabierto').length,
  };
  return { totals, avg_resolution_hours: avgHours, by_status: byStatus, by_priority: byPriority, by_area: byArea, last_30_days: last30, top_categories: topCategoryRows };
}

async function getStatsForUser(userId, user) {
  const tickets = await getCollection('tickets');
  if (user.role === 'admin_area') {
    const filtered = tickets.filter((ticket) => toId(ticket.assigned_to) === toId(userId) || toId(ticket.created_by) === toId(userId));
    const totals = {
      total: filtered.length,
      en_proceso: filtered.filter((t) => t.status === 'en_proceso').length,
      solucionado: filtered.filter((t) => t.status === 'solucionado').length,
      asignado: filtered.filter((t) => t.status === 'asignado').length,
      cerrado: filtered.filter((t) => t.status === 'cerrado').length,
      reabierto: filtered.filter((t) => t.status === 'reabierto').length,
    };
    const closed = filtered.filter((t) => t.closed_at);
    const avgHours = closed.length
      ? closed.reduce((acc, t) => {
        const created = new Date(String(t.created_at).replace(' ', 'T'));
        const closed = new Date(String(t.closed_at).replace(' ', 'T'));
        return acc + ((closed - created) / 36e5);
      }, 0) / closed.length
      : 0;
    const byPriority = Object.entries(filtered.reduce((acc, ticket) => { acc[ticket.priority] = (acc[ticket.priority] || 0) + 1; return acc; }, {})).map(([priority, c]) => ({ priority, c }));
    return { totals, avg_resolution_hours: avgHours, by_priority: byPriority };
  }
  if (user.role === 'supervisor_campo') {
    const filtered = tickets.filter((ticket) => toId(ticket.created_by) === toId(userId));
    const totals = { total: filtered.length, open: filtered.filter((t) => t.status !== 'cerrado').length, closed: filtered.filter((t) => t.status === 'cerrado').length };
    return { totals };
  }
  if (user.role === 'jefe_inmediato') {
    const filtered = tickets.filter((ticket) => ticket.area === user.area);
    const totals = { total: filtered.length, open: filtered.filter((t) => t.status !== 'cerrado').length, closed: filtered.filter((t) => t.status === 'cerrado').length, solved: filtered.filter((t) => t.status === 'solucionado').length, reopened: filtered.filter((t) => t.status === 'reabierto').length };
    const byAssignee = Object.entries(filtered.reduce((acc, ticket) => {
      const assignee = String(ticket.assigned_to || '');
      if (assignee) acc[assignee] = (acc[assignee] || 0) + 1;
      return acc;
    }, {})).map(([uid, c]) => ({ id: toId(uid), c })).sort((a, b) => b.c - a.c);
    const userMap = (await cacheById('users', byAssignee.map((item) => item.id).filter(Boolean).map(String))) || {};
    return { totals, by_assignee: byAssignee.map((item) => ({ ...item, full_name: userMap[String(item.id)]?.full_name || null })) };
  }
  return {};
}

module.exports = {
  toId,
  getUserByIdentifier,
  listUsers,
  getUserById,
  createUser,
  updateUser,
  listCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  createNotification,
  getUnreadCount,
  listNotificationsForUser,
  markNotificationsRead,
  logAudit,
  listAudit,
  getActionTypes,
  getActiveAuditUsers,
  getTicketById,
  getTicketDetail,
  createTicket,
  listTickets,
  updateTicket,
  addComment,
  addAttachment,
  getAttachment,
  getAttachmentForTicket,
  getAttachmentWithUser,
  assignTicket,
  changeTicketStatus,
  getStats,
  getStatsForUser,
};
