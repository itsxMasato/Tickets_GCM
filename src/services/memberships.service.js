/* Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. */
"use strict";

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

// Emite un evento de membresía. Llega a:
//   - room 'sac' (platform admin, donde está Miguel hoy).
//   - room `company:{company_id}` para miembros futuros de esa empresa.
//   - room `user:{user_id}` para notificar al propio usuario (vía socket
//     de su sesión, con el `user.id` que asigna sockets/index.js).
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
  } catch (e) {
    /* socket no inicializado aún */
  }
}

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
 *   - role: valida contra ROLE_VALUES.
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
    is_default: !!row.is_default,
    active: !!row.active,
    created_at: row.created_at,
    last_seen_at: row.last_seen_at || null,
  };
}

async function loadCompanyOrThrow(companyId) {
  const c = await firestoreData.getCompanyById(Number(companyId), { requester: null });
  if (!c) throw notFoundError('Empresa no encontrada.');
  return c;
}

async function loadUserOrThrow(userId) {
  const u = await firestoreData.getUserById(Number(userId));
  if (!u) throw notFoundError('Usuario no encontrado.');
  return u;
}

function isActiveFlag(value) {
  return value === 1 || value === true || value === '1' || value === 'true';
}

function normalizeMembershipId(value) {
  return value == null ? null : String(value);
}

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
    } catch (_) {
      // Continuar al siguiente fallback si la consulta falla.
    }
  }

  if (!rows.length) {
    try {
      const fallbackRows = await firestoreData.queryCollection('user_company_memberships', [], { limit: 1000 });
      if (Array.isArray(fallbackRows)) rows.push(...fallbackRows);
    } catch (_) {
      // Ignorar y usar el siguiente fallback.
    }
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

async function findMembershipForUserAndCompany(userId, companyId, { activeOnly = false } = {}) {
  const normalizedCompanyId = normalizeMembershipId(companyId);
  const rows = await getMembershipRowsForUser(userId, { activeOnly });
  return rows.find((row) => normalizeMembershipId(row.company_id) === normalizedCompanyId) || null;
}

/**
 * resolveDefaultCompanyId — empresa que se activa automáticamente al iniciar
 * sesión cuando el user tiene una o más membresías activas: la marcada
 * `is_default`, o si no hay ninguna marcada, la primera. `null` si no tiene
 * membresías (mantiene el comportamiento global/legacy de antes de esto).
 */
async function resolveDefaultCompanyId(userId) {
  const rows = await getMembershipRowsForUser(userId, { activeOnly: true });
  if (!rows.length) return null;
  const defaultRow = rows.find((row) => isActiveFlag(row.is_default));
  return Number((defaultRow || rows[0]).company_id);
}

/**
 * isActiveMemberOfCompany — usado para validar el switch de empresa activa:
 * el requester debe tener una membresía activa en esa empresa.
 */
async function isActiveMemberOfCompany(userId, companyId) {
  const membership = await findMembershipForUserAndCompany(userId, companyId, { activeOnly: true });
  return !!membership;
}

/**
 * listByUser — devuelve las membresías del user con la empresa denormalizada.
 * El propio user, platform admin, o SAC (gestiona usuarios/empresas).
 */
async function listByUser(userId, { requester } = {}) {
  const targetUserId = Number(userId);
  if (!requester) throw forbiddenError('Debe iniciar sesión.');
  // Number(...) normaliza: el id "propio" puede llegar como string desde un
  // doc crudo de Firestore (p.ej. login/firebase pasan el user sin pasar por
  // requireAuth todavía) — comparar sin normalizar rompía el self-access
  // ("21" !== 21) y devolvía membresías vacías justo al iniciar sesión.
  if (!requester.isPlatformAdmin && requester.role !== 'sac' && Number(requester.id) !== targetUserId) {
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
 * listByCompany — miembros de una empresa, con datos básicos del user.
 * El requester debe ser miembro o platform admin.
 */
async function listByCompany(companyId, { activeOnly = true, requester } = {}) {
  if (!requester) throw forbiddenError('Debe iniciar sesión.');
  const cid = Number(companyId);
  if (!requester.isPlatformAdmin && requester.role !== 'sac') {
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
 * create — crea una membresía. Solo platform admin (Fase 2).
 *   - role: obligatorio, debe estar en ROLE_VALUES.
 *   - is_default: si true, desmarca el resto del mismo user (transacción).
 */
async function create(userId, input, requester, options = {}) {
  // Allow platform admin as usual. Additionally, support an internal
  // bypass when `options.allowSACCreate` está activo y el requester
  // tiene rol 'sac' (usado por flows admin que crean usuario + membresía).
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
  if (dup) { throw conflictError(`El usuario ya tiene una membresía en "${company.name}".`); }

  // If is_default, clear others for this user
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
 * update — actualiza role, is_default, active. Solo platform admin.
 * Si desactiva, valida que no sea la última activa del user.
 */
/**
 * assertCompanyKeepsCoverage — evita que una empresa quede sin ningun
 * miembro activo, o sin ningun admin_area activo, al desactivar o
 * recategorizar una membresia. Antes solo se chequeaba que no fuera la
 * ULTIMA membresia activa del USUARIO en todo el sistema: una empresa podia
 * quedar completamente sin nadie que trabaje sus tickets mientras el
 * usuario afectado seguia teniendo membresias en OTRAS empresas, sin
 * ningun aviso ni bloqueo.
 */
async function assertCompanyKeepsCoverage(before, { becomesInactive = false, newRole } = {}) {
  if (!before.active) return; // ya estaba inactiva: no cambia la cobertura de la empresa
  const changesRole = newRole !== undefined && newRole !== before.role;
  if (!becomesInactive && !changesRole) return;

  if (becomesInactive) {
    const activeMembers = await firestoreData.countCollection('user_company_memberships', [
      ['company_id', '==', before.company_id], ['active', '==', 1],
    ]);
    // El conteo incluye a `before` (todavia activa en la DB); restamos 1.
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

async function update(membershipId, input, requester, options = {}) {
  // Mismo bypass interno que create(): companies.service.js necesita poder
  // re-rolear a admin_area la membresia existente de un "Encargado" cuando
  // el requester es SAC (no platform admin) creando/editando una empresa.
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
      // Mismo criterio que softDelete(): el piso de "al menos una membresía
      // activa" no aplica a un platform admin, que no depende de ninguna
      // membresía para operar.
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
 * softDelete — pone active=0. Solo platform admin.
 * Regla: no se puede desactivar la última membresía activa del user.
 */
async function softDelete(membershipId, requester) {
  if (!requester || !requester.isPlatformAdmin) throw forbiddenError('Solo el administrador de plataforma puede eliminar membresías.');
  const before = await firestoreData.getDoc('user_company_memberships', Number(membershipId));
  if (!before) throw notFoundError('Membresía no encontrada.');
  if (!before.active) return serialize(before);
  // El piso de "al menos una membresía activa" protege a un usuario común de
  // quedar sin ninguna empresa (sin tenant no puede hacer nada). Un platform
  // admin no depende de ninguna membresía para operar (bypassea el requisito
  // de empresa activa, ver tickets.service.js createTicket) — bloquearlo acá
  // le impediría deshacer una membresía asignada por error.
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
