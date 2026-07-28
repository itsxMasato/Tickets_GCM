/* Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. */
 'use strict';

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
 * Construye un slug único a partir de una base. Si choca, prueba `base-2`,
 * `base-3`, etc. hasta encontrar uno libre (o falla con conflictError).
 */
async function ensureUniqueSlug(base, excludeId = null) {
  // base puede quedar vacía; usamos fallback basado en timestamp.
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
 * validateCodePrefix - normaliza a mayusculas y valida el formato del
 * prefijo de nomenclatura de tickets de una empresa (ej. "N7", "C1", "ESP").
 * Usado como parte del codigo del ticket: `${code_prefix}-000001`.
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
 * ensureUniqueCodePrefix - dos empresas no pueden compartir el mismo
 * prefijo: los tickets de ambas terminarian numerandose en la misma
 * secuencia (N7-000001 de una empresa mezclado con la otra).
 */
async function ensureUniqueCodePrefix(prefix, excludeId = null) {
  if (!prefix) return;
  const existing = await firestoreData.findOneByFields('companies', [['code_prefix', '==', prefix]]);
  if (existing && (!excludeId || String(existing.id) !== String(excludeId))) {
    throw conflictError(`El prefijo "${prefix}" ya lo usa otra empresa.`);
  }
}

/**
 * ensureAdminAreaMembership — cuando se asigna un encargado a una empresa,
 * garantiza que tenga una membresía activa como admin_area en ella. Sin
 * esto, "Encargado" era solo una etiqueta visual: la persona no aparecía
 * en /api/users/:id/memberships y por lo tanto no podía alternar entre
 * empresas (el selector del topbar depende de membresías reales).
 *
 * Antes: si el usuario elegido YA tenía una membresía en esa empresa con
 * otro rol (o inactiva), `membershipsService.create` tiraba CONFLICT y ese
 * error se descartaba en silencio — la UI seguía mostrando "Encargado" pero
 * el rol/acceso real de la persona no cambiaba. Ahora: si ya es miembro, se
 * actualiza esa membresía a admin_area activa en vez de rendirse.
 * Best-effort solo para errores realmente inesperados (se loguean pero no
 * bloquean la creación/edición de la empresa).
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
 * list — devuelve todas las empresas visibles para el requester.
 *   - activeOnly=true (default) filtra active=1.
 *   - Platform admin: ve todas.
 *   - Usuario normal: solo las que tienen una membresía activa del user.
 */
async function list({ activeOnly = true, requester } = {}) {
  // Tratamos al rol `sac` como gestor global: debe ver todas las empresas
  // igual que `isPlatformAdmin`, así el frontend (SAC) puede crear/editar.
  const effectiveRequester = (requester && requester.role === 'sac')
    ? { ...requester, isPlatformAdmin: true }
    : requester;
  const rows = await firestoreData.listCompanies({ activeOnly, requester: effectiveRequester });
  if (!Array.isArray(rows)) return [];
  return rows.map(serialize);
}

/**
 * getById — devuelve una empresa si el requester puede verla, o `null`.
 * No tira notFoundError: el caller decide (generalmente responde 404).
 */
async function getById(id, { requester } = {}) {
  const row = await firestoreData.getCompanyById(Number(id), { requester });
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
  if (!requester || !(requester.isPlatformAdmin || requester.role === 'sac')) {
    throw forbiddenError('Requiere rol SAC o administrador de plataforma.');
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
  // If requesting is_default, desmarcamos las demás antes de crear.
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
    // createCompany revalida slug/code_prefix dentro de una transaccion
    // (contra el estado mas fresco, no el chequeo ya hecho arriba) para
    // cerrar la ventana de dos altas simultaneas con el mismo prefijo.
    if (err.code === 'CONFLICT') throw conflictError(err.message);
    throw err;
  }
  const created = serialize(createdRow);
  await ensureAdminAreaMembership(responsibleUserId, created.id, requester);
  await auditService.logAsync({
    user_id: requester.id,
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
 * update — actualiza una empresa. Solo platform admin.
 * Acepta cualquier subconjunto de: { name, slug, logo_url, color, active, is_default }.
 * Si `is_default` pasa a true, desmarca el resto (transacción).
 */
async function update(id, input, requester) {
  if (!requester || !(requester.isPlatformAdmin || requester.role === 'sac')) {
    throw forbiddenError('Requiere rol SAC o administrador de plataforma.');
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
 * softDelete — pone active=0. Solo platform admin.
 * Regla: no se puede desactivar la ÚLTIMA empresa activa.
 */
async function softDelete(id, requester) {
  if (!requester || !(requester.isPlatformAdmin || requester.role === 'sac')) {
    throw forbiddenError('Requiere rol SAC o administrador de plataforma.');
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
  // Exposto para tests
  _serialize: serialize,
};
