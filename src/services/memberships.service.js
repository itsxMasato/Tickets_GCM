/* Documentado por: Miguel Flores */
'use strict'

const { In } = require('typeorm');
const orm = require('../orm');
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
 * Convierte una fila de membresía a los tipos/formato planos expuestos por la API.
 * @param {Object} row - fila cruda de membresía
 * @returns {Object|null} membresía serializada, o null si no se recibió fila
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
  const repo = await orm.getRepository(orm.Company);
  const c = await repo.findOneBy({ id: Number(companyId) });
  if (!c) throw notFoundError('Empresa no encontrada.');
  return c;
}

/**
 * Carga un usuario por id, lanzando error si no existe.
 * @param {String|Number} userId - id del usuario
 * @returns {Promise<Object>} usuario encontrado
 */
async function loadUserOrThrow(userId) {
  const repo = await orm.getRepository(orm.User);
  const u = await repo.findOneBy({ id: Number(userId) });
  if (!u) throw notFoundError('Usuario no encontrado.');
  return u;
}

/**
 * Obtiene las membresías (activas o no) de un usuario.
 * @param {String|Number} userId - id del usuario
 * @param {Object} [options] - opciones de consulta
 * @param {Boolean} [options.activeOnly=false] - si true, devuelve solo membresías activas
 * @returns {Promise<Array>} membresías crudas del usuario
 */
async function getMembershipRowsForUser(userId, { activeOnly = false } = {}) {
  const repo = await orm.getRepository(orm.UserCompanyMembership);
  const where = { user_id: Number(userId) };
  if (activeOnly) where.active = true;
  return repo.find({ where });
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
  const repo = await orm.getRepository(orm.UserCompanyMembership);
  const where = { user_id: Number(userId), company_id: Number(companyId) };
  if (activeOnly) where.active = true;
  return repo.findOneBy(where);
}

/**
 * Resuelve el id de la empresa por defecto de un usuario a partir de sus membresías activas, usando la primera activa como respaldo si ninguna está marcada como default.
 * @param {String|Number} userId - id del usuario
 * @returns {Promise<Number|null>} id de la empresa por defecto, o null si el usuario no tiene membresías activas
 */
async function resolveDefaultCompanyId(userId) {
  const rows = await getMembershipRowsForUser(userId, { activeOnly: true });
  if (!rows.length) return null;
  const defaultRow = rows.find((row) => row.is_default);
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
  const companyIds = Array.from(new Set(memberships.map((m) => m.company_id).filter((id) => id != null)));
  const companyRepo = await orm.getRepository(orm.Company);
  const companies = companyIds.length ? await companyRepo.findBy({ id: In(companyIds) }) : [];
  const companiesById = new Map(companies.map((c) => [c.id, c]));
  return memberships.map((m) => {
    const c = companiesById.get(m.company_id);
    if (c) m.company = { id: c.id, name: c.name, slug: c.slug, color: c.color || null, logo_url: c.logo_url || null };
    return m;
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
    const hasAccess = rows.some((row) => Number(row.company_id) === cid);
    if (!hasAccess) throw forbiddenError('No es miembro de esta empresa.');
  }
  await loadCompanyOrThrow(cid);
  const repo = await orm.getRepository(orm.UserCompanyMembership);
  const where = { company_id: cid };
  if (activeOnly) where.active = true;
  const filtered = await repo.find({ where });
  const userIds = Array.from(new Set(filtered.map((m) => m.user_id).filter((id) => id != null)));
  const userRepo = await orm.getRepository(orm.User);
  const users = userIds.length ? await userRepo.findBy({ id: In(userIds) }) : [];
  const usersById = new Map(users.map((u) => [u.id, u]));
  return filtered.map((m) => {
    const base = serialize(m);
    const u = usersById.get(m.user_id);
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

  const repo = await orm.getRepository(orm.UserCompanyMembership);
  const dup = await findMembershipForUserAndCompany(user.id, company.id, { activeOnly: false });
  if (dup)
    { throw conflictError(`El usuario ya tiene una membresía en "${company.name}".`); }

  if (isDefault) {
    await repo.update({ user_id: user.id, is_default: true }, { is_default: false });
  }

  const createdRow = await repo.save({
    user_id: user.id,
    company_id: company.id,
    role,
    active: true,
    is_default: isDefault,
  });
  const out = serialize(createdRow);
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

  const repo = await orm.getRepository(orm.UserCompanyMembership);

  if (becomesInactive) {
    const activeMembers = await repo.count({ where: { company_id: before.company_id, active: true } });
    if (activeMembers - 1 <= 0) {
      throw conflictError('No se puede desactivar: esta empresa quedaría sin ningún miembro activo.');
    }
  }

  if (before.role === 'admin_area' && (becomesInactive || changesRole)) {
    const activeAdmins = await repo.count({ where: { company_id: before.company_id, role: 'admin_area', active: true } });
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
  const repo = await orm.getRepository(orm.UserCompanyMembership);
  const before = await repo.findOneBy({ id: Number(membershipId) });
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
      const userRepo = await orm.getRepository(orm.User);
      const targetUser = await userRepo.findOneBy({ id: before.user_id });
      if (!(targetUser && targetUser.is_platform_admin)) {
        const others = await repo.count({ where: { user_id: before.user_id, active: true } });
        if (before.active && others <= 1) throw conflictError('No se puede desactivar la última membresía activa del usuario.');
      }
    }
    patch.active = wantsActive;
  }
  if (wantsDefault !== null) patch.is_default = wantsDefault;

  if (wantsDefault === true) {
    await repo.createQueryBuilder()
      .update()
      .set({ is_default: false })
      .where('user_id = :userId AND is_default = :isDefault AND id != :id', { userId: before.user_id, isDefault: true, id: before.id })
      .execute();
  }
  if (Object.keys(patch).length > 0) await repo.update({ id: before.id }, patch);
  const after = serialize(await repo.findOneBy({ id: before.id }));
  await auditService.logAsync({
    user_id: requester.id,
    company_id: before.company_id,
    action_type: 'membership:update',
    target_type: 'membership',
    target_id: before.id,
    target_code: `user#${before.user_id}`,
    description: `Membresía actualizada (#${before.id})`,
    old_value: serialize(before),
    new_value: after,
  });
  emitMembership('membership:update', after, before.company_id, before.user_id);
  return after;
}

/**
 * Desactiva (soft delete) una membresía, impidiendo eliminar la última membresía activa de un usuario y validando la cobertura mínima de la empresa. Registra auditoría y notifica en tiempo real.
 * @param {String|Number} membershipId - id de la membresía a eliminar
 * @param {Object} requester - usuario que realiza la operación, debe ser administrador de plataforma
 * @returns {Promise<Object>} membresía resultante tras la baja
 */
async function softDelete(membershipId, requester) {
  if (!requester || !requester.isPlatformAdmin) throw forbiddenError('Solo el administrador de plataforma puede eliminar membresías.');
  const repo = await orm.getRepository(orm.UserCompanyMembership);
  const before = await repo.findOneBy({ id: Number(membershipId) });
  if (!before) throw notFoundError('Membresía no encontrada.');
  if (!before.active)
    return serialize(before);
  const userRepo = await orm.getRepository(orm.User);
  const targetUser = await userRepo.findOneBy({ id: before.user_id });
  if (!(targetUser && targetUser.is_platform_admin)) {
    const others = await repo.count({ where: { user_id: before.user_id, active: true } });
    if (others <= 1) throw conflictError('No se puede eliminar la última membresía activa del usuario.');
  }
  await assertCompanyKeepsCoverage(before, { becomesInactive: true });
  await repo.update({ id: before.id }, { active: false });
  const after = serialize(await repo.findOneBy({ id: before.id }));
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
