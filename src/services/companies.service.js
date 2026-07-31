/* Documentado por: Miguel Flores */
'use strict'

const firestoreData = require('../firestoreData');
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
 * Convierte un registro de empresa de Firestore al formato plano expuesto por la API.
 * @param {Object} row - registro crudo de empresa
 * @returns {Object|null} empresa serializada, o null si no se recibió registro
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
  const seed = base && base.length > 0 ? base : `empresa-${Date.now()}`;
  for (let i = 0; i < 100; i += 1) {
    const candidate = i === 0 ? seed : `${seed}-${i + 1}`;
    const existing = await firestoreData.findOneByFields('companies', [['slug', '==', candidate]]);
    if (!existing || (excludeId && String(existing.id) === String(excludeId))) return candidate;
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
  const existing = await firestoreData.findOneByFields('companies', [['code_prefix', '==', prefix]]);
  if (existing && (!excludeId || String(existing.id) !== String(excludeId))) {
    throw conflictError(`El prefijo "${prefix}" ya lo usa otra empresa.`);
  }
}

/**
 * Asegura que el usuario encargado de una empresa tenga una membresía activa con rol admin_area en esa empresa, creándola o actualizándola según corresponda. Absorbe errores para no interrumpir el flujo que la invoca.
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
      if (existing.role !== 'admin_area' || !existing.active) {
        await membershipsService.update(existing.id, { role: 'admin_area', active: true }, requester, { allowSACCreate: true });
      }
      return;
    }
    await membershipsService.create(userId, { company_id: companyId, role: 'admin_area' }, requester, { allowSACCreate: true });
  } catch (err) {
    console.warn('[companies.service] no se pudo asegurar la membresía admin_area del encargado:', err.stack || err.message);
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
  const rows = await firestoreData.listCompanies({ activeOnly, requester });
  if (!Array.isArray(rows)) return [];
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
  const row = await firestoreData.getCompanyById(Number(id), { requester });
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
  await ensureUniqueCodePrefix(codePrefix);
  if (isDefault) {
    const defaults = await firestoreData.queryCollection('companies', [['is_default', '==', 1]]);
    for (const d of defaults) {
      await firestoreData.updateDoc('companies', d.id, { is_default: 0 });
    }
  }
  let createdRow;
  try {
    createdRow = await firestoreData.createCompany({ name, slug: baseSlug, logo_url: logoUrl, location, responsible_user_id: responsibleUserId, color, code_prefix: codePrefix, is_default: isDefault });
  } catch (err) {
    if (err.code === 'CONFLICT')
      throw conflictError(err.message);
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
  const before = await firestoreData.getCompanyById(companyId, { requester: null });
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
  if (input && input.active !== undefined) patch.active = input.active ? 1 : 0;
  if (input && input.location !== undefined) patch.location = optionalString(input.location, 'location', 200);
  if (input && input.responsible_user_id !== undefined) {
    const val = input.responsible_user_id === null ? null : Number(input.responsible_user_id);
    patch.responsible_user_id = val || null;
  }
  const wantsDefault = input && input.is_default !== undefined ? !!input.is_default : null;
  if (wantsDefault !== null) patch.is_default = wantsDefault ? 1 : 0;

  if (wantsDefault === true) {
    const defaults = await firestoreData.queryCollection('companies', [['is_default', '==', 1]]);
    for (const d of defaults) {
      if (String(d.id) !== String(companyId)) {
        await firestoreData.updateDoc('companies', d.id, { is_default: 0 });
      }
    }
  }
  let after;
  try {
    after = await firestoreData.updateCompany(companyId, patch);
  } catch (err) {
    if (err.code === 'CONFLICT') throw conflictError(err.message);
    if (err.code === 'NOT_FOUND') throw notFoundError(err.message);
    throw err;
  }
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
  const before = await firestoreData.getCompanyById(companyId, { requester: null });
  if (!before) throw notFoundError('Empresa no encontrada.');
  if (!before.active) {
    return serialize(before);
  }
  const activeCount = await firestoreData.countCollection('companies', [['active', '==', 1]]);
  if (activeCount <= 1) {
    throw conflictError('No se puede desactivar la última empresa activa del sistema.');
  }
  const after = await firestoreData.softDeleteCompany(companyId);
  await auditService.logAsync({
    user_id: requester.id,
    company_id: companyId,
    action_type: 'company:delete',
    target_type: 'company',
    target_id: companyId,
    target_code: before.slug,
    description: `Empresa desactivada: ${before.name}`,
    old_value: serialize(before),
    new_value: serialize(after),
  });
  emitCompany('company:delete', serialize(after), companyId);
  return serialize(after);
}

module.exports = {
  list,
  getById,
  create,
  update,
  softDelete,
  _serialize: serialize,
};

