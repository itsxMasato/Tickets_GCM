/* Documentado por: Miguel Flores */
'use strict';
const firestore = require('./firestore');
const { FieldPath } = require('firebase-admin/firestore');

const IS_NULL = Symbol('firestoreData.IS_NULL');

/**
 * Convierte un valor a string recortado, devolviendo cadena vacía si es null/undefined.
 * @param {*} value - valor a normalizar
 * @returns {String} valor normalizado como string
 */
function normalizeString(value) {
  return value == null ? '' : String(value).trim();
}

/**
 * Convierte un valor a minúsculas recortado, o null si el valor es vacío/nulo.
 * Se usa para generar campos *_lower usados en búsquedas case-insensitive.
 * @param {*} value - valor a normalizar
 * @returns {String|null} valor en minúsculas o null
 */
function lower(value) {
  return value ? String(value).trim().toLowerCase() : null;
}

/**
 * Normaliza un id de documento de Firestore a Number cuando es puramente numérico,
 * o lo deja como String en caso contrario. Devuelve null si el id es null/undefined.
 * @param {String|Number} id - id a normalizar
 * @returns {String|Number|null} id normalizado
 */
function toId(id) {
  if (id === undefined || id === null) return null;
  const str = String(id);
  return /^\d+$/.test(str) ? Number(str) : str;
}

/**
 * Convierte una fecha (Date o Timestamp de Firestore) al formato legacy usado
 * antes de migrar a Firestore ('YYYY-MM-DD HH:mm:ss').
 * @param {*} value - fecha a convertir
 * @returns {String|null} fecha en formato legacy, o null si no hay valor
 */
function toLegacyDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().replace('T', ' ').slice(0, 19);
  return String(value);
}

/**
 * Convierte una fecha 'YYYY-MM-DD' en el límite superior inclusivo del día
 * ('YYYY-MM-DD 23:59:59'), útil para filtros de rango de fechas en Firestore.
 * @param {String} dateStr - fecha en formato 'YYYY-MM-DD' (u otro formato ya completo)
 * @returns {String} fecha con hora de fin de día, o el valor original si no matchea el patrón
 */
function endOfDayInclusive(dateStr) {
  if (!dateStr) return dateStr;
  return /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? `${dateStr} 23:59:59` : dateStr;
}

/**
 * Normaliza un documento crudo de la colección 'users' al shape legacy usado
 * por el resto de la aplicación (ids tipados, flags booleanos como 0/1, etc.).
 * @param {Object} row - documento crudo de Firestore de la colección 'users'
 * @returns {Object|null} usuario normalizado, o null si no se recibió documento
 */
function normalizeUser(row) {
  if (!row) return null;
  const isActive = row.active === 0 || row.active === false || row.active === '0' || row.active === 'false'
    ? false
    : true;
  return {
    id: toId(row.id),
    username: row.username || '',
    full_name: row.full_name || '',
    role: row.role || '',
    area: row.area || null,
    active: isActive ? 1 : 0,
    created_at: toLegacyDate(row.created_at),
    email: row.email || null,
    avatar_url: row.avatar_url || null,
    is_platform_admin: row.is_platform_admin === true || row.is_platform_admin === 1 || row.is_platform_admin === '1',
    is_bootstrap: row.is_bootstrap === true || row.is_bootstrap === 1 || row.is_bootstrap === '1',
  };
}

/**
 * Normaliza un documento crudo de la colección 'categories' al shape legacy de la aplicación.
 * @param {Object} row - documento crudo de Firestore de la colección 'categories'
 * @returns {Object|null} categoría normalizada, o null si no se recibió documento
 */
function normalizeCategory(row) {
  if (!row) return null;
  return {
    id: toId(row.id),
    name: row.name || '',
    company_id: row.company_id != null ? toId(row.company_id) : null,
    active: row.active ? 1 : 0,
    created_at: toLegacyDate(row.created_at),
  };
}

/**
 * Filtra una lista de filas (tickets, categorías, etc.) dejando solo las que
 * pertenecen a la empresa activa indicada o las que no tienen empresa asignada (company_id null).
 * @param {Array<Object>} rows - filas a filtrar, cada una con campo company_id
 * @param {String|Number|null} activeCompanyId - id de la empresa activa del usuario
 * @returns {Array<Object>} filas filtradas por empresa
 */
function scopeByCompany(rows, activeCompanyId) {
  if (activeCompanyId == null)
    return rows.filter((row) => row.company_id == null);
  const normalized = String(activeCompanyId);
  return rows.filter((row) => row.company_id == null || String(row.company_id) === normalized);
}

/**
 * Filtra una lista de usuarios dejando visibles solo al propio requester, a los
 * miembros activos de su empresa activa y a los usuarios sin ninguna membresía
 * registrada. No aplica restricción si el requester es platform admin, rol 'sac'
 * o no tiene empresa activa.
 * @param {Array<Object>} rows - usuarios a filtrar
 * @param {Array<Object>} memberships - documentos de 'user_company_memberships'
 * @param {Object} requester - usuario que realiza la consulta (con role/isPlatformAdmin/activeCompanyId)
 * @returns {Array<Object>} usuarios visibles para el requester
 */
function scopeUsersByCompany(rows, memberships, requester) {
  if (!requester || requester.isPlatformAdmin || requester.role === 'sac' || requester.activeCompanyId == null) {
    return rows;
  }
  const activeCompanyId = String(requester.activeCompanyId);
  const isActive = (m) => m.active === 1 || m.active === true || m.active === '1' || m.active === 'true';
  const memberIds = new Set(memberships.filter((m) => isActive(m) && String(m.company_id) === activeCompanyId).map((m) => String(m.user_id)));
  const anyMembershipIds = new Set(memberships.map((m) => String(m.user_id)));
  const requesterId = String(requester.id);
  return rows.filter((row) => {
    const id = String(row.id);
    return id === requesterId || memberIds.has(id) || !anyMembershipIds.has(id);
  });
}

/**
 * Normaliza un documento crudo de la colección 'notifications' al shape legacy de la aplicación.
 * @param {Object} row - documento crudo de Firestore de la colección 'notifications'
 * @returns {Object|null} notificación normalizada, o null si no se recibió documento
 */
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

/**
 * Normaliza un documento crudo de la colección 'audit_log' al shape legacy de la
 * aplicación, parseando old_value/new_value desde JSON si vienen como string.
 * @param {Object} row - documento crudo de Firestore de la colección 'audit_log'
 * @returns {Object|null} registro de auditoría normalizado, o null si no se recibió documento
 */
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

/**
 * Normaliza un documento crudo de la colección 'tickets' al shape legacy de la aplicación.
 * @param {Object} row - documento crudo de Firestore de la colección 'tickets'
 * @returns {Object|null} ticket normalizado, o null si no se recibió documento
 */
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
    company_id: row.company_id != null ? toId(row.company_id) : null,
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

/**
 * Normaliza un documento crudo de la colección 'ticket_assignments' al shape legacy de la aplicación.
 * @param {Object} row - documento crudo de Firestore de la colección 'ticket_assignments'
 * @returns {Object|null} asignación normalizada, o null si no se recibió documento
 */
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

/**
 * Normaliza un documento crudo de la colección 'ticket_comments' al shape legacy de la aplicación.
 * @param {Object} row - documento crudo de Firestore de la colección 'ticket_comments'
 * @returns {Object|null} comentario normalizado, o null si no se recibió documento
 */
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

/**
 * Normaliza un documento crudo de la colección 'attachments' al shape legacy de la aplicación.
 * @param {Object} row - documento crudo de Firestore de la colección 'attachments'
 * @returns {Object|null} adjunto normalizado, o null si no se recibió documento
 */
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

/**
 * Compara dos valores de campo para ordenamiento, tratando null/undefined como
 * mayores que cualquier valor definido (van al final).
 * @param {*} a - primer valor a comparar
 * @param {*} b - segundo valor a comparar
 * @param {String} [direction] - dirección del orden ('asc' o 'desc')
 * @returns {Number} -1, 0 o 1 según el orden relativo de a y b
 */
function compareFieldValues(a, b, direction = 'asc') {
  if (a === b) return 0;
  if (a === undefined || a === null) return 1;
  if (b === undefined || b === null) return -1;
  if (a > b) return direction === 'asc' ? 1 : -1;
  if (a < b) return direction === 'asc' ? -1 : 1;
  return 0;
}

/**
 * Ordena en memoria una lista de filas por el campo indicado. Si no se
 * especifica orderBy, devuelve las filas sin modificar.
 * @param {Array<Object>} rows - filas a ordenar
 * @param {String} orderBy - nombre del campo por el cual ordenar
 * @param {String} direction - dirección del orden ('asc' o 'desc')
 * @returns {Array<Object>} filas ordenadas
 */
function normalizeQueryRows(rows, orderBy, direction) {
  if (!orderBy) return rows;
  return rows.sort((a, b) => compareFieldValues(a[orderBy], b[orderBy], direction));
}

/**
 * Compara dos filas para ordenamiento por cursor (paginación), usando el campo
 * de orden como criterio principal y, si hay empate y se pidió desempate,
 * el id del documento como criterio secundario para garantizar un orden estable.
 * @param {Object} a - primera fila a comparar
 * @param {Object} b - segunda fila a comparar
 * @param {String} orderByField - campo principal de orden
 * @param {String} direction - dirección del orden ('asc' o 'desc')
 * @param {Boolean} tieBreakByDocId - si se debe desempatar por id de documento
 * @returns {Number} -1, 0 o 1 según el orden relativo de a y b
 */
function compareRowsForCursor(a, b, orderByField, direction, tieBreakByDocId) {
  const primary = compareFieldValues(a[orderByField], b[orderByField], direction);
  if (primary !== 0 || !tieBreakByDocId) return primary;
  if (a.id === b.id) return 0;
  const asc = direction !== 'desc';
  return (String(a.id) > String(b.id)) === asc ? 1 : -1;
}

/**
 * Ejecuta una consulta genérica sobre una colección de Firestore aplicando
 * cláusulas where, orden, selección de campos, paginación por cursor (startAfter)
 * y límite. Si Firestore rechaza la consulta por falta de índice compuesto,
 * hace un fallback trayendo los documentos sin orderBy/startAfter en el servidor
 * y aplicando el orden, el cursor y el límite en memoria.
 * @param {String} collectionName - nombre de la colección a consultar
 * @param {Array<Array>} [whereClauses] - lista de tuplas [campo, operador, valor]
 * @param {Object} [options] - opciones de la consulta (select, orderBy, direction, tieBreakByDocId, startAfter, limit)
 * @returns {Promise<Array<Object>>} documentos que cumplen la consulta, con id incluido
 */
async function queryCollection(collectionName, whereClauses = [], options = {}) {
  const db = firestore.getFirestore();
  let q = db.collection(collectionName);
  for (const [field, op, value] of whereClauses) {
    if (value === undefined || value === null) continue;
    q = q.where(field, op, value === IS_NULL ? null : value);
  }
  if (Array.isArray(options.select) && options.select.length > 0) {
    q = q.select(...options.select);
  }
  if (options.orderBy) {
    q = q.orderBy(options.orderBy, options.direction || 'asc');
  }
  if (options.tieBreakByDocId) {
    q = q.orderBy(FieldPath.documentId(), options.direction || 'asc');
  }
  if (Array.isArray(options.startAfter) && options.startAfter.length > 0) {
    q = q.startAfter(...options.startAfter);
  }
  if (options.limit) {
    q = q.limit(options.limit);
  }

  try {
    const snapshot = await q.get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  } catch (err) {
    const code = String(err.code || '').toLowerCase();
    const isIndexError = code === 'failed-precondition' || (err.message || '').toLowerCase().includes('requires an index');
    if (!isIndexError)
      throw err;

    let fallbackQuery = db.collection(collectionName);
    for (const [field, op, value] of whereClauses) {
      if (value === undefined || value === null) continue;
      fallbackQuery = fallbackQuery.where(field, op, value === IS_NULL ? null : value);
    }
    if (Array.isArray(options.select) && options.select.length > 0) {
      fallbackQuery = fallbackQuery.select(...options.select);
    }
    const snapshot = await fallbackQuery.get();
    let rows = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const direction = options.direction || 'asc';
    if (options.orderBy) {
      rows = rows.sort((a, b) => compareRowsForCursor(a, b, options.orderBy, direction, options.tieBreakByDocId));
    }
    if (Array.isArray(options.startAfter) && options.startAfter.length > 0) {
      const [cursorValue, cursorDocId] = options.startAfter;
      const cursorRow = { [options.orderBy]: cursorValue, id: cursorDocId };
      rows = rows.filter((row) => compareRowsForCursor(row, cursorRow, options.orderBy, direction, options.tieBreakByDocId) > 0);
    }
    if (options.limit) {
      rows = rows.slice(0, options.limit);
    }
    return rows;
  }
}

/**
 * Cuenta documentos de una colección de Firestore que cumplen las cláusulas where
 * dadas, usando el agregado count() nativo cuando está disponible y cayendo a
 * contar el snapshot completo si no lo está o si falla por falta de índice.
 * @param {String} collectionName - nombre de la colección
 * @param {Array<Array>} [whereClauses] - lista de tuplas [campo, operador, valor]
 * @returns {Promise<Number>} cantidad de documentos que cumplen los filtros
 */
async function countCollection(collectionName, whereClauses = []) {
  const db = firestore.getFirestore();
  let q = db.collection(collectionName);
  for (const [field, op, value] of whereClauses) {
    if (value === undefined || value === null) continue;
    q = q.where(field, op, value === IS_NULL ? null : value);
  }
  if (typeof q.count === 'function') {
    try {
      const snapshot = await q.count().get();
      return snapshot.data().count || 0;
    } catch (err) {
      const code = String(err.code || '').toLowerCase();
      const isIndexError = code === 'failed-precondition' || (err.message || '').toLowerCase().includes('requires an index');
      if (!isIndexError) throw err;
    }
  }
  const snapshot = await q.get();
  return snapshot.size;
}

/**
 * Cuenta documentos de una colección agrupados por los distintos valores posibles
 * de un campo (por ejemplo, tickets por estado o por prioridad).
 * @param {String} collectionName - nombre de la colección
 * @param {Array<Array>} [whereClauses] - filtros comunes a todos los grupos
 * @param {String} field - campo por el cual agrupar
 * @param {Array} [values] - valores posibles del campo a contar
 * @returns {Promise<Array<Object>>} lista de objetos { [field]: valor, c: cantidad }
 */
async function countGroupByValues(collectionName, whereClauses = [], field, values = []) {
  const counts = await Promise.all(values.map((value) => countCollection(collectionName, [...whereClauses, [field, '==', value]])));
  return counts.map((c, index) => ({ [field]: values[index], c }));
}

/**
 * Cuenta documentos de una colección agrupados por día, para una lista de fechas dadas
 * (usado para series de tiempo como "tickets creados por día").
 * @param {String} collectionName - nombre de la colección
 * @param {String} field - campo de fecha sobre el que se agrupa (por ejemplo created_at)
 * @param {Array<String>} [dates] - fechas 'YYYY-MM-DD' a contar
 * @param {Array<Array>} [extraClauses] - filtros adicionales comunes a todos los días
 * @returns {Promise<Array<Object>>} lista de objetos { day, c } con la cantidad por día
 */
async function countByDay(collectionName, field, dates = [], extraClauses = []) {
  const results = await Promise.all(dates.map(async (start) => {
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const isoStart = start;
    const isoEnd = end.toISOString().slice(0, 10);
    const c = await countCollection(collectionName, [...extraClauses, [field, '>=', isoStart], [field, '<', isoEnd]]);
    return { day: start, c };
  }));
  return results;
}

/**
 * Busca el primer documento de una colección que cumpla la lista de cláusulas where dada.
 * @param {String} collectionName - nombre de la colección
 * @param {Array<Array>} [clauses] - lista de tuplas [campo, operador, valor]
 * @returns {Promise<Object|null>} primer documento que cumple los filtros, o null
 */
async function findOneByFields(collectionName, clauses = []) {
  const rows = await queryCollection(collectionName, clauses, { limit: 1 });
  return rows[0] || null;
}

/**
 * Obtiene un documento por id de cualquier colección de Firestore.
 * @param {String} collectionName - nombre de la colección
 * @param {String|Number} id - id del documento a buscar
 * @returns {Promise<Object|null>} documento encontrado (con id) o null si no existe o id es nulo
 */
async function getDoc(collectionName, id) {
  if (id == null) return null;
  const db = firestore.getFirestore();
  const ref = db.collection(collectionName).doc(String(id));
  const snap = await ref.get();
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() };
}

/**
 * Crea un documento en cualquier colección de Firestore. Si no se pasa id,
 * se genera uno autoincremental con firestore.getNextId.
 * @param {String} collectionName - nombre de la colección donde crear el documento
 * @param {Object} data - datos a guardar en el documento
 * @param {String|Number} [id] - id explícito a usar; si se omite, se genera automáticamente
 * @returns {Promise<Object>} documento creado (con id incluido)
 */
async function createDoc(collectionName, data, id = null) {
  const db = firestore.getFirestore();
  const docId = id != null ? String(id) : String(await firestore.getNextId(collectionName));
  const ref = db.collection(collectionName).doc(docId);
  await ref.set(data);
  return { id: docId, ...data };
}

/**
 * Aplica un patch parcial a un documento de cualquier colección de Firestore
 * y devuelve el documento resultante ya actualizado.
 * @param {String} collectionName - nombre de la colección
 * @param {String|Number} id - id del documento a actualizar
 * @param {Object} patch - campos a actualizar
 * @returns {Promise<Object>} documento actualizado (con id)
 */
async function updateDoc(collectionName, id, patch) {
  const db = firestore.getFirestore();
  const ref = db.collection(collectionName).doc(String(id));
  await ref.update(patch);
  const snap = await ref.get();
  return { id: snap.id, ...snap.data() };
}

/**
 * Trae en batch (usando db.getAll) varios documentos de una colección por sus ids
 * y arma un diccionario { id: documento } para lookups rápidos en memoria.
 * @param {String} collectionName - nombre de la colección
 * @param {Array<String|Number>} ids - ids a resolver
 * @returns {Promise<Object>} diccionario de documentos indexados por id (solo los existentes)
 */
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

/**
 * Busca un usuario en la colección 'users' por username o email, probando en orden:
 * username_lower exacto, email_lower exacto, y si el identificador tiene formato de
 * email, el username_lower de la parte local (antes del @) como último recurso.
 * @param {String} identifier - username o email ingresado por el usuario
 * @returns {Promise<Object|null>} documento crudo del usuario encontrado, o null
 */
async function getUserByIdentifier(identifier) {
  const normalized = normalizeString(identifier).toLowerCase();
  if (!normalized) return null;

  let user = await findOneByFields('users', [['username_lower', '==', normalized]]);
  if (user) return user;

  user = await findOneByFields('users', [['email_lower', '==', normalized]]);
  if (user) return user;

  if (normalized.includes('@')) {
    const local = normalized.split('@')[0];
    user = await findOneByFields('users', [['username_lower', '==', local]]);
  }
  return user;
}

/**
 * Lista usuarios de la colección 'users' aplicando filtros opcionales de rol,
 * estado activo y área, y luego acota el resultado por empresa según los
 * permisos del requester (ver scopeUsersByCompany).
 * @param {Object} [filters] - filtros de la consulta
 * @param {String} [filters.role] - rol a filtrar
 * @param {Boolean} [filters.active] - estado activo a filtrar
 * @param {String} [filters.area] - área a filtrar
 * @param {Object} [requester] - usuario que realiza la consulta, usado para acotar por empresa
 * @returns {Promise<Array<Object>>} usuarios normalizados que cumplen los filtros
 */
async function listUsers({ role, active, area } = {}, requester = null) {
  const clauses = [];
  if (role) clauses.push(['role', '==', role]);
  if (active !== undefined) clauses.push(['active', '==', active ? 1 : 0]);
  if (area) clauses.push(['area', '==', area]);
  const rows = await queryCollection('users', clauses);
  if (!requester || requester.isPlatformAdmin || requester.role === 'sac' || requester.activeCompanyId == null) {
    return rows.map(normalizeUser);
  }
  const memberships = await queryCollection('user_company_memberships', []);
  return scopeUsersByCompany(rows, memberships, requester).map(normalizeUser);
}

/**
 * Obtiene un usuario de la colección 'users' por id, ya normalizado.
 * @param {String|Number} id - id del usuario
 * @returns {Promise<Object|null>} usuario normalizado, o null si no existe
 */
async function getUserById(id) {
  const row = await getDoc('users', id);
  return normalizeUser(row);
}

/**
 * Crea un usuario nuevo en la colección 'users', validando que el username y el
 * email (si se envía) no estén ya en uso.
 * @param {Object} params - datos del usuario a crear
 * @param {String} params.username - nombre de usuario
 * @param {String} params.password_hash - hash de la contraseña ya calculado
 * @param {String} params.full_name - nombre completo
 * @param {String} params.role - rol del usuario
 * @param {String} [params.area] - área del usuario
 * @param {String} [params.email] - email del usuario
 * @returns {Promise<Object>} usuario creado y normalizado
 * @throws {Error} con código CONFLICT si el username o email ya existen
 */
async function createUser({ username, password_hash, full_name, role, area, email }) {
  const normalizedUsername = normalizeString(username);
  const lowerUsername = normalizedUsername.toLowerCase();
  const normalizedEmail = normalizeString(email);
  const lowerEmail = normalizedEmail ? normalizedEmail.toLowerCase() : null;

  let existing = await findOneByFields('users', [['username_lower', '==', lowerUsername]]);
  if (!existing && lowerEmail) {
    existing = await findOneByFields('users', [['email_lower', '==', lowerEmail]]);
  }
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

/**
 * Actualiza campos parciales de un usuario en la colección 'users' (nombre, rol,
 * flags de admin/bootstrap, área, email, estado activo, avatar, password, username),
 * validando que el email y el username sigan siendo únicos si se modifican.
 * @param {String|Number} id - id del usuario a actualizar
 * @param {Object} patch - campos a actualizar
 * @returns {Promise<Object>} usuario actualizado y normalizado
 * @throws {Error} con código NOT_FOUND si el usuario no existe, o CONFLICT si email/username ya están en uso
 */
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
  if (patch.is_platform_admin !== undefined) updatePayload.is_platform_admin = !!patch.is_platform_admin;
  if (patch.is_bootstrap !== undefined) updatePayload.is_bootstrap = !!patch.is_bootstrap;
  if (patch.area !== undefined) updatePayload.area = normalizeString(patch.area) || null;
  if (patch.email !== undefined) {
    const normalizedEmail = normalizeString(patch.email);
    const lowerEmail = normalizedEmail ? normalizedEmail.toLowerCase() : null;
    if (lowerEmail) {
      const conflict = await findOneByFields('users', [['email_lower', '==', lowerEmail]]);
      if (conflict && String(conflict.id) !== String(id)) {
        const error = new Error('Ese correo ya está en uso por otro usuario.');
        error.code = 'CONFLICT';
        throw error;
      }
    }
    updatePayload.email = normalizedEmail || null;
    updatePayload.email_lower = lowerEmail;
  }
  if (patch.active !== undefined) updatePayload.active = patch.active ? 1 : 0;
  if (patch.avatar_url !== undefined) updatePayload.avatar_url = patch.avatar_url || null;
  if (patch.password) updatePayload.password_hash = patch.password;
  if (patch.username !== undefined) {
    const normalizedUsername = normalizeString(patch.username);
    const lowerUsername = normalizedUsername.toLowerCase();
    const conflict = await findOneByFields('users', [['username_lower', '==', lowerUsername]]);
    if (conflict && String(conflict.id) !== String(id)) {
      const error = new Error('El nombre de usuario ya existe.');
      error.code = 'CONFLICT';
      throw error;
    }
    updatePayload.username = normalizedUsername;
    updatePayload.username_lower = lowerUsername;
  }
  updatePayload.updated_at = firestore.nowSql();
  const updated = await updateDoc('users', id, updatePayload);
  return normalizeUser(updated);
}

/**
 * Elimina definitivamente un documento de usuario de la colección 'users'.
 * @param {String|Number} id - id del usuario a eliminar
 * @returns {Promise<void>}
 */
async function deleteUser(id) {
  await firestore.deleteDoc('users', id);
}

/**
 * Lista categorías de la colección 'categories', opcionalmente solo las activas,
 * acotadas por empresa según el usuario que consulta.
 * @param {Boolean} [activeOnly] - si es true, filtra solo categorías activas
 * @param {Object} [user] - usuario que realiza la consulta, usado para acotar por empresa
 * @returns {Promise<Array<Object>>} categorías normalizadas
 */
async function listCategories(activeOnly = true, user = null) {
  const clauses = [];
  if (activeOnly) clauses.push(['active', '==', 1]);
  const rows = await queryCollection('categories', clauses);
  const scoped = user && !user.isPlatformAdmin ? scopeByCompany(rows, user.activeCompanyId) : rows;
  return scoped.map(normalizeCategory);
}

/**
 * Obtiene una categoría de la colección 'categories' por id, ya normalizada.
 * @param {String|Number} id - id de la categoría
 * @returns {Promise<Object|null>} categoría normalizada, o null si no existe
 */
async function getCategoryById(id) {
  const row = await getDoc('categories', id);
  return normalizeCategory(row);
}

/**
 * Crea una categoría nueva en la colección 'categories' dentro de la empresa activa
 * del usuario, validando que el nombre no esté vacío ni duplicado en esa empresa.
 * @param {String} name - nombre de la categoría
 * @param {Object} [user] - usuario que crea la categoría, determina la empresa
 * @returns {Promise<Object>} categoría creada y normalizada
 * @throws {Error} con código VALIDATION_ERROR si el nombre es vacío o ya existe
 */
async function createCategory(name, user = null) {
  const normalizedName = normalizeString(name);
  const lowerName = normalizedName.toLowerCase();
  if (!normalizedName) {
    const err = new Error('El nombre de la categoría es obligatorio.');
    err.code = 'VALIDATION_ERROR';
    throw err;
  }
  const companyId = user && user.activeCompanyId != null ? toId(user.activeCompanyId) : null;
  const existing = await findOneByFields('categories', [['name_lower', '==', lowerName], ['company_id', '==', companyId]]);
  if (existing) {
    const err = new Error('Ya existe una categoría con ese nombre.');
    err.code = 'VALIDATION_ERROR';
    throw err;
  }
  const now = firestore.nowSql();
  const doc = await createDoc('categories', {
    name: normalizedName,
    name_lower: lowerName,
    company_id: companyId,
    active: 1,
    created_at: now,
  });
  return normalizeCategory(doc);
}

/**
 * Actualiza el nombre y/o estado activo de una categoría en la colección 'categories',
 * validando que el nuevo nombre no esté vacío ni duplicado dentro de la misma empresa.
 * @param {String|Number} id - id de la categoría a actualizar
 * @param {Object} [params] - campos a actualizar
 * @param {String} [params.name] - nuevo nombre de la categoría
 * @param {Boolean} [params.active] - nuevo estado activo
 * @returns {Promise<Object>} categoría actualizada y normalizada
 * @throws {Error} con código NOT_FOUND si no existe, o VALIDATION_ERROR si el nombre es inválido/duplicado
 */
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
    const exists = await findOneByFields('categories', [['name_lower', '==', normalizedName.toLowerCase()], ['company_id', '==', existing.company_id ?? null]]);
    if (exists && String(exists.id) !== String(id)) {
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

/**
 * Elimina lógicamente una categoría de la colección 'categories' (la marca inactiva
 * en lugar de borrar el documento).
 * @param {String|Number} id - id de la categoría a eliminar
 * @returns {Promise<Object>} categoría normalizada con active en 0
 * @throws {Error} con código NOT_FOUND si la categoría no existe
 */
async function deleteCategory(id) {
  const existing = await getDoc('categories', id);
  if (!existing) {
    const err = new Error('Categoría no encontrada.');
    err.code = 'NOT_FOUND';
    throw err;
  }
  const updated = await updateDoc('categories', id, { active: 0 });
  return normalizeCategory(updated);
}

/**
 * Crea una notificación no leída en la colección 'notifications' para un usuario.
 * @param {Object} params - datos de la notificación
 * @param {String|Number} params.user_id - id del usuario destinatario
 * @param {String} params.type - tipo de notificación
 * @param {String|Number} [params.ticket_id] - id del ticket relacionado, si aplica
 * @param {String} params.title - título de la notificación
 * @param {String} [params.body] - cuerpo/detalle de la notificación
 * @returns {Promise<Object>} notificación creada y normalizada
 */
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

/**
 * Cuenta las notificaciones no leídas de un usuario en la colección 'notifications'.
 * @param {String|Number} userId - id del usuario
 * @returns {Promise<Number>} cantidad de notificaciones no leídas
 */
async function getUnreadCount(userId) {
  return countCollection('notifications', [['user_id', '==', toId(userId)], ['read', '==', 0]]);
}

/**
 * Lista las notificaciones de un usuario en la colección 'notifications', más
 * recientes primero, con límite y filtro opcional de solo no leídas.
 * @param {String|Number} userId - id del usuario
 * @param {Object} [options] - opciones de la consulta
 * @param {Number} [options.limit] - cantidad máxima de notificaciones a devolver
 * @param {Boolean} [options.onlyUnread] - si es true, trae solo las no leídas
 * @returns {Promise<Array<Object>>} notificaciones normalizadas
 */
async function listNotificationsForUser(userId, { limit = 30, onlyUnread = false } = {}) {
  const clauses = [['user_id', '==', toId(userId)]];
  if (onlyUnread) clauses.push(['read', '==', 0]);
  const rows = await queryCollection('notifications', clauses, { orderBy: 'created_at', direction: 'desc', limit });
  return rows.map(normalizeNotification);
}

/**
 * Marca como leídas las notificaciones de un usuario en la colección 'notifications',
 * ya sea todas las no leídas (all=true) o una lista puntual de ids, usando un batch write.
 * Solo actualiza las notificaciones que efectivamente pertenecen al usuario indicado.
 * @param {String|Number} userId - id del usuario dueño de las notificaciones
 * @param {Object} [options] - opciones de la operación
 * @param {Boolean} [options.all] - si es true, marca todas las no leídas del usuario
 * @param {Array<String|Number>} [options.ids] - ids puntuales a marcar como leídas
 * @returns {Promise<Object>} objeto { updated: cantidad de notificaciones actualizadas }
 */
async function markNotificationsRead(userId, { all = false, ids = [] } = {}) {
  const db = firestore.getFirestore();
  const batch = db.batch();
  let rows = [];

  if (all) {
    rows = await queryCollection('notifications', [['user_id', '==', toId(userId)], ['read', '==', 0]]);
  } else if (ids.length) {
    const refs = ids.map((id) => db.collection('notifications').doc(String(id)));
    const snaps = await db.getAll(...refs);
    rows = snaps.filter((snap) => snap.exists).map((snap) => ({ id: snap.id, ...snap.data() }));
  }

  for (const row of rows) {
    if (toId(row.user_id) !== toId(userId)) continue;
    batch.update(db.collection('notifications').doc(String(row.id)), { read: 1 });
  }
  if (batch._ops && batch._ops.length === 0) {
    return { updated: 0 };
  }
  await batch.commit();
  return { updated: rows.length };
}

/**
 * Registra una entrada en la colección 'audit_log' y además actualiza (merge)
 * las colecciones auxiliares 'audit_action_types' y 'audit_active_users', usadas
 * como caché para poblar los filtros de la vista de auditoría sin escanear todo el log.
 * @param {Object} audit - datos del evento de auditoría
 * @param {String|Number} audit.user_id - id del usuario que realizó la acción
 * @param {String|Number} [audit.company_id] - id de la empresa relacionada
 * @param {String} audit.action_type - tipo de acción realizada
 * @param {String} audit.target_type - tipo de entidad afectada
 * @param {String|Number} [audit.target_id] - id de la entidad afectada
 * @param {String} [audit.target_code] - código legible de la entidad afectada
 * @param {String} [audit.description] - descripción de la acción
 * @param {*} [audit.old_value] - valor previo (se serializa a JSON si es objeto)
 * @param {*} [audit.new_value] - valor nuevo (se serializa a JSON si es objeto)
 * @param {String} [audit.ip_address] - ip desde la que se realizó la acción
 * @param {String} [audit.user_name] - nombre del usuario, para la caché de usuarios activos
 * @returns {Promise<Object>} documento de auditoría creado
 */
async function logAudit(audit) {
  const now = firestore.nowSql();
  const doc = await createDoc('audit_log', {
    user_id: toId(audit.user_id),
    company_id: audit.company_id != null ? toId(audit.company_id) : null,
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

  const db = firestore.getFirestore();
  const batch = db.batch();
  if (audit.action_type) {
    const actionTypeRef = db.collection('audit_action_types').doc(String(audit.action_type));
    batch.set(actionTypeRef, { action_type: audit.action_type }, { merge: true });
  }
  if (audit.user_id) {
    const userRef = db.collection('audit_active_users').doc(String(audit.user_id));
    batch.set(userRef, {
      user_id: toId(audit.user_id),
      username: audit.user_name || null,
      full_name: audit.user_name || null,
    }, { merge: true });
  }
  if (batch._ops && batch._ops.length > 0) {
    await batch.commit();
  }
  return doc;
}

/**
 * Lista entradas de la colección 'audit_log' con paginación por cursor, filtros
 * (usuario, tipo de acción, rango de fechas, búsqueda de texto libre) y acotamiento
 * por empresa según el requester. Además calcula estadísticas agregadas (acción más
 * frecuente y cantidad de usuarios activos) sobre una muestra de resultados.
 * @param {Object} [options] - opciones de la consulta
 * @param {String} [options.cursor] - cursor de paginación (codificado con encodeCreatedAtCursor)
 * @param {Number} [options.limit] - cantidad de resultados por página
 * @param {String|Number} [options.user_id] - filtro por usuario
 * @param {String} [options.action_type] - filtro por tipo de acción
 * @param {String} [options.date_from] - filtro por fecha desde
 * @param {String} [options.date_to] - filtro por fecha hasta
 * @param {String} [options.search] - búsqueda de texto libre en descripción/código
 * @param {Object} [options.requester] - usuario que consulta, para acotar por empresa
 * @returns {Promise<Object>} objeto con { data, total, limit, hasMore, nextCursor, mostFrequentAction, activeUserCount }
 */
async function listAudit(
  { cursor = null, limit = 50, user_id = null, action_type = null, date_from = null, date_to = null, search = null, requester = null } = {}
) {
  const clauses = [];
  if (user_id) clauses.push(['user_id', '==', toId(user_id)]);
  if (action_type) clauses.push(['action_type', '==', action_type]);
  if (date_from) clauses.push(['created_at', '>=', date_from]);
  if (date_to) clauses.push(['created_at', '<=', endOfDayInclusive(date_to)]);

  const companyScoped = !!(requester && !requester.isPlatformAdmin);
  const activeCompanyId = companyScoped ? requester.activeCompanyId : null;

  function applyScope(rows) {
    let out = rows;
    if (search) {
      const needle = search.toLowerCase();
      out = out.filter((row) => (row.description || '').toLowerCase().includes(needle)
        || (row.target_code || '').toLowerCase().includes(needle));
    }
    if (companyScoped) {
      out = out.filter((row) => row.company_id == null
        || (activeCompanyId != null && String(row.company_id) === String(activeCompanyId)));
    }
    return out;
  }

  const needsWiderWindow = !!search || companyScoped;
  const windowSize = needsWiderWindow ? Math.max(limit * 4, 100) : Math.max(limit + 10, 30);
  const maxIterations = needsWiderWindow ? 15 : 8;

  let cursorState = decodeCreatedAtCursor(cursor);
  const collected = [];
  let exhausted = false;
  let iterations = 0;

  while (!exhausted && iterations < maxIterations) {
    if (collected.length >= limit) break;
    iterations++;
    const options = { orderBy: 'created_at', direction: 'desc', tieBreakByDocId: true, limit: windowSize };
    if (cursorState) options.startAfter = cursorState;
    const batch = await queryCollection('audit_log', clauses, options);
    if (batch.length === 0) { exhausted = true; break; }
    const last = batch[batch.length - 1];
    cursorState = [last.created_at, String(last.id)];
    collected.push(...applyScope(batch));
    if (batch.length < windowSize) exhausted = true;
  }

  const pageRows = collected.slice(0, limit);
  const hasMore = collected.length > limit || !exhausted;
  const nextCursor = pageRows.length > 0 ? encodeCreatedAtCursor(pageRows[pageRows.length - 1]) : null;

  const total = needsWiderWindow ? null : await countCollection('audit_log', clauses);

  const userIds = Array.from(new Set(pageRows.map((r) => String(r.user_id)).filter(Boolean)));
  const users = await cacheById('users', userIds);
  const data = pageRows.map((row) => normalizeAudit({ ...row, user_name: users[String(row.user_id)]?.full_name || null }));

  const STATS_SAMPLE = 1000;
  const statsRows = needsWiderWindow
    ? collected
    : await queryCollection('audit_log', clauses, { orderBy: 'created_at', direction: 'desc', tieBreakByDocId: true, limit: STATS_SAMPLE });
  const actionCounts = statsRows.reduce((acc, r) => {
    acc[r.action_type] = (acc[r.action_type] || 0) + 1;
    return acc;
  }, {});
  const mostFrequentAction = Object.entries(actionCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  const activeUserCount = new Set(statsRows.map((r) => r.user_id).filter(Boolean)).size;
  return {
    data,
    total,
    limit,
    hasMore,
    nextCursor,
    mostFrequentAction,
    activeUserCount,
  };
}

/**
 * Devuelve la lista de tipos de acción de auditoría disponibles, leyendo primero
 * la colección de caché 'audit_action_types' y, si está vacía, derivándolos de
 * 'audit_log' completo como fallback.
 * @returns {Promise<Array<String>>} tipos de acción únicos, ordenados alfabéticamente
 */
async function getActionTypes() {
  const rows = await queryCollection('audit_action_types', [], { orderBy: 'action_type', direction: 'asc' });
  if (rows.length > 0) {
    return rows.map((row) => row.action_type).filter(Boolean);
  }
  const auditRows = await queryCollection('audit_log', [], { select: ['action_type'] });
  return Array.from(new Set(auditRows.map((row) => row.action_type || ''))).filter(Boolean).sort();
}

/**
 * Devuelve los usuarios que aparecen como autores de eventos de auditoría, leyendo
 * primero la colección de caché 'audit_active_users' y, si está vacía, derivándolos
 * de 'audit_log' completo como fallback.
 * @returns {Promise<Array<Object>>} usuarios activos en auditoría { id, username, full_name }, ordenados por nombre
 */
async function getActiveAuditUsers() {
  const cacheRows = await queryCollection('audit_active_users', [], {});
  let userIds;
  if (cacheRows.length > 0) {
    userIds = Array.from(new Set(cacheRows.map((r) => String(r.user_id)).filter(Boolean)));
  } else {
    const auditRows = await queryCollection('audit_log', [], { select: ['user_id'] });
    userIds = Array.from(new Set(auditRows.map((r) => String(r.user_id)).filter(Boolean)));
  }
  const users = await cacheById('users', userIds);
  return Object.values(users)
    .map((user) => ({ id: toId(user.id), username: user.username, full_name: user.full_name }))
    .sort((a, b) => String(a.full_name).localeCompare(String(b.full_name)));
}

/**
 * Obtiene un ticket de la colección 'tickets' por id, con sus campos de referencia
 * (category_id, company_id, created_by, assigned_to, closed_by) tipados como id.
 * @param {String|Number} id - id del ticket
 * @returns {Promise<Object|null>} ticket con ids normalizados, o null si no existe
 */
async function getTicketById(id) {
  const ticket = await getDoc('tickets', id);
  if (!ticket)
    return null;
  return {
    ...ticket,
    id: toId(ticket.id),
    category_id: ticket.category_id != null ? toId(ticket.category_id) : null,
    company_id: ticket.company_id != null ? toId(ticket.company_id) : null,
    created_by: ticket.created_by != null ? toId(ticket.created_by) : null,
    assigned_to: ticket.assigned_to != null ? toId(ticket.assigned_to) : null,
    closed_by: ticket.closed_by != null ? toId(ticket.closed_by) : null,
  };
}

/**
 * Enriquece un ticket con los nombres/área/rol de su categoría, creador, asignado
 * y quien lo cerró, resolviendo esas referencias contra 'categories' y 'users'.
 * @param {Object} ticket - ticket base con ids de referencia
 * @returns {Promise<Object>} ticket enriquecido con los campos *_name/*_area/*_role
 */
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

/**
 * Obtiene un ticket por id ya decorado con los datos relacionados (categoría, usuarios) y normalizado.
 * @param {String|Number} id - id del ticket
 * @returns {Promise<Object|null>} ticket normalizado y decorado, o null si no existe
 */
async function getTicketWithArea(id) {
  const ticket = await getTicketById(id);
  if (!ticket) return null;
  return decorateTicket(ticket);
}

/**
 * Enriquece un ticket con sus datos relacionados y lo normaliza al shape legacy final.
 * @param {Object} ticket - ticket base a decorar
 * @returns {Promise<Object|null>} ticket decorado y normalizado, o null si no se recibió ticket
 */
async function decorateTicket(ticket) {
  if (!ticket) return null;
  const decorated = await getTicketRelatedData(ticket);
  return normalizeTicket(decorated);
}

/**
 * Crea un ticket nuevo en la colección 'tickets' con estado inicial 'recibido',
 * generando un código único (prefijo de empresa + secuencia) y copiando el nombre
 * y área de la categoría seleccionada.
 * @param {Object} params - datos del ticket a crear
 * @param {String} params.title - título del ticket
 * @param {String} params.description - descripción del ticket
 * @param {String|Number} [params.category_id] - id de la categoría del ticket
 * @param {String} params.priority - prioridad del ticket
 * @param {Object} user - usuario que crea el ticket (autor y empresa activa)
 * @returns {Promise<Object>} ticket creado y normalizado
 */
async function createTicket({ title, description, category_id, priority }, user) {
  const now = firestore.nowSql();
  const companyId = user.activeCompanyId != null ? toId(user.activeCompanyId) : null;
  const company = companyId != null ? await getCompanyById(companyId) : null;
  const code = await generateUniqueCode(company?.code_prefix);
  const category = category_id ? await getDoc('categories', category_id) : null;
  const payload = {
    code,
    title,
    description,
    category_id: category_id != null ? toId(category_id) : null,
    category_name: category?.name || null,
    area: category?.area || null,
    company_id: companyId,
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

/**
 * Codifica un cursor de paginación en base64 a partir de created_at e id de una fila,
 * para usarlo como punto de continuación en consultas paginadas.
 * @param {Object} row - fila con campos created_at e id
 * @returns {String|null} cursor codificado en base64, o null si no hay fila
 */
function encodeCreatedAtCursor(row) {
  if (!row) return null;
  return Buffer.from(JSON.stringify([row.created_at, String(row.id)])).toString('base64');
}
/**
 * Decodifica un cursor de paginación generado por encodeCreatedAtCursor, devolviendo
 * el par [created_at, id] o null si el cursor es inválido o está vacío.
 * @param {String} cursor - cursor codificado en base64
 * @returns {Array|null} par [createdAt, id] o null si no se pudo decodificar
 */
function decodeCreatedAtCursor(cursor) {
  if (!cursor) return null;
  try {
    const [createdAt, id] = JSON.parse(Buffer.from(String(cursor), 'base64').toString('utf8'));
    if (!createdAt || !id) return null;
    return [createdAt, String(id)];
  } catch {
    return null;
  }
}

/**
 * Cuenta el total de tickets visibles para un usuario según su rol (supervisor_campo
 * solo ve los propios, admin_area ve creados + asignados sin duplicar, el resto ve
 * todos), aplicando además el acotamiento por empresa si corresponde.
 * @param {Object} user - usuario para el cual se cuenta (id, role, activeCompanyId)
 * @param {Array<Array>} clauses - filtros adicionales a aplicar
 * @param {Boolean} companyScoped - si se debe acotar por empresa activa
 * @returns {Promise<Number>} cantidad total de tickets visibles
 */
async function countTicketsTotal(user, clauses, companyScoped) {
  const companyFilterSets = companyScoped
    ? [[['company_id', '==', toId(user.activeCompanyId)]], [['company_id', '==', IS_NULL]]]
    : [[]];
  async function countWithClauses(extra) {
    let total = 0;
    for (const companyFilter of companyFilterSets) {
      total += await countCollection('tickets', [...clauses, ...extra, ...companyFilter]);
    }
    return total;
  }
  if (user.role === 'supervisor_campo') {
    return countWithClauses([['created_by', '==', toId(user.id)]]);
  }
  if (user.role === 'admin_area') {
    const created = await countWithClauses([['created_by', '==', toId(user.id)]]);
    const assigned = await countWithClauses([['assigned_to', '==', toId(user.id)]]);
    const both = await countWithClauses([['created_by', '==', toId(user.id)], ['assigned_to', '==', toId(user.id)]]);
    return created + assigned - both;
  }
  return countWithClauses([]);
}

/**
 * Lista tickets de la colección 'tickets' con paginación por cursor, aplicando
 * filtros de estado/prioridad/categoría/asignado/área/fechas/búsqueda de texto,
 * visibilidad según el rol del usuario (supervisor_campo, admin_area, jefe_inmediato
 * ven subconjuntos distintos) y acotamiento por empresa activa. Decora cada ticket
 * con sus datos relacionados antes de devolverlo.
 * @param {Object} filters - filtros de búsqueda (status, priority, category_id, assigned_to, area, date_from, date_to, search)
 * @param {Object} user - usuario que realiza la consulta
 * @param {Object} [options] - opciones de paginación
 * @param {String} [options.cursor] - cursor de paginación
 * @param {Number} [options.limit] - cantidad de resultados por página
 * @returns {Promise<Object>} objeto { total, limit, hasMore, nextCursor, tickets }
 */
async function listTickets(filters, user, { cursor = null, limit = 25 } = {}) {
  const clauses = [];
  if (filters.status) clauses.push(['status', '==', filters.status]);
  if (filters.priority) clauses.push(['priority', '==', filters.priority]);
  if (filters.category_id) clauses.push(['category_id', '==', toId(filters.category_id)]);
  if (filters.assigned_to) clauses.push(['assigned_to', '==', toId(filters.assigned_to)]);
  if (filters.area && user.role !== 'jefe_inmediato') clauses.push(['area', '==', filters.area]);
  if (filters.date_from) clauses.push(['created_at', '>=', filters.date_from]);
  if (filters.date_to) clauses.push(['created_at', '<=', endOfDayInclusive(filters.date_to)]);
  if (user.role === 'jefe_inmediato' && !filters.status) {
    clauses.unshift(['status', '==', 'solucionado']);
  }
  const search = filters.search ? String(filters.search).toLowerCase() : null;
  const companyScoped = user.role !== 'sac' && user.activeCompanyId != null;

  async function fetchWindow(windowCursor, windowSize) {
    const baseOptions = { orderBy: 'created_at', direction: 'desc', tieBreakByDocId: true, limit: windowSize };
    if (windowCursor) baseOptions.startAfter = windowCursor;
    if (user.role === 'supervisor_campo') {
      return queryCollection('tickets', [['created_by', '==', toId(user.id)], ...clauses], baseOptions);
    }
    if (user.role === 'admin_area') {
      const [createdRows, assignedRows] = await Promise.all([
        queryCollection('tickets', [['created_by', '==', toId(user.id)], ...clauses], baseOptions),
        queryCollection('tickets', [['assigned_to', '==', toId(user.id)], ...clauses], baseOptions),
      ]);
      const map = new Map();
      for (const ticket of [...createdRows, ...assignedRows]) map.set(String(ticket.id), ticket);
      return Array.from(map.values()).sort((a, b) => compareRowsForCursor(a, b, 'created_at', 'desc', true));
    }
    if (user.role === 'jefe_inmediato') {
      return queryCollection('tickets', [...clauses], baseOptions);
    }
    return queryCollection('tickets', clauses, baseOptions);
  }

  function applyInMemoryFilters(rows) {
    let out = companyScoped ? scopeByCompany(rows, user.activeCompanyId) : rows;
    if (user.role === 'jefe_inmediato') out = out.filter((t) => t.status === 'solucionado');
    if (search) {
      out = out.filter((ticket) => {
        const text = String(ticket.title).toLowerCase();
        return text.includes(search)
          || String(ticket.code || '').toLowerCase().includes(search)
          || String(ticket.description || '').toLowerCase().includes(search);
      });
    }
    return out;
  }

  const windowSize = search ? Math.max(limit * 4, 100) : Math.max(limit + 10, 30);
  const maxIterations = search ? 15 : 8;

  let cursorState = decodeCreatedAtCursor(cursor);
  const collected = [];
  let exhausted = false;
  let iterations = 0;

  while (!exhausted && iterations < maxIterations) {
    if (collected.length >= limit) break;
    iterations++;
    const batch = await fetchWindow(cursorState, windowSize);
    if (batch.length === 0) { exhausted = true; break; }
    const last = batch[batch.length - 1];
    cursorState = [last.created_at, String(last.id)];
    collected.push(...applyInMemoryFilters(batch));
    if (batch.length < windowSize) exhausted = true;
  }

  const pageRows = collected.slice(0, limit);
  const hasMore = collected.length > limit || !exhausted;
  const nextCursor = pageRows.length > 0 ? encodeCreatedAtCursor(pageRows[pageRows.length - 1]) : null;

  const total = search ? null : await countTicketsTotal(user, clauses, companyScoped);

  const decorated = await Promise.all(pageRows.map(decorateTicket));
  return { total, limit, hasMore, nextCursor, tickets: decorated };
}

/**
 * Obtiene el detalle completo de un ticket: datos decorados, asignaciones,
 * comentarios, adjuntos e historial de auditoría relacionado, resolviendo los
 * nombres de los usuarios involucrados con cacheById.
 * @param {String|Number} id - id del ticket
 * @param {Object} user - usuario que realiza la consulta (no filtra, se pasa por consistencia)
 * @returns {Promise<Object|null>} ticket con { assignments, comments, attachments, history }, o null si no existe
 */
async function getTicketDetail(id, user) {
  const ticket = await getTicketById(id);
  if (!ticket) return null;
  const decorated = await decorateTicket(ticket);
  const [assignments, comments, attachments, historyEntries] = await Promise.all([
    queryCollection('ticket_assignments', [['ticket_id', '==', toId(id)]]),
    queryCollection('ticket_comments', [['ticket_id', '==', toId(id)]]),
    queryCollection('attachments', [['ticket_id', '==', toId(id)]]),
    queryCollection(
      'audit_log',
      [['target_type', '==', 'ticket'], ['target_id', '==', toId(id)]],
      { orderBy: 'created_at', direction: 'asc', limit: 200 }
    ),
  ]);
  const relatedAssignments = assignments;
  const relatedComments = comments;
  const relatedAttachments = attachments;
  const userIds = Array.from(new Set([
    ...relatedAssignments.map((a) => a.from_user_id),
    ...relatedAssignments.map((a) => a.to_user_id),
    ...relatedAssignments.map((a) => a.assigned_by),
    ...relatedComments.map((c) => c.user_id),
    ...relatedAttachments.map((a) => a.user_id),
    ...historyEntries.map((a) => a.user_id),
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
  const historyRows = historyEntries.map((row) => normalizeAudit({
    ...row,
    user_name: users[String(row.user_id)]?.full_name || null,
  }));
  return {
    ...decorated,
    assignments: assignmentRows,
    comments: commentRows,
    attachments: attachmentRows,
    history: historyRows,
  };
}

/**
 * Genera un código único de ticket con el prefijo de la empresa (o 'TKT' por defecto)
 * seguido de una secuencia autoincremental con padding a 6 dígitos.
 * @param {String} [codePrefix] - prefijo de código configurado en la empresa
 * @returns {Promise<String>} código único generado, por ejemplo 'TKT-000123'
 */
async function generateUniqueCode(codePrefix) {
  const base = `${codePrefix || 'TKT'}-`;
  const seq = await firestore.getNextId(`ticket_code:${base}`);
  return `${base}${String(seq).padStart(6, '0')}`;
}

/**
 * Actualiza campos editables de un ticket en la colección 'tickets' (título,
 * descripción, prioridad, categoría), validando que la categoría exista si se cambia.
 * @param {String|Number} id - id del ticket a actualizar
 * @param {Object} patch - campos a actualizar (title, description, priority, category_id)
 * @param {Object} user - usuario que realiza la actualización
 * @returns {Promise<Object>} ticket actualizado y decorado
 * @throws {Error} con código NOT_FOUND si el ticket no existe, o VALIDATION_ERROR si la categoría no existe
 */
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

/**
 * Agrega un comentario a un ticket en la colección 'ticket_comments'.
 * @param {String|Number} ticketId - id del ticket
 * @param {String} comment - texto del comentario
 * @param {Object} user - usuario autor del comentario
 * @returns {Promise<Object>} comentario creado y normalizado
 * @throws {Error} con código NOT_FOUND si el ticket no existe
 */
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

/**
 * Registra un archivo adjunto de un ticket en la colección 'attachments'.
 * @param {Object} params - datos del adjunto
 * @param {String|Number} params.ticket_id - id del ticket al que pertenece
 * @param {String|Number} params.user_id - id del usuario que lo subió
 * @param {String} params.filename - nombre del archivo almacenado en el servidor
 * @param {String} params.original_name - nombre original del archivo subido
 * @param {String} params.mime_type - tipo MIME del archivo
 * @param {Number} params.size - tamaño del archivo en bytes
 * @returns {Promise<Object>} adjunto creado y normalizado
 */
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

/**
 * Obtiene un adjunto de la colección 'attachments' por id, ya normalizado.
 * @param {String|Number} id - id del adjunto
 * @returns {Promise<Object|null>} adjunto normalizado, o null si no existe
 */
async function getAttachment(id) {
  const row = await getDoc('attachments', id);
  return normalizeAttachment(row);
}

/**
 * Obtiene un adjunto solo si efectivamente pertenece al ticket indicado (protege
 * contra acceder a adjuntos de otros tickets adivinando el id).
 * @param {String|Number} ticketId - id del ticket esperado
 * @param {String|Number} attachmentId - id del adjunto a buscar
 * @returns {Promise<Object|null>} adjunto normalizado si pertenece al ticket, o null
 */
async function getAttachmentForTicket(ticketId, attachmentId) {
  const attachment = await getAttachment(attachmentId);
  if (!attachment || toId(attachment.ticket_id) !== toId(ticketId)) return null;
  return attachment;
}

/**
 * Obtiene un adjunto por id enriquecido con el nombre y rol del usuario que lo subió.
 * @param {String|Number} attachmentId - id del adjunto
 * @returns {Promise<Object|null>} adjunto normalizado con user_name/user_role, o null si no existe
 */
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

/**
 * Obtiene una categoría por id, o null si no se pasó id.
 * @param {String|Number} id - id de la categoría
 * @returns {Promise<Object|null>} categoría normalizada, o null si no hay id o no existe
 */
async function getCategoryActiveOrNull(id) {
  if (!id) return null;
  return getCategoryById(id);
}

/**
 * Lista las asignaciones (documentos crudos) de un ticket en 'ticket_assignments'.
 * @param {String|Number} ticketId - id del ticket
 * @returns {Promise<Array<Object>>} documentos de asignación sin normalizar
 */
async function listTicketAssignments(ticketId) {
  return queryCollection('ticket_assignments', [['ticket_id', '==', toId(ticketId)]]);
}

/**
 * Lista los comentarios (documentos crudos) de un ticket en 'ticket_comments'.
 * @param {String|Number} ticketId - id del ticket
 * @returns {Promise<Array<Object>>} documentos de comentario sin normalizar
 */
async function listTicketComments(ticketId) {
  return queryCollection('ticket_comments', [['ticket_id', '==', toId(ticketId)]]);
}

/**
 * Lista los adjuntos (documentos crudos) de un ticket en 'attachments'.
 * @param {String|Number} ticketId - id del ticket
 * @returns {Promise<Array<Object>>} documentos de adjunto sin normalizar
 */
async function listTicketAttachments(ticketId) {
  return queryCollection('attachments', [['ticket_id', '==', toId(ticketId)]]);
}

/**
 * Asigna un ticket a un usuario destino (admin_area o jefe_inmediato), validando
 * que exista, esté activo y tenga un rol permitido. Registra la asignación en
 * 'ticket_assignments' y actualiza el ticket (assigned_to, area, status) dentro
 * de una transacción de Firestore para mantener consistencia.
 * @param {String|Number} id - id del ticket a asignar
 * @param {String|Number} to_user_id - id del usuario destino
 * @param {Object} user - usuario que realiza la asignación
 * @param {String} [notes] - notas opcionales de la asignación
 * @returns {Promise<Object>} detalle completo del ticket actualizado (ver getTicketDetail)
 * @throws {Error} con código NOT_FOUND o VALIDATION_ERROR según el problema encontrado
 */
async function assignTicket(id, to_user_id, user, notes) {
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

  const db = firestore.getFirestore();
  const ticketRef = db.collection('tickets').doc(String(id));
  const assignmentId = String(await firestore.getNextId('ticket_assignments'));
  const assignmentRef = db.collection('ticket_assignments').doc(assignmentId);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ticketRef);
    if (!snap.exists) {
      const err = new Error('Ticket no encontrado.');
      err.code = 'NOT_FOUND';
      throw err;
    }
    const ticket = snap.data();
    const fromUserId = ticket.assigned_to || null;
    const newStatus = ticket.status === 'recibido' || ticket.status === 'reabierto' ? 'asignado' : ticket.status;
    const now = firestore.nowSql();
    tx.set(assignmentRef, {
      ticket_id: toId(id),
      from_user_id: fromUserId,
      to_user_id: toId(to_user_id),
      assigned_by: toId(user.id),
      notes: notes || null,
      assigned_at: now,
    });
    tx.update(ticketRef, {
      assigned_to: toId(to_user_id),
      area: target.area || null,
      status: newStatus,
      updated_at: now,
      closed_at: null,
    });
  });
  return getTicketDetail(id, user);
}

/**
 * Cambia el estado de un ticket validando la máquina de estados permitida
 * (recibido→asignado/cerrado, asignado→en_proceso/asignado, etc.), actualiza
 * closed_at según corresponda y opcionalmente agrega un comentario, todo dentro
 * de una transacción de Firestore.
 * @param {String|Number} id - id del ticket
 * @param {String} next - nuevo estado solicitado
 * @param {String} [comment] - comentario opcional asociado al cambio de estado
 * @param {Object} user - usuario que realiza el cambio
 * @returns {Promise<Object>} detalle completo del ticket actualizado (ver getTicketDetail)
 * @throws {Error} con código NOT_FOUND si el ticket no existe, o CONFLICT si la transición no está permitida
 */
async function changeTicketStatus(id, next, comment, user) {
  const transitions = {
    recibido: ['asignado', 'cerrado'],
    asignado: ['en_proceso', 'asignado'],
    en_proceso: ['solucionado', 'asignado'],
    solucionado: ['cerrado', 'reabierto', 'en_proceso'],
    cerrado: ['reabierto'],
    reabierto: ['en_proceso', 'asignado'],
  };

  const db = firestore.getFirestore();
  const ticketRef = db.collection('tickets').doc(String(id));
  const commentId = comment ? String(await firestore.getNextId('ticket_comments')) : null;
  const commentRef = commentId ? db.collection('ticket_comments').doc(commentId) : null;

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ticketRef);
    if (!snap.exists) {
      const err = new Error('Ticket no encontrado.');
      err.code = 'NOT_FOUND';
      throw err;
    }
    const ticket = snap.data();
    if (!(transitions[ticket.status] || []).includes(next)) {
      const err = new Error(`Transición no permitida: ${ticket.status} → ${next}.`);
      err.code = 'CONFLICT';
      throw err;
    }
    const now = firestore.nowSql();
    const updatePayload = { status: next, updated_at: now };
    if (next === 'cerrado') updatePayload.closed_at = now;
    if (next !== 'cerrado') updatePayload.closed_at = null;
    tx.update(ticketRef, updatePayload);
    if (commentRef) {
      tx.set(commentRef, {
        ticket_id: toId(id),
        user_id: toId(user.id),
        comment,
        attachment_id: null,
        created_at: now,
      });
    }
  });
  return getTicketDetail(id, user);
}

/**
 * Calcula estadísticas globales de tickets (totales por estado, prioridad, área,
 * serie de últimos 30 días, tiempo promedio de resolución y top categorías),
 * opcionalmente acotadas a una empresa.
 * @param {String|Number} [companyId] - id de la empresa a la que acotar las estadísticas
 * @returns {Promise<Object>} objeto con totals, avg_resolution_hours, by_status, by_priority, by_area, last_30_days, top_categories
 */
async function getStats(companyId = null) {
  const statusValues = ['recibido', 'asignado', 'en_proceso', 'solucionado', 'cerrado', 'reabierto'];
  const priorityValues = ['baja', 'media', 'alta'];
  const areaValues = ['operaciones', 'logistica', 'mantenimiento', 'sistemas', 'otro'];
  const companyClause = companyId != null ? [['company_id', '==', toId(companyId)]] : [];

  const now = new Date();
  const dates = [];
  for (let i = 29; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }

  const [total, open, closed, resolved, reopened, byStatus, byPriority, byArea, last30Days, categories, closedSample] = await Promise.all([
    countCollection('tickets', companyClause),
    countCollection('tickets', [...companyClause, ['status', '!=', 'cerrado']]),
    countCollection('tickets', [...companyClause, ['status', '==', 'cerrado']]),
    countCollection('tickets', [...companyClause, ['status', '==', 'solucionado']]),
    countCollection('tickets', [...companyClause, ['status', '==', 'reabierto']]),
    countGroupByValues('tickets', companyClause, 'status', statusValues),
    countGroupByValues('tickets', companyClause, 'priority', priorityValues),
    countGroupByValues('tickets', companyClause, 'area', areaValues),
    countByDay('tickets', 'created_at', dates, companyClause),
    queryCollection('categories', companyClause, { select: ['id', 'name'] }),
    queryCollection('tickets', [...companyClause, ['status', '==', 'cerrado']], { orderBy: 'created_at', direction: 'desc', limit: 5000, select: ['created_at', 'closed_at'] }),
  ]);

  const totals = { total, open, closed, resolved, reopened };
  const avgHours = closedSample.length
    ? closedSample.reduce((acc, t) => {
      const created = new Date(String(t.created_at).replace(' ', 'T'));
      const closedAt = new Date(String(t.closed_at).replace(' ', 'T'));
      return acc + ((closedAt - created) / 36e5);
    }, 0) / closedSample.length
    : 0;

  const categoryCounts = await Promise.all(categories.map(async (cat) => ({
    id: toId(cat.id),
    name: cat.name,
    c: await countCollection('tickets', [...companyClause, ['category_id', '==', toId(cat.id)]]),
  })));
  const topCategories = categoryCounts.filter((item) => item.id != null).sort((a, b) => b.c - a.c).slice(0, 5);

  return {
    totals,
    avg_resolution_hours: avgHours,
    by_status: byStatus,
    by_priority: byPriority,
    by_area: byArea,
    last_30_days: last30Days,
    top_categories: topCategories,
  };
}

/**
 * Calcula, a partir de una lista de tickets ya cargados en memoria, el desglose
 * por estado, cantidad urgente y cantidad cerrada hoy.
 * @param {Array<Object>} tickets - tickets sobre los que calcular los totales
 * @returns {Object} objeto con recibido, asignado, en_proceso, solucionado, reabierto, urgent, closed_today
 */
function completeTotals(tickets) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return {
    recibido: tickets.filter((t) => t.status === 'recibido').length,
    asignado: tickets.filter((t) => t.status === 'asignado').length,
    en_proceso: tickets.filter((t) => t.status === 'en_proceso').length,
    solucionado: tickets.filter((t) => t.status === 'solucionado').length,
    reabierto: tickets.filter((t) => t.status === 'reabierto').length,
    urgent: tickets.filter((t) => t.priority === 'urgente').length,
    closed_today: tickets.filter((t) => {
      if (!t.closed_at) return false;
      const c = new Date(String(t.closed_at).replace(' ', 'T'));
      return c >= today && c < tomorrow;
    }).length,
  };
}

/**
 * Calcula estadísticas de tickets personalizadas según el rol del usuario:
 * admin_area (creados+asignados, tiempo promedio de resolución, por prioridad),
 * supervisor_campo (totales de los propios) o jefe_inmediato (totales del área
 * y distribución por usuario asignado). Devuelve objeto vacío para otros roles.
 * @param {String|Number} userId - id del usuario sobre el que se calculan las estadísticas
 * @param {Object} user - usuario que consulta (role, area, activeCompanyId)
 * @returns {Promise<Object>} estadísticas específicas del rol del usuario
 */
async function getStatsForUser(userId, user) {
  const uid = toId(userId);
  const companyScoped = user.role !== 'sac' && user.activeCompanyId != null;
  if (user.role === 'admin_area') {
    const [created, assigned] = await Promise.all([
      queryCollection('tickets', [['created_by', '==', uid]], { orderBy: 'created_at', direction: 'desc', limit: 1000, select: ['status', 'priority', 'created_at', 'closed_at', 'company_id'] }),
      queryCollection('tickets', [['assigned_to', '==', uid]], { orderBy: 'created_at', direction: 'desc', limit: 1000, select: ['status', 'priority', 'created_at', 'closed_at', 'company_id'] }),
    ]);
    const map = new Map();
    for (const ticket of [...created, ...assigned]) {
      map.set(String(ticket.id), ticket);
    }
    const merged = companyScoped
      ? scopeByCompany(Array.from(map.values()), user.activeCompanyId)
      : Array.from(map.values());
    const totals = {
      total: merged.length,
      cerrado: merged.filter((t) => t.status === 'cerrado').length,
      ...completeTotals(merged),
    };
    const closed = merged.filter((t) => t.closed_at);
    const avgHours = closed.length
      ? closed.reduce((acc, t) => {
        const created = new Date(String(t.created_at).replace(' ', 'T'));
        const closed = new Date(String(t.closed_at).replace(' ', 'T'));
        return acc + ((closed - created) / 36e5);
      }, 0) / closed.length
      : 0;
    const byPriority = Object.entries(merged.reduce((acc, ticket) => { acc[ticket.priority] = (acc[ticket.priority] || 0) + 1; return acc; }, {})).map(([priority, c]) => ({ priority, c }));
    return { totals, avg_resolution_hours: avgHours, by_priority: byPriority };
  }
  if (user.role === 'supervisor_campo') {
    const raw = await queryCollection('tickets', [['created_by', '==', uid]], { orderBy: 'created_at', direction: 'desc', limit: 1000, select: ['status', 'priority', 'closed_at', 'company_id'] });
    const tickets = companyScoped ? scopeByCompany(raw, user.activeCompanyId) : raw;
    const totals = {
      total: tickets.length,
      open: tickets.filter((t) => t.status !== 'cerrado').length,
      closed: tickets.filter((t) => t.status === 'cerrado').length,
      ...completeTotals(tickets),
    };
    return { totals };
  }
  if (user.role === 'jefe_inmediato') {
    const raw = await queryCollection('tickets', [['area', '==', user.area]], { orderBy: 'created_at', direction: 'desc', limit: 1000, select: ['status', 'priority', 'closed_at', 'assigned_to', 'company_id'] });
    const tickets = companyScoped ? scopeByCompany(raw, user.activeCompanyId) : raw;
    const totals = {
      total: tickets.length,
      open: tickets.filter((t) => t.status !== 'cerrado').length,
      closed: tickets.filter((t) => t.status === 'cerrado').length,
      solved: tickets.filter((t) => t.status === 'solucionado').length,
      reopened: tickets.filter((t) => t.status === 'reabierto').length,
      ...completeTotals(tickets),
    };
    const byAssignee = Object.entries(tickets.reduce((acc, ticket) => {
      const assignee = String(ticket.assigned_to || '');
      if (assignee) acc[assignee] = (acc[assignee] || 0) + 1;
      return acc;
    }, {})).map(([uidStr, c]) => ({ id: toId(uidStr), c })).sort((a, b) => b.c - a.c);
    const userMap = (await cacheById('users', byAssignee.map((item) => item.id).filter(Boolean).map(String))) || {};
    return {
      totals,
      by_assignee: byAssignee.map((item) => ({
        ...item,
        full_name: userMap[String(item.id)]?.full_name || null,
        avatar_url: userMap[String(item.id)]?.avatar_url || null,
      })),
    };
  }
  return {};
}

/**
 * Normaliza un documento crudo de la colección 'companies' al shape legacy de la aplicación.
 * @param {Object} row - documento crudo de Firestore de la colección 'companies'
 * @returns {Object|null} empresa normalizada, o null si no se recibió documento
 */
function normalizeCompany(row) {
  if (!row) return null;
  return {
    id: toId(row.id),
    name: row.name || '',
    slug: row.slug || '',
    logo_url: row.logo_url || null,
    location: row.location || null,
    responsible_user_id: row.responsible_user_id != null ? toId(row.responsible_user_id) : null,
    color: row.color || null,
    code_prefix: row.code_prefix || null,
    active: row.active ? 1 : 0,
    is_default: row.is_default ? 1 : 0,
    created_at: toLegacyDate(row.created_at),
    updated_at: toLegacyDate(row.updated_at),
  };
}

/**
 * Lista empresas de la colección 'companies'. Si el requester no es platform admin,
 * solo devuelve las empresas donde tiene una membresía activa en
 * 'user_company_memberships'; si es platform admin, devuelve todas (opcionalmente solo activas).
 * @param {Object} [options] - opciones de la consulta
 * @param {Boolean} [options.activeOnly] - si es true, filtra solo empresas activas
 * @param {Object} [options.requester] - usuario que realiza la consulta
 * @returns {Promise<Array<Object>>} empresas normalizadas visibles para el requester
 */
async function listCompanies({ activeOnly = true, requester } = {}) {
  if (requester && !requester.isPlatformAdmin) {
    const mems = await queryCollection('user_company_memberships', []);
    const companyIds = mems.filter((m) => String(m.user_id) === String(requester.id) && (m.active === 1 || m.active === true || m.active === '1' || m.active === 'true')).map((m) => String(m.company_id)).filter(Boolean);
    const companies = [];
    for (const cid of companyIds) {
      const doc = await getDoc('companies', cid);
      if (doc) companies.push(doc);
    }
    let rows = companies.map(normalizeCompany);
    if (activeOnly) rows = rows.filter((c) => c.active);
    return rows;
  }
  const clauses = [];
  if (activeOnly) clauses.push(['active', '==', 1]);
  const rows = await queryCollection('companies', clauses);
  return rows.map(normalizeCompany);
}

/**
 * Obtiene una empresa por id de la colección 'companies'. Si se pasa un requester
 * que no es platform admin, valida que tenga una membresía activa en esa empresa
 * antes de devolverla.
 * @param {String|Number} id - id de la empresa
 * @param {Object} [options] - opciones de la consulta
 * @param {Object} [options.requester] - usuario que realiza la consulta, para validar acceso
 * @returns {Promise<Object|null>} empresa normalizada, o null si no existe o no tiene acceso
 */
async function getCompanyById(id, { requester } = {}) {
  const row = await getDoc('companies', id);
  if (!row) return null;
  if (requester && !requester.isPlatformAdmin) {
    const mems = await queryCollection('user_company_memberships', []);
    const hasAccess = mems.some((m) => String(m.user_id) === String(requester.id) && (m.active === 1 || m.active === true || m.active === '1' || m.active === 'true') && String(m.company_id) === String(id));
    if (!hasAccess) return null;
  }
  return normalizeCompany(row);
}

/**
 * Crea una empresa nueva en la colección 'companies' dentro de una transacción,
 * generando un slug único a partir del nombre (o del slug dado) y validando que
 * el code_prefix, si se especifica, no esté ya en uso por otra empresa.
 * @param {Object} [params] - datos de la empresa a crear
 * @param {String} params.name - nombre de la empresa
 * @param {String} [params.slug] - slug deseado (se ajusta si está en uso)
 * @param {String} [params.logo_url] - URL del logo
 * @param {String} [params.location] - ubicación de la empresa
 * @param {String|Number} [params.responsible_user_id] - id del usuario responsable
 * @param {String} [params.color] - color identificador de la empresa
 * @param {String} [params.code_prefix] - prefijo usado para generar códigos de ticket
 * @param {Boolean} [params.is_default] - si es la empresa por defecto
 * @returns {Promise<Object>} empresa creada y normalizada
 * @throws {Error} con código CONFLICT si no se pudo generar un slug único o el code_prefix ya está en uso
 */
async function createCompany(
  { name, slug, logo_url, location, responsible_user_id, color, code_prefix, is_default } = {}
) {
  const seedSlug = slug || (name || '').toLowerCase().replace(/[^a-z0-9-_]+/g, '-');
  const seed = seedSlug && seedSlug.length > 0 ? seedSlug : `empresa-${Date.now()}`;
  const db = firestore.getFirestore();
  const companiesRef = db.collection('companies');
  const now = firestore.nowSql();
  const newId = String(await firestore.getNextId('companies'));
  const docRef = companiesRef.doc(newId);

  const doc = await db.runTransaction(async (tx) => {
    let finalSlug = null;
    for (let i = 0; i < 100; i += 1) {
      const candidate = i === 0 ? seed : `${seed}-${i + 1}`;
      const snap = await tx.get(companiesRef.where('slug', '==', candidate).limit(1));
      if (snap.empty) { finalSlug = candidate; break; }
    }
    if (!finalSlug) {
      const err = new Error('No se pudo generar un slug único.');
      err.code = 'CONFLICT';
      throw err;
    }
    if (code_prefix) {
      const prefixSnap = await tx.get(companiesRef.where('code_prefix', '==', code_prefix).limit(1));
      if (!prefixSnap.empty) {
        const err = new Error(`El prefijo "${code_prefix}" ya lo usa otra empresa.`);
        err.code = 'CONFLICT';
        throw err;
      }
    }
    const payload = {
      name: normalizeString(name),
      slug: finalSlug,
      logo_url: logo_url || null,
      location: location || null,
      responsible_user_id: responsible_user_id != null ? toId(responsible_user_id) : null,
      color: color || null,
      code_prefix: code_prefix || null,
      active: 1,
      is_default: is_default ? 1 : 0,
      created_at: now,
      updated_at: now,
    };
    tx.set(docRef, payload);
    return { id: newId, ...payload };
  });
  return normalizeCompany(doc);
}

/**
 * Actualiza campos de una empresa en la colección 'companies' dentro de una
 * transacción, validando que el nuevo slug o code_prefix (si se modifican) no
 * estén en uso por otra empresa.
 * @param {String|Number} id - id de la empresa a actualizar
 * @param {Object} patch - campos a actualizar (name, slug, logo_url, location, responsible_user_id, color, code_prefix, active, is_default)
 * @returns {Promise<Object>} empresa actualizada y normalizada
 * @throws {Error} con código NOT_FOUND si la empresa no existe, o CONFLICT si slug/code_prefix ya están en uso
 */
async function updateCompany(id, patch) {
  const updatePayload = {};
  if (patch.name !== undefined) updatePayload.name = normalizeString(patch.name);
  if (patch.slug !== undefined) updatePayload.slug = normalizeString(patch.slug);
  if (patch.logo_url !== undefined) updatePayload.logo_url = patch.logo_url || null;
  if (patch.location !== undefined) updatePayload.location = patch.location || null;
  if (patch.responsible_user_id !== undefined) updatePayload.responsible_user_id = patch.responsible_user_id == null ? null : toId(patch.responsible_user_id);
  if (patch.color !== undefined) updatePayload.color = patch.color || null;
  if (patch.code_prefix !== undefined) updatePayload.code_prefix = patch.code_prefix || null;
  if (patch.active !== undefined) updatePayload.active = patch.active ? 1 : 0;
  if (patch.is_default !== undefined) updatePayload.is_default = patch.is_default ? 1 : 0;
  updatePayload.updated_at = firestore.nowSql();

  const db = firestore.getFirestore();
  const companiesRef = db.collection('companies');
  const docRef = companiesRef.doc(String(id));

  const updated = await db.runTransaction(async (tx) => {
    const snap = await tx.get(docRef);
    if (!snap.exists) {
      const err = new Error('Empresa no encontrada.');
      err.code = 'NOT_FOUND';
      throw err;
    }
    if (updatePayload.slug) {
      const otherSnap = await tx.get(companiesRef.where('slug', '==', updatePayload.slug).limit(1));
      const other = otherSnap.docs[0];
      if (other && other.id !== String(id)) {
        const err = new Error('Slug ya en uso por otra empresa.');
        err.code = 'CONFLICT';
        throw err;
      }
    }
    if (updatePayload.code_prefix) {
      const otherSnap = await tx.get(companiesRef.where('code_prefix', '==', updatePayload.code_prefix).limit(1));
      const other = otherSnap.docs[0];
      if (other && other.id !== String(id)) {
        const err = new Error(`El prefijo "${updatePayload.code_prefix}" ya lo usa otra empresa.`);
        err.code = 'CONFLICT';
        throw err;
      }
    }
    tx.update(docRef, updatePayload);
    return { id: snap.id, ...snap.data(), ...updatePayload };
  });
  return normalizeCompany(updated);
}

/**
 * Desactiva una empresa (borrado lógico) en la colección 'companies', impidiendo
 * la operación si es la última empresa activa del sistema.
 * @param {String|Number} id - id de la empresa a desactivar
 * @returns {Promise<Object>} empresa normalizada con active en 0
 * @throws {Error} con código NOT_FOUND si no existe, o CONFLICT si es la última empresa activa
 */
async function softDeleteCompany(id) {
  const existing = await getDoc('companies', id);
  if (!existing) {
    const err = new Error('Empresa no encontrada.');
    err.code = 'NOT_FOUND';
    throw err;
  }
  if (!existing.active) return normalizeCompany(existing);
  const activeCount = await countCollection('companies', [['active', '==', 1]]);
  if (activeCount <= 1) {
    const err = new Error('No se puede desactivar la última empresa activa del sistema.');
    err.code = 'CONFLICT';
    throw err;
  }
  const updated = await updateDoc('companies', id, { active: 0, updated_at: firestore.nowSql() });
  return normalizeCompany(updated);
}

module.exports = {
  toId,
  queryCollection,
  countCollection,
  countGroupByValues,
  countByDay,
  findOneByFields,
  getDoc,
  createDoc,
  updateDoc,
  cacheById,
  getUserByIdentifier,
  listUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  listCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
  createNotification,
  getUnreadCount,
  listNotificationsForUser,
  markNotificationsRead,
  logAudit,
  listAudit,
  getActionTypes,
  getActiveAuditUsers,
  getTicketById,
  getTicketWithArea,
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
  scopeByCompany,
  scopeUsersByCompany,
  listCompanies,
  getCompanyById,
  createCompany,
  updateCompany,
  softDeleteCompany,
};

