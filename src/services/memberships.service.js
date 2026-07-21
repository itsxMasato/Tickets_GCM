/* Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. */
'use strict';

const orm = require('../orm');
const { ROLE_VALUES } = require('../orm/enums');
const {
  requireString,
  optionalString,
  optionalEnum,
  validationError,
  notFoundError,
  conflictError,
  forbiddenError,
} = require('../utils/validators');
const auditService = require('./audit.service');

/**
 * memberships.service — CRUD de membresías usuario ↔ empresa.
 *
 * Reglas:
 *   - Multi-membresía: un usuario puede pertenecer a N empresas con rol
 *     y área distintos en cada una. La membresía es la fuente operativa
 *     de "qué puede hacer este user en esta empresa".
 *   - listByUser: el propio user o platform admin.
 *   - listByCompany: miembros de la empresa (o platform admin).
 *   - create/update/softDelete: solo platform admin en Fase 2.
 *     Fase 7 habilitará `manageUsers` por empresa (override de role_permissions).
 *   - role: valida contra ROLE_VALUES. area_key: valida contra las áreas
 *     activas de esa empresa. Si se manda area_key y la empresa no tiene
 *     esa área activa, error 400.
 *   - UNIQUE (user_id, company_id): se valida antes para devolver 409 limpio.
 *   - is_default: si true, transacción para desmarcar el resto del mismo user.
 *   - Soft-delete / desactivar: NO se puede borrar/desactivar la ÚLTIMA
 *     membresía activa del user (quedaría sin tenant).
 */

function serialize(row) {
  if (!row) return null;
  return {
    id: row.id,
    user_id: row.user_id,
    company_id: row.company_id,
    role: row.role,
    area_key: row.area_key || null,
    is_default: !!row.is_default,
    active: !!row.active,
    created_at: row.created_at,
    last_seen_at: row.last_seen_at,
  };
}

async function loadCompanyOrThrow(companyId) {
  const repo = await orm.getRepository(orm.Company);
  const c = await repo.findOne({ where: { id: Number(companyId) } });
  if (!c) throw notFoundError('Empresa no encontrada.');
  return c;
}

async function loadUserOrThrow(userId) {
  const repo = await orm.getRepository(orm.User);
  const u = await repo.findOne({ where: { id: Number(userId) } });
  if (!u) throw notFoundError('Usuario no encontrado.');
  return u;
}

/**
 * listByUser — devuelve las membresías del user con la empresa denormalizada.
 * Solo el propio user o platform admin.
 */
async function listByUser(userId, { requester } = {}) {
  const targetUserId = Number(userId);
  if (!requester) throw forbiddenError('Debe iniciar sesión.');
  if (!requester.isPlatformAdmin && requester.id !== targetUserId) {
    throw forbiddenError('Solo puede ver sus propias membresías.');
  }
  await loadUserOrThrow(targetUserId);
  const repo = await orm.getRepository(orm.UserCompanyMembership);
  const companyRepo = await orm.getRepository(orm.Company);
  const rows = await repo.find({ where: { user_id: targetUserId } });
  const companyIds = [...new Set(rows.map((r) => r.company_id))];
  const companies = companyIds.length > 0 ? await companyRepo.find({ where: companyIds.map((id) => ({ id })) }) : [];
  const companyById = new Map(companies.map((c) => [c.id, c]));
  return rows.map((m) => {
    const base = serialize(m);
    const c = companyById.get(m.company_id);
    if (c) {
      base.company = {
        id: c.id,
        name: c.name,
        slug: c.slug,
        color: c.color || null,
        logo_url: c.logo_url || null,
      };
    }
    return base;
  });
}

/**
 * listByCompany — miembros de una empresa, con datos básicos del user.
 * El requester debe ser miembro o platform admin.
 */
async function listByCompany(companyId, { activeOnly = true, requester } = {}) {
  if (!requester) throw forbiddenError('Debe iniciar sesión.');
  const cid = Number(companyId);
  if (!requester.isPlatformAdmin) {
    const memberRepo = await orm.getRepository(orm.UserCompanyMembership);
    const isMember = await memberRepo.findOne({ where: { user_id: requester.id, company_id: cid, active: 1 } });
    if (!isMember) throw forbiddenError('No es miembro de esta empresa.');
  }
  await loadCompanyOrThrow(cid);
  const repo = await orm.getRepository(orm.UserCompanyMembership);
  const userRepo = await orm.getRepository(orm.User);
  const rows = await repo.find({ where: { company_id: cid } });
  const filtered = activeOnly ? rows.filter((m) => m.active) : rows;
  const userIds = [...new Set(filtered.map((m) => m.user_id))];
  const users = userIds.length > 0 ? await userRepo.find({ where: userIds.map((id) => ({ id })) }) : [];
  const userById = new Map(users.map((u) => [u.id, u]));
  return filtered.map((m) => {
    const base = serialize(m);
    const u = userById.get(m.user_id);
    if (u) {
      base.user = { id: u.id, username: u.username, full_name: u.full_name };
    }
    return base;
  });
}

async function validateAreaKey(companyId, areaKey) {
  if (!areaKey) return;
  const repo = await orm.getRepository(orm.CompanyArea);
  const a = await repo.findOne({ where: { company_id: companyId, key: areaKey, active: 1 } });
  if (!a) {
    throw validationError(`El área "${areaKey}" no existe o está inactiva en esta empresa.`);
  }
}

/**
 * create — crea una membresía. Solo platform admin (Fase 2).
 *   - role: obligatorio, debe estar en ROLE_VALUES.
 *   - area_key: opcional; si se manda, debe ser un área activa de la empresa.
 *   - is_default: si true, desmarca el resto del mismo user (transacción).
 */
async function create(userId, input, requester) {
  if (!requester || !requester.isPlatformAdmin) {
    throw forbiddenError('Solo el administrador de plataforma puede asignar membresías.');
  }
  const targetUserId = Number(userId);
  const user = await loadUserOrThrow(targetUserId);
  const companyId = Number(input && input.company_id);
  if (!companyId) throw validationError('El campo "company_id" es obligatorio.');
  const company = await loadCompanyOrThrow(companyId);
  const role = optionalEnum(input && input.role, 'role', ROLE_VALUES);
  if (!role) throw validationError('El campo "role" es obligatorio.');
  const areaKey = optionalString(input && input.area_key, 'area_key', 50);
  await validateAreaKey(company.id, areaKey);
  const isDefault = !!(input && input.is_default);

  const repo = await orm.getRepository(orm.UserCompanyMembership);
  const dup = await repo.findOne({ where: { user_id: user.id, company_id: company.id } });
  if (dup) {
    throw conflictError(`El usuario ya tiene una membresía en "${company.name}".`);
  }

  const dataSource = await orm.getDataSource();
  const created = await dataSource.transaction(async (manager) => {
    const txRepo = manager.getRepository(orm.UserCompanyMembership);
    if (isDefault) {
      await txRepo.update({ user_id: user.id, is_default: 1 }, { is_default: 0 });
    }
    const result = await txRepo.insert({
      user_id: user.id,
      company_id: company.id,
      role,
      area_key: areaKey,
      active: 1,
      is_default: isDefault ? 1 : 0,
    });
    const id = result.identifiers && result.identifiers[0] ? result.identifiers[0].id : null;
    return txRepo.findOne({ where: { id } });
  });

  const out = serialize(created);
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
  return out;
}

/**
 * update — actualiza role, area_key, is_default, active. Solo platform admin.
 * Si desactiva, valida que no sea la última activa del user.
 */
async function update(membershipId, input, requester) {
  if (!requester || !requester.isPlatformAdmin) {
    throw forbiddenError('Solo el administrador de plataforma puede modificar membresías.');
  }
  const repo = await orm.getRepository(orm.UserCompanyMembership);
  const before = await repo.findOne({ where: { id: Number(membershipId) } });
  if (!before) throw notFoundError('Membresía no encontrada.');

  const patch = {};
  if (input && input.role !== undefined) {
    const role = optionalEnum(input.role, 'role', ROLE_VALUES);
    if (!role) throw validationError('El campo "role" no es válido.');
    patch.role = role;
  }
  if (input && input.area_key !== undefined) {
    const areaKey = optionalString(input.area_key, 'area_key', 50);
    if (areaKey) await validateAreaKey(before.company_id, areaKey);
    patch.area_key = areaKey;
  }
  const wantsDefault = input && input.is_default !== undefined ? !!input.is_default : null;
  const wantsActive = input && input.active !== undefined ? !!input.active : null;
  if (wantsActive !== null) {
    if (!wantsActive) {
      // Validar que no quede sin membresías activas.
      const others = await repo.count({ where: { user_id: before.user_id, active: 1 } });
      if (before.active && others <= 1) {
        throw conflictError('No se puede desactivar la última membresía activa del usuario.');
      }
    }
    patch.active = wantsActive ? 1 : 0;
  }
  if (wantsDefault !== null) patch.is_default = wantsDefault ? 1 : 0;

  const dataSource = await orm.getDataSource();
  const after = await dataSource.transaction(async (manager) => {
    const txRepo = manager.getRepository(orm.UserCompanyMembership);
    if (wantsDefault === true) {
      await txRepo.update({ user_id: before.user_id, is_default: 1 }, { is_default: 0 });
    }
    if (Object.keys(patch).length > 0) {
      await txRepo.update({ id: before.id }, patch);
    }
    return txRepo.findOne({ where: { id: before.id } });
  });

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
  return out;
}

/**
 * softDelete — pone active=0. Solo platform admin.
 * Regla: no se puede desactivar la última membresía activa del user.
 */
async function softDelete(membershipId, requester) {
  if (!requester || !requester.isPlatformAdmin) {
    throw forbiddenError('Solo el administrador de plataforma puede eliminar membresías.');
  }
  const repo = await orm.getRepository(orm.UserCompanyMembership);
  const before = await repo.findOne({ where: { id: Number(membershipId) } });
  if (!before) throw notFoundError('Membresía no encontrada.');
  if (!before.active) return serialize(before);
  const others = await repo.count({ where: { user_id: before.user_id, active: 1 } });
  if (others <= 1) {
    throw conflictError('No se puede eliminar la última membresía activa del usuario.');
  }
  await repo.update({ id: before.id }, { active: 0 });
  const after = serialize(await repo.findOne({ where: { id: before.id } }));
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
  return after;
}

module.exports = {
  listByUser,
  listByCompany,
  create,
  update,
  softDelete,
  _serialize: serialize,
};
