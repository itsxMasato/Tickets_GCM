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

function emitCompany(event, company, companyId) {
  try {
    const { emit } = require('../sockets');
    emit(event, { company }, {
      role: 'sac',
      extraRooms: companyId ? [`company:${companyId}`] : [],
    });
  } catch (e) {}
}

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

function validateCodePrefix(value) {
  const trimmed = optionalString(value, 'code_prefix', 6);
  if (!trimmed) return null;
  const upper = trimmed.toUpperCase();
  if (!CODE_PREFIX_RE.test(upper)) {
    throw validationError('El prefijo de nomenclatura debe ser solo letras/numeros, sin espacios (maximo 6 caracteres).');
  }
  return upper;
}

async function ensureUniqueCodePrefix(prefix, excludeId = null) {
  if (!prefix) return;
  const existing = await firestoreData.findOneByFields('companies', [['code_prefix', '==', prefix]]);
  if (existing && (!excludeId || String(existing.id) !== String(excludeId))) {
    throw conflictError(`El prefijo "${prefix}" ya lo usa otra empresa.`);
  }
}

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

async function list({ activeOnly = true, requester } = {}) {
  const rows = await firestoreData.listCompanies({ activeOnly, requester });
  if (!Array.isArray(rows)) return [];
  return rows.map(serialize);
}

async function getById(id, { requester } = {}) {
  const row = await firestoreData.getCompanyById(Number(id), { requester });
  return serialize(row);
}

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

