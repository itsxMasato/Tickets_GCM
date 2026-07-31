/* Documentado por: Miguel Flores */
"use strict"

const firestoreData = require('../firestoreData');
const { ROLE_VALUES } = require('../orm/enums');
const {
  optionalEnum,
  validationError,
  notFoundError,
  conflictError,
  forbiddenError,
} = require('../utils/validators');
const auditService = require('./audit.service');

/**
 * Emite por socket.io un evento relacionado a una membresía, dirigido al rol SAC y a las salas de la empresa y el usuario afectados. Silencia errores de socket.
 * @param {String} event - nombre del evento a emitir
 * @param {Object} membership - membresía involucrada
 * @param {String|Number} companyId - id de la empresa, usado para armar la sala del socket
 * @param {String|Number} userId - id del usuario, usado para armar la sala del socket
 * @returns {void}
 */
function emitMembership(event, membership, companyId, userId) {
  try {
    const { emit } = require('../sockets');
    emit(event, { membership }, {
      role: 'sac',
      extraRooms: [
        ...(companyId ? [`company:${companyId}`] : []),
        ...(userId ? [`user:${userId}`] : []),
      ],
    });
  } catch (e) {}
}

/**
 * Convierte un registro de membresía de Firestore al formato plano expuesto por la API.
 * @param {Object} row - registro crudo de membresía
 * @returns {Object|null} membresía serializada, o null si no se recibió registro
 */
function serialize(row) {
  if (!row) return null;
  return {
    id: row.id,
    user_id: row.user_id,
    company_id: row.company_id,
    role: row.role,
    is_default: !!row.is_default,
    active: !!row.active,
    created_at: row.created_at,
    last_seen_at: row.last_seen_at || null,
  };
}

/**
 * Carga una empresa por id, lanzando error si no existe.
 * @param {String|Number} companyId - id de la empresa
 * @returns {Promise<Object>} empresa encontrada
 */
async function loadCompanyOrThrow(companyId) {
  const c = await firestoreData.getCompanyById(Number(companyId), { requester: null });
  if (!c) throw notFoundError('Empresa no encontrada.');
  return c;
}

/**
 * Carga un usuario por id, lanzando error si no existe.
 * @param {String|Number} userId - id del usuario
 * @returns {Promise<Object>} usuario encontrado
 */
async function loadUserOrThrow(userId) {
  const u = await firestoreData.getUserById(Number(userId));
  if (!u) throw notFoundError('Usuario no encontrado.');
  return u;
}

/**
 * Interpreta un valor crudo de flag "activo" almacenado en Firestore, aceptando variantes numéricas, booleanas y de texto.
 * @param {*} value - valor crudo del flag
 * @returns {Boolean} true si el valor representa "activo"
 */
function isActiveFlag(value) {
  return value === 1 || value === true || value === '1' || value === 'true';
}

/**
 * Normaliza un id a String para poder compararlo de forma consistente sin importar su tipo original.
 * @param {*} value - id a normalizar
 * @returns {String|null} id normalizado como string, o null si el valor era nulo
 */
function normalizeMembershipId(value) {
  return value == null ? null : String(value);
}

/**
 * Obtiene las membresías de un usuario probando varias estrategias de consulta en Firestore (con filtros progresivamente más laxos) para tolerar índices o datos inconsistentes, y filtra el resultado final por el usuario y el flag de activo solicitado.
 * @param {String|Number} userId - id del usuario
 * @param {Object} [options] - opciones de consulta
 * @param {Boolean} [options.activeOnly=false] - si true, devuelve solo membresías activas
 * @returns {Promise<Array>} membresías crudas del usuario
 */
async function getMembershipRowsForUser(userId, { activeOnly = false } = {}) {
  const normalizedUserId = normalizeMembershipId(userId);
  const rows = [];

  for (const clauses of [[], [['user_id', '==', userId]], [['user_id', '==', userId], ['active', '==', 1]]]) {
    try {
      const candidateRows = await firestoreData.queryCollection('user_company_memberships', clauses, { limit: 1000 });
      if (Array.isArray(candidateRows) && candidateRows.length) {
        rows.push(...candidateRows);
        break;
      }
    } catch (_) {}
  }

  if (!rows.length) {
    try {
      const fallbackRows = await firestoreData.queryCollection('user_company_memberships', [], { limit: 1000 });
      if (Array.isArray(fallbackRows)) rows.push(...fallbackRows);
    } catch (_) {}
  }

  if (!rows.length) {
    const fallbackRow = await firestoreData.findOneByFields('user_company_memberships', [['user_id', '==', userId]]);
    if (fallbackRow) rows.push(fallbackRow);
  }

  return rows.filter((row) => {
    if (normalizeMembershipId(row.user_id) !== normalizedUserId) return false;
    if (activeOnly && !isActiveFlag(row.active)) return false;
    return true;
  });
}

/**
 * Busca la membresía de un usuario en una empresa específica.
 * @param {String|Number} userId - id del usuario
 * @param {String|Number} companyId - id de la empresa
 * @param {Object} [options] - opciones de búsqueda
 * @param {Boolean} [options.activeOnly=false] - si true, solo considera membresías activas
 * @returns {Promise<Object|null>} membresía encontrada, o null si no existe
 */
async function findMembershipForUserAndCompany(userId, companyId, { activeOnly = false } = {}) {
  const normalizedCompanyId = normalizeMembershipId(companyId);
  const rows = await getMembershipRowsForUser(userId, { activeOnly });
  return rows.find((row) => normalizeMembershipId(row.company_id) === normalizedCompanyId) || null;
}

/**
 * Resuelve el id de la empresa por defecto de un usuario a partir de sus membresías activas, usando la primera activa como respaldo si ninguna está marcada como default.
 * @param {String|Number} userId - id del usuario
 * @returns {Promise<Number|null>} id de la empresa por defecto, o null si el usuario no tiene membresías activas
 */
async function resolveDefaultCompanyId(userId) {
  const rows = await getMembershipRowsForUser(userId, { activeOnly: true });
  if (!rows.length) return null;
  const defaultRow = rows.find((row) => isActiveFlag(row.is_default));
  return Number((defaultRow || rows[0]).company_id);
}

/**
 * Verifica si un usuario tiene una membresía activa en una empresa determinada.
 * @param {String|Number} userId - id del usuario
 * @param {String|Number} companyId - id de la empresa
 * @returns {Promise<Boolean>} true si el usuario es miembro activo de la empresa
 */
async function isActiveMemberOfCompany(userId, companyId) {
  const membership = await findMembershipForUserAndCompany(userId, companyId, { activeOnly: true });
  return !!membership;
}

/**
 * Lista todas las membresías (activas e inactivas) de un usuario junto con datos básicos de cada empresa, validando que el solicitante sea el propio usuario o un administrador de plataforma.
 * @param {String|Number} userId - id del usuario cuyas membresías se listan
 * @param {Object} [options] - opciones de la consulta
 * @param {Object} [options.requester] - usuario que realiza la consulta
 * @returns {Promise<Array>} membresías del usuario con datos de empresa embebidos
 */
async function listByUser(userId, { requester } = {}) {
  const targetUserId = Number(userId);
  if (!requester)
    throw forbiddenError('Debe iniciar sesión.');
  if (!requester.isPlatformAdmin && Number(requester.id) !== targetUserId) {
    throw forbiddenError('Solo puede ver sus propias membresías.');
  }
  await loadUserOrThrow(targetUserId);
  const rows = await getMembershipRowsForUser(targetUserId, { activeOnly: false });
  const memberships = rows.map((r) => serialize(r));
  const companyIds = Array.from(new Set(memberships.map((m) => String(m.company_id)).filter(Boolean)));
  const companiesMap = await firestoreData.cacheById('companies', companyIds);
  return memberships.map((m) => {
    const base = m;
    const c = companiesMap[String(m.company_id)];
    if (c) base.company = { id: c.id, name: c.name, slug: c.slug, color: c.color || null, logo_url: c.logo_url || null };
    return base;
  });
}

/**
 * Lista las membresías de una empresa junto con datos básicos de cada usuario, validando que el solicitante sea miembro de la empresa o administrador de plataforma.
 * @param {String|Number} companyId - id de la empresa
 * @param {Object} [options] - opciones de listado
 * @param {Boolean} [options.activeOnly=true] - si true, excluye membresías inactivas
 * @param {Object} [options.requester] - usuario que realiza la consulta
 * @returns {Promise<Array>} membresías de la empresa con datos de usuario embebidos
 */
async function listByCompany(companyId, { activeOnly = true, requester } = {}) {
  if (!requester) throw forbiddenError('Debe iniciar sesión.');
  const cid = Number(companyId);
  if (!requester.isPlatformAdmin) {
    const rows = await getMembershipRowsForUser(requester.id, { activeOnly: true });
    const hasAccess = rows.some((row) => normalizeMembershipId(row.company_id) === String(cid));
    if (!hasAccess) throw forbiddenError('No es miembro de esta empresa.');
  }
  await loadCompanyOrThrow(cid);
  const rows = await firestoreData.queryCollection('user_company_memberships', []);
  const filtered = rows.filter((m) => normalizeMembershipId(m.company_id) === String(cid) && (!activeOnly || isActiveFlag(m.active)));
  const userIds = Array.from(new Set(filtered.map((m) => String(m.user_id)).filter(Boolean)));
  const usersMap = await firestoreData.cacheById('users', userIds);
  return filtered.map((m) => {
    const base = serialize(m);
    const u = usersMap[String(m.user_id)];
    if (u) base.user = { id: u.id, username: u.username, full_name: u.full_name };
    return base;
  });
}

/**
 * Crea una nueva membresía de un usuario en una empresa con un rol determinado, evitando duplicados y gestionando el flag de membresía por defecto. Registra auditoría y notifica en tiempo real.
 * @param {String|Number} userId - id del usuario a vincular
 * @param {Object} input - datos de la membresía (company_id, role, is_default)
 * @param {Object} requester - usuario que realiza la operación (administrador de plataforma, o SAC si `options.allowSACCreate`)
 * @param {Object} [options] - opciones adicionales
 * @param {Boolean} [options.allowSACCreate] - permite que un usuario SAC cree la membresía
 * @returns {Promise<Object>} membresía creada serializada
 */
async function create(userId, input, requester, options = {}) {
  if (!requester || (!requester.isPlatformAdmin && !(options && options.allowSACCreate && requester.role === 'sac'))) {
    throw forbiddenError('Solo el administrador de plataforma puede asignar membresías.');
  }
  const targetUserId = Number(userId);
  const user = await loadUserOrThrow(targetUserId);
  const companyId = Number(input && input.company_id);
  if (!companyId) throw validationError('El campo "company_id" es obligatorio.');
  const company = await loadCompanyOrThrow(companyId);
  const role = optionalEnum(input && input.role, 'role', ROLE_VALUES);
  if (!role) throw validationError('El campo "role" es obligatorio.');
  const isDefault = !!(input && input.is_default);

  const dup = await findMembershipForUserAndCompany(user.id, company.id, { activeOnly: false });
  if (dup)
    { throw conflictError(`El usuario ya tiene una membresía en "${company.name}".`); }

  if (isDefault) {
    const others = await firestoreData.queryCollection('user_company_memberships', [['user_id', '==', user.id], ['is_default', '==', 1]]);
    for (const o of others) await firestoreData.updateDoc('user_company_memberships', o.id, { is_default: 0 });
  }

  const now = firestoreData.nowSql ? firestoreData.nowSql() : new Date().toISOString().replace('T', ' ').slice(0, 19);
  const payload = {
    user_id: user.id,
    company_id: company.id,
    role,
    active: 1,
    is_default: isDefault ? 1 : 0,
    created_at: now,
    last_seen_at: null,
  };
  const createdDoc = await firestoreData.createDoc('user_company_memberships', payload);
  const out = serialize(createdDoc);
  await auditService.logAsync({
    user_id: requester.id,
    company_id: company.id,
    action_type: 'membership:create',
    target_type: 'membership',
    target_id: out.id,
    target_code: `${user.username}@${company.slug}`,
    description: `Membresía creada: ${user.full_name} en ${company.name} (${role})`,
    new_value: out,
  });
  emitMembership('membership:create', out, company.id, user.id);
  return out;
}

/**
 * Valida que, tras desactivar o cambiar el rol de una membresía, la empresa no quede sin miembros activos ni sin ningún administrador de área activo.
 * @param {Object} before - membresía tal como está antes del cambio
 * @param {Object} [options] - cambios propuestos
 * @param {Boolean} [options.becomesInactive=false] - si la membresía pasará a estar inactiva
 * @param {String} [options.newRole] - nuevo rol propuesto, si cambia
 * @returns {Promise<void>}
 */
async function assertCompanyKeepsCoverage(before, { becomesInactive = false, newRole } = {}) {
  if (!before.active)
    return;
  const changesRole = newRole !== undefined && newRole !== before.role;
  if (!becomesInactive && !changesRole) return;

  if (becomesInactive) {
    const activeMembers = await firestoreData.countCollection('user_company_memberships', [
      ['company_id', '==', before.company_id], ['active', '==', 1],
    ]);
    if (activeMembers - 1 <= 0) {
      throw conflictError('No se puede desactivar: esta empresa quedaría sin ningún miembro activo.');
    }
  }

  if (before.role === 'admin_area' && (becomesInactive || changesRole)) {
    const activeAdmins = await firestoreData.countCollection('user_company_memberships', [
      ['company_id', '==', before.company_id], ['role', '==', 'admin_area'], ['active', '==', 1],
    ]);
    if (activeAdmins - 1 <= 0) {
      throw conflictError('No se puede aplicar el cambio: esta empresa quedaría sin ningún administrador de área activo.');
    }
  }
}

/**
 * Actualiza el rol, estado activo o flag de membresía por defecto de una membresía existente, validando que la empresa mantenga cobertura mínima de miembros y administradores. Registra auditoría y notifica en tiempo real.
 * @param {String|Number} membershipId - id de la membresía a actualizar
 * @param {Object} input - campos a actualizar (role, active, is_default)
 * @param {Object} requester - usuario que realiza la operación (administrador de plataforma, o SAC si `options.allowSACCreate`)
 * @param {Object} [options] - opciones adicionales
 * @param {Boolean} [options.allowSACCreate] - permite que un usuario SAC actualice la membresía
 * @returns {Promise<Object>} membresía actualizada serializada
 */
async function update(membershipId, input, requester, options = {}) {
  if (!requester || (!requester.isPlatformAdmin && !(options && options.allowSACCreate && requester.role === 'sac'))) {
    throw forbiddenError('Solo el administrador de plataforma puede modificar membresías.');
  }
  const before = await firestoreData.getDoc('user_company_memberships', Number(membershipId));
  if (!before) throw notFoundError('Membresía no encontrada.');
  const patch = {};
  if (input && input.role !== undefined) {
    const role = optionalEnum(input.role, 'role', ROLE_VALUES);
    if (!role) throw validationError('El campo "role" no es válido.');
    patch.role = role;
  }
  const wantsDefault = input && input.is_default !== undefined ? !!input.is_default : null;
  const wantsActive = input && input.active !== undefined ? !!input.active : null;
  await assertCompanyKeepsCoverage(before, { becomesInactive: wantsActive === false, newRole: patch.role });
  if (wantsActive !== null) {
    if (!wantsActive) {
      const targetUser = await firestoreData.getUserById(before.user_id);
      if (!(targetUser && targetUser.is_platform_admin)) {
        const others = await firestoreData.countCollection('user_company_memberships', [['user_id', '==', before.user_id], ['active', '==', 1]]);
        if (before.active && others <= 1) throw conflictError('No se puede desactivar la última membresía activa del usuario.');
      }
    }
    patch.active = wantsActive ? 1 : 0;
  }
  if (wantsDefault !== null) patch.is_default = wantsDefault ? 1 : 0;

  if (wantsDefault === true) {
    const others = await firestoreData.queryCollection('user_company_memberships', [['user_id', '==', before.user_id], ['is_default', '==', 1]]);
    for (const o of others) {
      if (String(o.id) !== String(before.id)) await firestoreData.updateDoc('user_company_memberships', o.id, { is_default: 0 });
    }
  }
  if (Object.keys(patch).length > 0) await firestoreData.updateDoc('user_company_memberships', before.id, patch);
  const after = await firestoreData.getDoc('user_company_memberships', before.id);
  const out = serialize(after);
  await auditService.logAsync({
    user_id: requester.id,
    company_id: before.company_id,
    action_type: 'membership:update',
    target_type: 'membership',
    target_id: before.id,
    target_code: `user#${before.user_id}`,
    description: `Membresía actualizada (#${before.id})`,
    old_value: serialize(before),
    new_value: out,
  });
  emitMembership('membership:update', out, before.company_id, before.user_id);
  return out;
}

/**
 * Desactiva (soft delete) una membresía, impidiendo eliminar la última membresía activa de un usuario y validando la cobertura mínima de la empresa. Registra auditoría y notifica en tiempo real.
 * @param {String|Number} membershipId - id de la membresía a eliminar
 * @param {Object} requester - usuario que realiza la operación, debe ser administrador de plataforma
 * @returns {Promise<Object>} membresía resultante tras la baja
 */
async function softDelete(membershipId, requester) {
  if (!requester || !requester.isPlatformAdmin) throw forbiddenError('Solo el administrador de plataforma puede eliminar membresías.');
  const before = await firestoreData.getDoc('user_company_memberships', Number(membershipId));
  if (!before) throw notFoundError('Membresía no encontrada.');
  if (!before.active)
    return serialize(before);
  const targetUser = await firestoreData.getUserById(before.user_id);
  if (!(targetUser && targetUser.is_platform_admin)) {
    const others = await firestoreData.countCollection('user_company_memberships', [['user_id', '==', before.user_id], ['active', '==', 1]]);
    if (others <= 1) throw conflictError('No se puede eliminar la última membresía activa del usuario.');
  }
  await assertCompanyKeepsCoverage(before, { becomesInactive: true });
  await firestoreData.updateDoc('user_company_memberships', before.id, { active: 0 });
  const afterDoc = await firestoreData.getDoc('user_company_memberships', before.id);
  const after = serialize(afterDoc);
  await auditService.logAsync({
    user_id: requester.id,
    company_id: before.company_id,
    action_type: 'membership:delete',
    target_type: 'membership',
    target_id: before.id,
    target_code: `user#${before.user_id}`,
    description: `Membresía eliminada (#${before.id})`,
    old_value: serialize(before),
    new_value: after,
  });
  emitMembership('membership:delete', after, before.company_id, before.user_id);
  return after;
}

module.exports = {
  listByUser,
  listByCompany,
  create,
  update,
  softDelete,
  resolveDefaultCompanyId,
  isActiveMemberOfCompany,
  findMembershipForUserAndCompany,
  _serialize: serialize,
};

