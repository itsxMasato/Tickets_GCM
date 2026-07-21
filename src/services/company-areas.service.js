/* Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. */
'use strict';

const orm = require('../orm');
const {
  requireString,
  optionalString,
  optionalEnum,
  validationError,
  notFoundError,
  conflictError,
  forbiddenError,
} = require('../utils/validators');
const { slugify } = require('../utils/slugify');
const auditService = require('./audit.service');

/**
 * company-areas.service — CRUD de áreas operativas por empresa.
 *
 * Reglas:
 *   - Cada empresa define sus propias áreas (una camaronera tiene
 *     'cocina', 'camaras', 'limpieza'; una constructora tiene 'obra',
 *     'logistica', 'administracion'). El seed siembra 5 áreas default
 *     para mantener compat.
 *   - `key` es el slug estable (no se renombra). `label` es traducible.
 *   - listByCompany: cualquier autenticado miembro de la empresa (o
 *     platform admin) puede listar. Orden por sort_order, key.
 *   - create/update/softDelete: solo platform admin.
 *   - Soft-delete: NO se puede desactivar un área con tickets activos
 *     (status NOT IN ('cerrado','reabierto')) ni con membresías activas
 *     que la usen como area_key.
 */

function serialize(row) {
  if (!row) return null;
  return {
    id: row.id,
    company_id: row.company_id,
    key: row.key,
    label: row.label,
    sort_order: row.sort_order,
    active: !!row.active,
  };
}

const KEY_REGEX = /^[a-z0-9_-]{1,50}$/;

async function ensureCanReadCompany(companyId, requester) {
  if (requester && requester.isPlatformAdmin) return;
  const memberRepo = await orm.getRepository(orm.UserCompanyMembership);
  const m = await memberRepo.findOne({
    where: { user_id: requester.id, company_id: Number(companyId), active: 1 },
  });
  if (!m) throw forbiddenError('No es miembro de esta empresa.');
}

/**
 * listByCompany — áreas visibles para el requester. Orden estable.
 */
async function listByCompany(companyId, { activeOnly = true, requester } = {}) {
  await ensureCanReadCompany(companyId, requester);
  const repo = await orm.getRepository(orm.CompanyArea);
  const rows = await repo.find({ where: { company_id: Number(companyId) }, order: { sort_order: 'ASC', key: 'ASC' } });
  return (activeOnly ? rows.filter((r) => r.active) : rows).map(serialize);
}

/**
 * create — crea un área en una empresa. Solo platform admin.
 *   - key: slug estable, ^[a-z0-9_-]{1,50}$. Si falta, slugify(label).
 *   - label: nombre humano, max 100.
 *   - sort_order: int default 0.
 */
async function create(companyId, input, requester) {
  if (!requester || !requester.isPlatformAdmin) {
    throw forbiddenError('Solo el administrador de plataforma puede crear áreas.');
  }
  const companyRepo = await orm.getRepository(orm.Company);
  const company = await companyRepo.findOne({ where: { id: Number(companyId) } });
  if (!company) throw notFoundError('Empresa no encontrada.');

  const label = requireString(input && input.label, 'label', 100);
  const providedKey = optionalString(input && input.key, 'key', 50);
  const baseKey = providedKey || slugify(label);
  if (!KEY_REGEX.test(baseKey)) {
    throw validationError('El campo "key" solo puede contener letras minúsculas, números, guiones y guiones bajos (1-50 chars).');
  }
  const sortOrder = input && input.sort_order !== undefined && input.sort_order !== null
    ? Math.max(0, Math.floor(Number(input.sort_order)))
    : 0;

  const repo = await orm.getRepository(orm.CompanyArea);
  // UNIQUE (company_id, key): validamos antes para devolver 409 limpio.
  const existing = await repo.findOne({ where: { company_id: company.id, key: baseKey } });
  if (existing) {
    throw conflictError(`Ya existe un área con el key "${baseKey}" en esta empresa.`);
  }
  const insertResult = await repo.insert({
    company_id: company.id,
    key: baseKey,
    label,
    sort_order: sortOrder,
    active: 1,
  });
  const id = insertResult.identifiers && insertResult.identifiers[0] ? insertResult.identifiers[0].id : null;
  const created = serialize(await repo.findOne({ where: { id } }));

  await auditService.logAsync({
    user_id: requester.id,
    company_id: company.id,
    action_type: 'area:create',
    target_type: 'company_area',
    target_id: created.id,
    target_code: `${company.slug}/${created.key}`,
    description: `Área creada: ${created.label} (${created.key})`,
    new_value: created,
  });
  return created;
}

/**
 * update — actualiza label, sort_order o active. Solo platform admin.
 * `key` NO se renombra (rompería FKs lógicas en tickets/membresías).
 */
async function update(areaId, input, requester) {
  if (!requester || !requester.isPlatformAdmin) {
    throw forbiddenError('Solo el administrador de plataforma puede modificar áreas.');
  }
  const repo = await orm.getRepository(orm.CompanyArea);
  const before = await repo.findOne({ where: { id: Number(areaId) } });
  if (!before) throw notFoundError('Área no encontrada.');

  const patch = {};
  if (input && input.label !== undefined) patch.label = requireString(input.label, 'label', 100);
  if (input && input.sort_order !== undefined && input.sort_order !== null) {
    patch.sort_order = Math.max(0, Math.floor(Number(input.sort_order)));
  }
  if (input && input.active !== undefined) patch.active = input.active ? 1 : 0;
  if (Object.keys(patch).length === 0) return serialize(before);
  await repo.update({ id: before.id }, patch);
  const after = serialize(await repo.findOne({ where: { id: before.id } }));

  await auditService.logAsync({
    user_id: requester.id,
    company_id: before.company_id,
    action_type: 'area:update',
    target_type: 'company_area',
    target_id: before.id,
    target_code: `${before.key}`,
    description: `Área actualizada: ${after.label} (${after.key})`,
    old_value: serialize(before),
    new_value: after,
  });
  return after;
}

/**
 * softDelete — pone active=0. Solo platform admin.
 * Bloquea si el área tiene tickets activos o membresías activas usándola.
 */
async function softDelete(areaId, requester) {
  if (!requester || !requester.isPlatformAdmin) {
    throw forbiddenError('Solo el administrador de plataforma puede desactivar áreas.');
  }
  const repo = await orm.getRepository(orm.CompanyArea);
  const before = await repo.findOne({ where: { id: Number(areaId) } });
  if (!before) throw notFoundError('Área no encontrada.');
  if (!before.active) return serialize(before);

  // Chequeo de tickets activos en esta área.
  const ticketRepo = await orm.getRepository(orm.Ticket);
  const activeTickets = await ticketRepo.count({
    where: {
      company_id: before.company_id,
      area: before.key,
      // status: NOT IN ('cerrado','reabierto') se filtra manualmente.
    },
  });
  const openStatuses = ['recibido', 'asignado', 'en_proceso', 'solucionado'];
  let openCount = 0;
  // El filter simple-enum no soporta `not in` portable; iteramos.
  for (const status of openStatuses) {
    openCount += await ticketRepo.count({
      where: { company_id: before.company_id, area: before.key, status },
    });
  }
  if (openCount > 0) {
    throw conflictError(`No se puede desactivar el área: tiene ${openCount} ticket(s) activo(s).`);
  }
  if (activeTickets > 0) {
    throw conflictError('No se puede desactivar el área: tiene tickets asociados.');
  }

  // Chequeo de membresías activas que usan esta área.
  const memberRepo = await orm.getRepository(orm.UserCompanyMembership);
  const memberUsing = await memberRepo.count({
    where: { company_id: before.company_id, area_key: before.key, active: 1 },
  });
  if (memberUsing > 0) {
    throw conflictError(`No se puede desactivar el área: ${memberUsing} usuario(s) la están usando.`);
  }

  await repo.update({ id: before.id }, { active: 0 });
  const after = serialize(await repo.findOne({ where: { id: before.id } }));
  await auditService.logAsync({
    user_id: requester.id,
    company_id: before.company_id,
    action_type: 'area:delete',
    target_type: 'company_area',
    target_id: before.id,
    target_code: before.key,
    description: `Área desactivada: ${before.label} (${before.key})`,
    old_value: serialize(before),
    new_value: after,
  });
  return after;
}

module.exports = {
  listByCompany,
  create,
  update,
  softDelete,
  _serialize: serialize,
};
