/* Documentado por: Miguel Flores */
'use strict'

const { In } = require('typeorm');
const orm = require('../orm');
const membershipsService = require('./memberships.service');
const {
  requireString,
  optionalString,
  validationError,
  notFoundError,
  conflictError,
  forbiddenError,
} = require('../utils/validators');
const { slugify } = require('../utils/slugify');
const auditService = require('./audit.service');

/**
 * Emite por socket.io un evento relacionado a una empresa, dirigido al rol SAC y a la sala de la empresa afectada. Silencia errores de socket.
 * @param {String} event - nombre del evento a emitir
 * @param {Object} company - empresa involucrada
 * @param {String|Number} companyId - id de la empresa, usado para armar la sala del socket
 * @returns {void}
 */
function emitCompany(event, company, companyId) {
  try {
    const { emit } = require('../sockets');
    emit(event, { company }, {
      role: 'sac',
      extraRooms: companyId ? [`company:${companyId}`] : [],
    });
  } catch (e) {}
}

/**
 * Convierte una fila de empresa de la base al formato plano expuesto por la API.
 * @param {Object} row - fila cruda de empresa
 * @returns {Object|null} empresa serializada, o null si no se recibió fila
 */
function serialize(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    logo_url: row.logo_url || null,
    location: row.location || null,
    responsible_user_id: row.responsible_user_id || null,
    color: row.color || null,
    code_prefix: row.code_prefix || null,
    active: !!row.active,
    is_default: !!row.is_default,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * Genera un slug único para una empresa a partir de un valor base, agregando un sufijo numérico incremental si ya existe.
 * @param {String} base - slug base propuesto
 * @param {String|Number} [excludeId] - id de empresa a excluir de la verificación de unicidad (para updates)
 * @returns {Promise<String>} slug único disponible
 */
async function ensureUniqueSlug(base, excludeId = null) {
  const repo = await orm.getRepository(orm.Company);
  const seed = base && base.length > 0 ? base : `empresa-${Date.now()}`;
  for (let i = 0; i < 100; i += 1) {
    const candidate = i === 0 ? seed : `${seed}-${i + 1}`;
    const existing = await repo.findOneBy({ slug: candidate });
    if (!existing || (excludeId && existing.id === Number(excludeId))) return candidate;
  }
  throw conflictError('No se pudo generar un slug único. Probá con un slug manual.');
}

const CODE_PREFIX_RE = /^[A-Z0-9]{1,6}$/;

/**
 * Valida y normaliza el prefijo de nomenclatura de una empresa (solo letras/números, hasta 6 caracteres, en mayúsculas).
 * @param {String} value - prefijo a validar
 * @returns {String|null} prefijo normalizado en mayúsculas, o null si no se proporcionó
 */
function validateCodePrefix(value) {
  const trimmed = optionalString(value, 'code_prefix', 6);
  if (!trimmed) return null;
  const upper = trimmed.toUpperCase();
  if (!CODE_PREFIX_RE.test(upper)) {
    throw validationError('El prefijo de nomenclatura debe ser solo letras/numeros, sin espacios (maximo 6 caracteres).');
  }
  return upper;
}

/**
 * Verifica que un prefijo de nomenclatura no esté siendo usado por otra empresa, lanzando error de conflicto si ya existe.
 * @param {String} prefix - prefijo a verificar
 * @param {String|Number} [excludeId] - id de empresa a excluir de la verificación (para updates)
 * @returns {Promise<void>}
 */
async function ensureUniqueCodePrefix(prefix, excludeId = null) {
  if (!prefix) return;
  const repo = await orm.getRepository(orm.Company);
  const existing = await repo.findOneBy({ code_prefix: prefix });
  if (existing && (!excludeId || existing.id !== Number(excludeId))) {
    throw conflictError(`El prefijo "${prefix}" ya lo usa otra empresa.`);
  }
}

// Roles elegibles como encargado de empresa: administrador de área o jefe inmediato.
const RESPONSIBLE_ROLES = ['admin_area', 'jefe_inmediato'];

/**
 * Asegura que el usuario encargado de una empresa tenga una membresía activa en esa empresa, creándola si no existe. Si ya tiene una membresía, conserva su rol actual (admin_area o jefe_inmediato) en lugar de forzarlo. Absorbe errores para no interrumpir el flujo que la invoca.
 * @param {String|Number} userId - id del usuario encargado
 * @param {String|Number} companyId - id de la empresa
 * @param {Object} requester - usuario que realiza la operación
 * @returns {Promise<void>}
 */
async function ensureAdminAreaMembership(userId, companyId, requester) {
  if (!userId || !companyId) return;
  try {
    const existing = await membershipsService.findMembershipForUserAndCompany(userId, companyId, { activeOnly: false });
    if (existing) {
      if (!existing.active) {
        await membershipsService.update(existing.id, { active: true }, requester, { allowSACCreate: true });
      }
      return;
    }
    const userRepo = await orm.getRepository(orm.User);
    const user = await userRepo.findOneBy({ id: Number(userId) });
    const role = (user && RESPONSIBLE_ROLES.includes(user.role)) ? user.role : 'admin_area';
    await membershipsService.create(userId, { company_id: companyId, role }, requester, { allowSACCreate: true });
  } catch (err) {
    console.warn('[companies.service] no se pudo asegurar la membresía del encargado:', err.stack || err.message);
  }
}

/**
 * Lista las empresas visibles para el solicitante, opcionalmente filtrando solo las activas.
 * @param {Object} [options] - opciones de listado
 * @param {Boolean} [options.activeOnly=true] - si true, excluye empresas inactivas
 * @param {Object} [options.requester] - usuario que realiza la consulta, usado para acotar el alcance
 * @returns {Promise<Array>} empresas serializadas
 */
async function list({ activeOnly = true, requester } = {}) {
  const repo = await orm.getRepository(orm.Company);
  if (requester && !requester.isPlatformAdmin) {
    const membershipRepo = await orm.getRepository(orm.UserCompanyMembership);
    const mems = await membershipRepo.find({ where: { user_id: Number(requester.id), active: true } });
    const companyIds = mems.map((m) => m.company_id);
    if (!companyIds.length) return [];
    let rows = await repo.findBy({ id: In(companyIds) });
    if (activeOnly) rows = rows.filter((c) => c.active);
    return rows.map(serialize);
  }
  const where = activeOnly ? { active: true } : {};
  const rows = await repo.find({ where });
  return rows.map(serialize);
}

/**
 * Obtiene una empresa por id, verificando el alcance del solicitante.
 * @param {String|Number} id - id de la empresa
 * @param {Object} [options] - opciones de consulta
 * @param {Object} [options.requester] - usuario que realiza la consulta
 * @returns {Promise<Object|null>} empresa serializada
 */
async function getById(id, { requester } = {}) {
  const repo = await orm.getRepository(orm.Company);
  const row = await repo.findOneBy({ id: Number(id) });
  if (!row) return null;
  if (requester && !requester.isPlatformAdmin) {
    const isMember = await membershipsService.isActiveMemberOfCompany(requester.id, id);
    if (!isMember) return null;
  }
  return serialize(row);
}

/**
 * Crea una nueva empresa (solo administradores de plataforma), validando nombre, slug único y prefijo de nomenclatura único, gestionando el flag de empresa por defecto y la membresía admin_area del encargado. Registra auditoría y notifica en tiempo real.
 * @param {Object} input - datos de la empresa a crear
 * @param {Object} requester - usuario que realiza la creación, debe ser administrador de plataforma
 * @returns {Promise<Object>} empresa creada serializada
 */
async function create(input, requester) {
  if (!requester || !requester.isPlatformAdmin) {
    throw forbiddenError('Requiere permisos de administrador de plataforma.');
  }
  const name = requireString(input && input.name, 'name', 200);
  const providedSlug = optionalString(input && input.slug, 'slug', 50);
  const logoUrl = optionalString(input && input.logo_url, 'logo_url', 500);
  const color = optionalString(input && input.color, 'color', 20);
  const location = optionalString(input && input.location, 'location', 200);
  const responsibleUserId = input && input.responsible_user_id ? Number(input.responsible_user_id) : null;
  const codePrefix = validateCodePrefix(input && input.code_prefix);
  const isDefault = !!(input && input.is_default);

  const baseSlug = providedSlug || slugify(name);
  const finalSlug = await ensureUniqueSlug(baseSlug);
  await ensureUniqueCodePrefix(codePrefix);

  const repo = await orm.getRepository(orm.Company);
  if (isDefault) {
    await repo.update({ is_default: true }, { is_default: false });
  }
  let createdRow;
  try {
    createdRow = await repo.save({
      name,
      slug: finalSlug,
      logo_url: logoUrl,
      location,
      responsible_user_id: responsibleUserId,
      color,
      code_prefix: codePrefix,
      active: true,
      is_default: isDefault,
    });
  } catch (err) {
    if (err && (err.number === 2627 || err.number === 2601)) {
      throw conflictError('El slug o el prefijo ya están en uso por otra empresa.');
    }
    throw err;
  }
  const created = serialize(createdRow);
  await ensureAdminAreaMembership(responsibleUserId, created.id, requester);
  await auditService.logAsync({
    user_id: requester.id,
    company_id: created.id,
    action_type: 'company:create',
    target_type: 'company',
    target_id: created.id,
    target_code: created.slug,
    description: `Empresa creada: ${created.name}`,
    new_value: { name: created.name, slug: created.slug, color: created.color, code_prefix: created.code_prefix, is_default: created.is_default },
  });
  emitCompany('company:create', created, created.id);
  return created;
}

/**
 * Actualiza los datos de una empresa existente (solo administradores de plataforma), validando slug y prefijo únicos, gestionando el flag de empresa por defecto y la membresía admin_area del encargado. Registra auditoría y notifica en tiempo real.
 * @param {String|Number} id - id de la empresa a actualizar
 * @param {Object} input - campos a actualizar
 * @param {Object} requester - usuario que realiza la actualización, debe ser administrador de plataforma
 * @returns {Promise<Object>} empresa actualizada serializada
 */
async function update(id, input, requester) {
  if (!requester || !requester.isPlatformAdmin) {
    throw forbiddenError('Requiere permisos de administrador de plataforma.');
  }
  const companyId = Number(id);
  const repo = await orm.getRepository(orm.Company);
  const before = await repo.findOneBy({ id: companyId });
  if (!before) throw notFoundError('Empresa no encontrada.');

  const patch = {};
  if (input && input.name !== undefined) patch.name = requireString(input.name, 'name', 200);
  if (input && input.slug !== undefined) {
    const newSlug = requireString(input.slug, 'slug', 50);
    if (newSlug !== before.slug) {
      patch.slug = await ensureUniqueSlug(newSlug, companyId);
    }
  }
  if (input && input.logo_url !== undefined) patch.logo_url = optionalString(input.logo_url, 'logo_url', 500);
  if (input && input.color !== undefined) patch.color = optionalString(input.color, 'color', 20);
  if (input && input.code_prefix !== undefined) {
    patch.code_prefix = validateCodePrefix(input.code_prefix);
    await ensureUniqueCodePrefix(patch.code_prefix, companyId);
  }
  if (input && input.active !== undefined) patch.active = !!input.active;
  if (input && input.location !== undefined) patch.location = optionalString(input.location, 'location', 200);
  if (input && input.responsible_user_id !== undefined) {
    patch.responsible_user_id = input.responsible_user_id === null ? null : Number(input.responsible_user_id) || null;
  }
  const wantsDefault = input && input.is_default !== undefined ? !!input.is_default : null;
  if (wantsDefault !== null) patch.is_default = wantsDefault;

  if (wantsDefault === true) {
    await repo.createQueryBuilder()
      .update()
      .set({ is_default: false })
      .where('is_default = :isDefault AND id != :id', { isDefault: true, id: companyId })
      .execute();
  }

  if (Object.keys(patch).length > 0) {
    try {
      await repo.update({ id: companyId }, patch);
    } catch (err) {
      if (err && (err.number === 2627 || err.number === 2601)) {
        throw conflictError('El slug o el prefijo ya están en uso por otra empresa.');
      }
      throw err;
    }
  }
  const after = await repo.findOneBy({ id: companyId });
  const result = serialize(after);
  if (patch.responsible_user_id) {
    await ensureAdminAreaMembership(patch.responsible_user_id, result.id, requester);
  }
  await auditService.logAsync({
    user_id: requester.id,
    company_id: result.id,
    action_type: 'company:update',
    target_type: 'company',
    target_id: result.id,
    target_code: result.slug,
    description: `Empresa actualizada: ${result.name}`,
    old_value: serialize(before),
    new_value: result,
  });
  emitCompany('company:update', result, result.id);
  return result;
}

/**
 * Desactiva una empresa (soft delete), impidiendo desactivar la última empresa activa del sistema. Registra auditoría y notifica en tiempo real.
 * @param {String|Number} id - id de la empresa a desactivar
 * @param {Object} requester - usuario que realiza la operación, debe ser administrador de plataforma
 * @returns {Promise<Object>} empresa resultante tras la baja
 */
async function softDelete(id, requester) {
  if (!requester || !requester.isPlatformAdmin) {
    throw forbiddenError('Requiere permisos de administrador de plataforma.');
  }
  const companyId = Number(id);
  const repo = await orm.getRepository(orm.Company);
  const before = await repo.findOneBy({ id: companyId });
  if (!before) throw notFoundError('Empresa no encontrada.');
  if (!before.active) {
    return serialize(before);
  }
  const activeCount = await repo.count({ where: { active: true } });
  if (activeCount <= 1) {
    throw conflictError('No se puede desactivar la última empresa activa del sistema.');
  }
  await repo.update({ id: companyId }, { active: false });
  const after = serialize(await repo.findOneBy({ id: companyId }));
  await auditService.logAsync({
    user_id: requester.id,
    company_id: companyId,
    action_type: 'company:delete',
    target_type: 'company',
    target_id: companyId,
    target_code: before.slug,
    description: `Empresa desactivada: ${before.name}`,
    old_value: serialize(before),
    new_value: after,
  });
  emitCompany('company:delete', after, companyId);
  return after;
}

module.exports = {
  list,
  getById,
  create,
  update,
  softDelete,
  _serialize: serialize,
};
