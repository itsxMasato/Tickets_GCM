/* Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. */
'use strict';

const orm = require('../orm');
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

// Emite un evento de empresa a platform admin (room 'sac', donde está Miguel
// hoy) y a la sala `company:{id}` para miembros futuros. Safe si el socket
// aún no inicializó (arranque en frío, tests). Mismo patrón que
// auth.service.js → emitUser().
//
// `event`: p.ej. 'company:create' | 'company:update' | 'company:delete'
// `company`: row ya serializado. `companyId`: id numérico para rooms.
function emitCompany(event, company, companyId) {
  try {
    const { emit } = require('../sockets');
    emit(event, { company }, {
      role: 'sac',
      extraRooms: companyId ? [`company:${companyId}`] : [],
    });
  } catch (e) {
    /* socket no inicializado aún */
  }
}

/**
 * companies.service — CRUD de empresas (multi-tenant core).
 *
 * Reglas de negocio:
 *   - Cualquier autenticado puede LISTAR, pero el service filtra:
 *     platform admin ve todas, usuario normal solo las empresas donde
 *     tiene membresía activa.
 *   - GET /:id: si el requester no es platform admin y no es miembro,
 *     devuelve `null` (no `notFoundError`) para no leakear existencia
 *     cross-tenant (defensa en profundidad, ver MULTITENANT.md §7.2).
 *   - POST/PATCH/DELETE: solo platform admin (gateado por middleware
 *     `requirePlatformAdmin`).
 *   - Slug: opcional del cliente. Si falta, se autogenera con `slugify(name)`.
 *     Si choca, se prueba con sufijo `-2`, `-3`, etc.
 *   - is_default: como máximo una empresa activa puede tener is_default=true.
 *     La transacción desmarca el resto.
 *   - Soft-delete: pone `active=0`. NO se puede desactivar la ÚLTIMA
 *     empresa activa del sistema (anti-self-destroy).
 *   - Toda mutación llama auditService.logAsync({ action_type, target_type, target_id, target_code, old_value, new_value, description }).
 *
 * Shape de retorno: los services devuelven el row ya serializado (id, name, slug,
 * logo_url, color, active, is_default, timestamps). Las rutas lo envuelven en
 * `{ company: ... }` o `{ companies: ... }`.
 */

/**
 * Serializa una fila de Company a la forma que la API expone.
 * Convierte BITs 0/1 a booleanos para que el JSON sea coherente.
 */
function serialize(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    logo_url: row.logo_url || null,
    color: row.color || null,
    active: !!row.active,
    is_default: !!row.is_default,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * Construye un slug único a partir de una base. Si choca, prueba `base-2`,
 * `base-3`, etc. hasta encontrar uno libre (o falla con conflictError).
 */
async function ensureUniqueSlug(repo, base, excludeId = null) {
  // base puede quedar vacía si el cliente mandó un name sin chars válidos.
  // En ese caso usamos un fallback estable basado en timestamp.
  const seed = base && base.length > 0 ? base : `empresa-${Date.now()}`;
  for (let i = 0; i < 100; i += 1) {
    const candidate = i === 0 ? seed : `${seed}-${i + 1}`;
    const existing = await repo.findOne({ where: { slug: candidate } });
    if (!existing || (excludeId && existing.id === excludeId)) return candidate;
  }
  throw conflictError('No se pudo generar un slug único. Probá con un slug manual.');
}

/**
 * list — devuelve todas las empresas visibles para el requester.
 *   - activeOnly=true (default) filtra active=1.
 *   - Platform admin: ve todas.
 *   - Usuario normal: solo las que tienen una membresía activa del user.
 */
async function list({ activeOnly = true, requester } = {}) {
  const repo = await orm.getRepository(orm.Company);
  const all = await repo.find();
  let visible = all;
  if (requester && !requester.isPlatformAdmin) {
    const memberRepo = await orm.getRepository(orm.UserCompanyMembership);
    const memberships = await memberRepo.find({ where: { user_id: requester.id, active: 1 } });
    const allowed = new Set(memberships.map((m) => m.company_id));
    visible = all.filter((c) => allowed.has(c.id));
  }
  if (activeOnly) visible = visible.filter((c) => c.active);
  return visible.map(serialize);
}

/**
 * getById — devuelve una empresa si el requester puede verla, o `null`.
 * No tira notFoundError: el caller decide (generalmente responde 404).
 */
async function getById(id, { requester } = {}) {
  const repo = await orm.getRepository(orm.Company);
  const row = await repo.findOne({ where: { id: Number(id) } });
  if (!row) return null;
  if (requester && !requester.isPlatformAdmin) {
    const memberRepo = await orm.getRepository(orm.UserCompanyMembership);
    const m = await memberRepo.findOne({ where: { user_id: requester.id, company_id: row.id, active: 1 } });
    if (!m) return null;
  }
  return serialize(row);
}

/**
 * create — crea una empresa. Solo platform admin.
 *   - name: obligatorio, max 200.
 *   - slug: opcional. Si falta, slugify(name) + sufijo si choca.
 *   - logo_url, color: opcionales.
 *   - is_default: si true, desmarca el resto (transacción).
 */
async function create(input, requester) {
  if (!requester || !requester.isPlatformAdmin) {
    throw forbiddenError('Solo el administrador de plataforma puede crear empresas.');
  }
  const name = requireString(input && input.name, 'name', 200);
  const providedSlug = optionalString(input && input.slug, 'slug', 50);
  const logoUrl = optionalString(input && input.logo_url, 'logo_url', 500);
  const color = optionalString(input && input.color, 'color', 20);
  const isDefault = !!(input && input.is_default);

  const repo = await orm.getRepository(orm.Company);
  const baseSlug = providedSlug || slugify(name);
  const finalSlug = await ensureUniqueSlug(repo, baseSlug);

  const dataSource = await orm.getDataSource();
  const saved = await dataSource.transaction(async (manager) => {
    const txRepo = manager.getRepository(orm.Company);
    if (isDefault) {
      await txRepo.update({ is_default: 1 }, { is_default: 0 });
    }
    const insertResult = await txRepo.insert({
      name,
      slug: finalSlug,
      logo_url: logoUrl,
      color,
      active: 1,
      is_default: isDefault ? 1 : 0,
    });
    const id = insertResult.identifiers && insertResult.identifiers[0] ? insertResult.identifiers[0].id : null;
    return txRepo.findOne({ where: { id } });
  });

  const created = serialize(saved);
  await auditService.logAsync({
    user_id: requester.id,
    action_type: 'company:create',
    target_type: 'company',
    target_id: created.id,
    target_code: created.slug,
    description: `Empresa creada: ${created.name}`,
    new_value: { name: created.name, slug: created.slug, color: created.color, is_default: created.is_default },
  });
  emitCompany('company:create', created, created.id);
  return created;
}

/**
 * update — actualiza una empresa. Solo platform admin.
 * Acepta cualquier subconjunto de: { name, slug, logo_url, color, active, is_default }.
 * Si `is_default` pasa a true, desmarca el resto (transacción).
 */
async function update(id, input, requester) {
  if (!requester || !requester.isPlatformAdmin) {
    throw forbiddenError('Solo el administrador de plataforma puede modificar empresas.');
  }
  const companyId = Number(id);
  const repo = await orm.getRepository(orm.Company);
  const before = await repo.findOne({ where: { id: companyId } });
  if (!before) throw notFoundError('Empresa no encontrada.');

  const patch = {};
  if (input && input.name !== undefined) patch.name = requireString(input.name, 'name', 200);
  if (input && input.slug !== undefined) {
    const newSlug = requireString(input.slug, 'slug', 50);
    if (newSlug !== before.slug) {
      patch.slug = await ensureUniqueSlug(repo, newSlug, companyId);
    }
  }
  if (input && input.logo_url !== undefined) patch.logo_url = optionalString(input.logo_url, 'logo_url', 500);
  if (input && input.color !== undefined) patch.color = optionalString(input.color, 'color', 20);
  if (input && input.active !== undefined) patch.active = input.active ? 1 : 0;
  const wantsDefault = input && input.is_default !== undefined ? !!input.is_default : null;
  if (wantsDefault !== null) patch.is_default = wantsDefault ? 1 : 0;

  const dataSource = await orm.getDataSource();
  const after = await dataSource.transaction(async (manager) => {
    const txRepo = manager.getRepository(orm.Company);
    if (wantsDefault === true) {
      await txRepo.update({ is_default: 1 }, { is_default: 0 });
    }
    if (Object.keys(patch).length > 0) {
      await txRepo.update({ id: companyId }, patch);
    }
    return txRepo.findOne({ where: { id: companyId } });
  });

  const result = serialize(after);
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
 * softDelete — pone active=0. Solo platform admin.
 * Regla: no se puede desactivar la ÚLTIMA empresa activa.
 */
async function softDelete(id, requester) {
  if (!requester || !requester.isPlatformAdmin) {
    throw forbiddenError('Solo el administrador de plataforma puede desactivar empresas.');
  }
  const companyId = Number(id);
  const repo = await orm.getRepository(orm.Company);
  const before = await repo.findOne({ where: { id: companyId } });
  if (!before) throw notFoundError('Empresa no encontrada.');
  if (!before.active) {
    // Ya estaba inactiva: idempotente, no auditamos.
    return serialize(before);
  }
  const activeCount = await repo.count({ where: { active: 1 } });
  if (activeCount <= 1) {
    throw conflictError('No se puede desactivar la última empresa activa del sistema.');
  }
  await repo.update({ id: companyId }, { active: 0 });
  const after = await repo.findOne({ where: { id: companyId } });
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
  // Exposto para tests
  _serialize: serialize,
};
