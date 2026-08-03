/* Documentado por: Miguel Flores */
'use strict'
const orm = require('../orm');
const validators = require('../utils/validators');
const auditService = require('./audit.service');
const { assertRoleDeletable } = require('../utils/role-guards');

const PERMISSION_KEYS = ['manageUsers','manageCategories','viewReports','viewAllTickets','createTicket','assign'];
const PERMISSION_LABELS = {
  manageUsers: 'Gestionar usuarios',
  manageCategories: 'Gestionar categorías',
  viewReports: 'Ver informes',
  viewAllTickets: 'Ver todos los tickets',
  createTicket: 'Crear tickets',
  assign: 'Asignar tickets',
};
const PERMISSION_DESCRIPTIONS = {
  manageUsers: 'Crear, editar y desactivar cuentas; asignar rol y área.',
  manageCategories: 'Crear, renombrar y desactivar categorías de ticket.',
  viewReports: 'Acceder a reportes y exportaciones del sistema.',
  viewAllTickets: 'Ver tickets de todas las áreas, no sólo los propios.',
  createTicket: 'Aperturar tickets a nombre de cualquier usuario o área.',
  assign: 'Asignar tickets a responsables y reasignar entre áreas.',
};
const CRITICAL_PERMS = new Set(['manageUsers', 'assign', 'createTicket']);

const DEFAULTS = {
  sac: {
    manageUsers: true,
    manageCategories: true,
    viewReports: true,
    viewAllTickets: true,
    createTicket: true,
    assign: true,
  },
  jefe_inmediato: {
    manageUsers: false,
    manageCategories: false,
    viewReports: true,
    viewAllTickets: true,
    createTicket: false,
    assign: false,
  },
  admin_area: {
    manageUsers: false,
    manageCategories: true,
    viewReports: false,
    viewAllTickets: false,
    createTicket: true,
    assign: false,
  },
  supervisor_campo: {
    manageUsers: false,
    manageCategories: false,
    viewReports: false,
    viewAllTickets: false,
    createTicket: true,
    assign: false,
  },
};

/**
 * Valida y normaliza un objeto de permisos recibido en una actualización, exigiendo que estén los 6 permisos definidos y forzando cada valor a booleano.
 * @param {Object} obj - objeto de permisos a normalizar
 * @returns {Object} permisos normalizados (booleanos para cada clave conocida)
 */
function normalizePermissions(obj) {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    const err = new Error('Permisos inválidos: se esperaba un objeto.');
    err.statusCode = 400;
    err.code = 'VALIDATION_ERROR';
    throw err;
  }
  const out = {};
  const incoming = Object.keys(obj);
  for (const k of PERMISSION_KEYS) {
    if (!(k in obj)) {
      const err = new Error(`Falta el permiso "${k}". Envía los 6 permisos.`);
      err.statusCode = 400;
      err.code = 'VALIDATION_ERROR';
      throw err;
    }
    const v = obj[k];
    out[k] = (typeof v === 'boolean') ? v : false;
  }
  const extras = incoming.filter((k) => !PERMISSION_KEYS.includes(k));
  if (extras.length) {
    console.warn(`[roles.service] update: ignorando claves ajenas: ${extras.join(', ')}`);
  }
  return out;
}

/**
 * Lee un objeto de permisos almacenado (o parcial) y devuelve un objeto completo con los 6 permisos conocidos como booleanos.
 * @param {Object} obj - objeto de permisos crudo, posiblemente incompleto
 * @returns {Object} permisos completos como booleanos
 */
function readPermissions(obj) {
  const out = {};
  const safe = (obj && typeof obj === 'object' && !Array.isArray(obj)) ? obj : {};
  for (const k of PERMISSION_KEYS) out[k] = !!safe[k];
  return out;
}

/**
 * Convierte las filas (una por permission_key) de un rol en el objeto de permisos
 * completo, aplicando los valores por defecto del rol para las claves sin fila propia.
 * @param {String} role - código del rol
 * @param {Array<Object>} rows - filas de role_permissions de ese rol
 * @returns {Object} permisos completos como booleanos
 */
function rowsToPermissions(role, rows) {
  const stored = {};
  for (const row of rows) stored[row.permission_key] = row.value;
  return readPermissions(rows.length > 0 ? { ...DEFAULTS[role], ...stored } : (DEFAULTS[role] || {}));
}

/**
 * Devuelve el catálogo estático de definiciones de permisos: claves, etiquetas, descripciones y cuáles son críticos.
 * @returns {Object} definiciones de permisos (keys, labels, descriptions, critical)
 */
function getPermissionDefinitions() {
  return {
    keys: [...PERMISSION_KEYS],
    labels: { ...PERMISSION_LABELS },
    descriptions: { ...PERMISSION_DESCRIPTIONS },
    critical: Array.from(CRITICAL_PERMS),
  };
}

/**
 * Lista los permisos efectivos de todos los roles del sistema (personalizados o por defecto), junto con las definiciones de permisos disponibles.
 * @returns {Promise<Object>} objeto con `roles` (permisos por rol) y `permissions` (definiciones)
 */
async function list() {
  const repo = await orm.getRepository(orm.RolePermission);
  const roles = validators.ROLES;
  const res = {};
  for (const r of roles) {
    const rows = await repo.find({ where: { role: r } });
    res[r] = rowsToPermissions(r, rows);
  }
  return {
    roles: res,
    permissions: getPermissionDefinitions(),
  };
}

/**
 * Obtiene los permisos efectivos de un rol específico (personalizados o por defecto).
 * @param {String} role - código del rol
 * @returns {Promise<Object>} permisos del rol
 */
async function get(role) {
  const repo = await orm.getRepository(orm.RolePermission);
  const rows = await repo.find({ where: { role } });
  return rowsToPermissions(role, rows);
}

/**
 * Actualiza los permisos de un rol, registra auditoría con el detalle de los cambios y notifica por socket si hubo diferencias reales.
 * @param {String} role - código del rol a actualizar
 * @param {Object} body - objeto con los nuevos permisos
 * @param {Object} user - usuario que realiza la actualización
 * @returns {Promise<Object>} permisos finales guardados
 */
async function update(role, body, user) {
  if (!validators.ROLES.includes(role)) {
    const err = new Error('Rol no válido'); err.statusCode = 400; throw err;
  }
  const oldPerms = await get(role);
  const perms = normalizePermissions(body || {});

  const repo = await orm.getRepository(orm.RolePermission);
  for (const key of PERMISSION_KEYS) {
    const existing = await repo.findOneBy({ role, permission_key: key });
    if (existing) {
      await repo.update({ id: existing.id }, { value: perms[key] });
    } else {
      await repo.save({ company_id: null, role, permission_key: key, value: perms[key] });
    }
  }

  const changed = JSON.stringify(oldPerms) !== JSON.stringify(perms);
  if (changed) {
    const diffs = PERMISSION_KEYS.filter((key) => oldPerms[key] !== perms[key])
      .map((key) => `${PERMISSION_LABELS[key] || key}: ${oldPerms[key] ? 'sí' : 'no'} → ${perms[key] ? 'sí' : 'no'}`);

    await auditService.logAsync({
      user_id: user?.id || null,
      action_type: 'role_permissions_updated',
      target_type: 'role',
      target_code: role,
      description: `Actualizó permisos del rol "${validators.ROLE_LABEL?.[role] || role}"${diffs.length ? `: ${diffs.join(', ')}.` : '.'}`,
      old_value: oldPerms,
      new_value: perms,
    });

    const { emit } = require('../sockets');
    emit('role:permissions_updated', {
      role,
      permissions: perms,
      previous: oldPerms,
      updatedBy: user ? { id: user.id, full_name: user.full_name || null, role: user.role || null } : null,
      at: new Date().toISOString(),
    }, { role: 'sac', broadcast: true });
  }

  return perms;
}

module.exports = { list, get, update, deleteRole, deletePermission };

/**
 * Construye un error de solicitud inválida (HTTP 400) con código de error opcional.
 * @param {String} message - mensaje de error
 * @param {String} [code] - código de error, por defecto 'VALIDATION_ERROR'
 * @returns {Error} error con statusCode 400
 */
function badRequest(message, code) {
  const err = new Error(message);
  err.statusCode = 400;
  err.code = code || 'VALIDATION_ERROR';
  return err;
}
/**
 * Construye un error de acceso prohibido (HTTP 403) con código de error opcional.
 * @param {String} message - mensaje de error
 * @param {String} [code] - código de error, por defecto 'FORBIDDEN'
 * @returns {Error} error con statusCode 403
 */
function forbidden(message, code) {
  const err = new Error(message);
  err.statusCode = 403;
  err.code = code || 'FORBIDDEN';
  return err;
}
/**
 * Construye un error de conflicto (HTTP 409) con código de error opcional.
 * @param {String} message - mensaje de error
 * @param {String} [code] - código de error, por defecto 'CONFLICT'
 * @returns {Error} error con statusCode 409
 */
function conflict(message, code) {
  const err = new Error(message);
  err.statusCode = 409;
  err.code = code || 'CONFLICT';
  return err;
}

/**
 * Elimina un rol personalizado del sistema, reasignando a otro rol a todos los usuarios que lo tuvieran (obligatorio si hay usuarios afectados). Impide eliminar roles base del flujo operativo. Registra auditoría y notifica en tiempo real.
 * @param {String} role - código del rol a eliminar
 * @param {Object} body - cuerpo de la solicitud, debe incluir `reassignTo` si hay usuarios con ese rol
 * @param {Object} user - usuario que realiza la eliminación
 * @returns {Promise<void>}
 */
async function deleteRole(role, body, user) {
  if (!validators.ROLES.includes(role)) {
    throw badRequest(`Rol "${role}" no existe.`);
  }
  assertRoleDeletable(role, `El rol "${role}" es inamovible porque forma parte del flujo operativo del sistema.`);

  const userRepo = await orm.getRepository(orm.User);
  const affectedUsers = await userRepo.find({ where: { role } });
  const hasUsers = affectedUsers.length > 0;

  let reassignTo = null;
  if (hasUsers) {
    reassignTo = (body && typeof body.reassignTo === 'string') ? body.reassignTo : null;
    if (!reassignTo) {
      throw conflict(
        `Hay ${affectedUsers.length} ${affectedUsers.length === 1 ? 'usuario' : 'usuarios'} con este rol. Reasígnalos antes de eliminar.`,
        'REASSIGN_REQUIRED'
      );
    }
    if (!validators.ROLES.includes(reassignTo)) {
      throw badRequest(`El rol de reasignación "${reassignTo}" no existe.`);
    }
    if (reassignTo === role) {
      throw badRequest('El rol de reasignación no puede ser el mismo que se elimina.');
    }
    assertRoleDeletable(reassignTo, `No se puede reasignar a "${reassignTo}" porque es un rol base del flujo operativo.`);
  }

  const oldPerms = await get(role);

  if (hasUsers) {
    await userRepo.update({ role }, { role: reassignTo });
  }

  const permRepo = await orm.getRepository(orm.RolePermission);
  await permRepo.delete({ role });

  await auditService.logAsync({
    user_id: user?.id || null,
    action_type: 'role_deleted',
    target_type: 'role',
    target_code: role,
    description: `Eliminó el rol "${validators.ROLE_LABEL[role] || role}"${hasUsers ? ` y reasignó ${affectedUsers.length} ${affectedUsers.length === 1 ? 'usuario' : 'usuarios'} a "${validators.ROLE_LABEL[reassignTo] || reassignTo}"` : ''}.`,
    old_value: { role, permissions: oldPerms, usersReassigned: affectedUsers.length, reassignedTo: reassignTo },
    new_value: null,
  });

  const { emit } = require('../sockets');
  emit('role:deleted', {
    role,
    reassignedTo: reassignTo,
    usersReassigned: affectedUsers.length,
    previousPermissions: oldPerms,
    updatedBy: user ? { id: user.id, full_name: user.full_name || null, role: user.role || null } : null,
    at: new Date().toISOString(),
  }, { role: 'sac', broadcast: true });
}

/**
 * Elimina un permiso del catálogo del sistema, reemplazándolo por otro permiso en los roles que lo tuvieran activo (obligatorio si hay roles afectados), con validaciones adicionales si el permiso es crítico. Registra auditoría y notifica en tiempo real.
 * @param {String} key - clave del permiso a eliminar
 * @param {Object} body - cuerpo de la solicitud, puede incluir `replacement` con el permiso de reemplazo
 * @param {Object} user - usuario que realiza la eliminación
 * @returns {Promise<void>}
 */
async function deletePermission(key, body, user) {
  if (!PERMISSION_KEYS.includes(key)) {
    throw badRequest(`El permiso "${key}" no existe.`);
  }
  const replacement = (body && typeof body.replacement === 'string') ? body.replacement : null;
  if (replacement === key) {
    throw badRequest('El permiso de reemplazo no puede ser el mismo que se elimina.');
  }
  if (replacement && !PERMISSION_KEYS.includes(replacement)) {
    throw badRequest(`El permiso de reemplazo "${replacement}" no existe.`);
  }

  const repo = await orm.getRepository(orm.RolePermission);
  const affectedRoles = [];
  for (const role of validators.ROLES) {
    const rows = await repo.find({ where: { role } });
    const stored = rows.length > 0 ? Object.fromEntries(rows.map((r) => [r.permission_key, r.value])) : null;
    const effective = stored
      ? readPermissions({ ...DEFAULTS[role], ...stored })
      : readPermissions(DEFAULTS[role] || {});

    if (effective[key]) {
      if (!stored && DEFAULTS[role] && DEFAULTS[role][key]) {
        throw conflict(
          `El permiso "${PERMISSION_LABELS[key]}" está activo por defecto en el rol "${validators.ROLE_LABEL[role] || role}". Personaliza el rol (quítalo explícitamente) antes de eliminar el permiso del sistema.`,
          'PERMISSION_IN_USE_BY_DEFAULT'
        );
      }
      affectedRoles.push({ role, hadReplacement: !!effective[replacement] });
    }
  }

  if (affectedRoles.length > 0 && !replacement) {
    throw conflict(
      `${affectedRoles.length} ${affectedRoles.length === 1 ? 'rol usa' : 'roles usan'} el permiso "${PERMISSION_LABELS[key]}". Indica un permiso de reemplazo.`,
      'REPLACEMENT_REQUIRED'
    );
  }

  if (replacement && CRITICAL_PERMS.has(key)) {
    const missing = affectedRoles.filter((r) => !r.hadReplacement);
    if (missing.length > 0) {
      const names = missing.map((r) => validators.ROLE_LABEL[r.role] || r.role).join(', ');
      throw conflict(
        `El permiso "${PERMISSION_LABELS[key]}" es crítico. "${PERMISSION_LABELS[replacement] || replacement}" no está activo en: ${names}. Actívalo primero en esos roles.`,
        'CRITICAL_PERMISSION_REQUIRES_FULL_COVERAGE'
      );
    }
  }

  if (replacement) {
    for (const r of affectedRoles) {
      for (const [permKey, value] of [[key, false], [replacement, true]]) {
        const existing = await repo.findOneBy({ role: r.role, permission_key: permKey });
        if (existing) await repo.update({ id: existing.id }, { value });
        else await repo.save({ company_id: null, role: r.role, permission_key: permKey, value });
      }
    }
  }

  const roleMap = {};
  for (const r of affectedRoles) roleMap[r.role] = true;

  await auditService.logAsync({
    user_id: user?.id || null,
    action_type: 'permission_deleted',
    target_type: 'permission',
    target_code: key,
    description: `Eliminó el permiso "${PERMISSION_LABELS[key]}"${replacement ? ` reemplazándolo por "${PERMISSION_LABELS[replacement]}"` : ''} en ${affectedRoles.length} ${affectedRoles.length === 1 ? 'rol' : 'roles'}.`,
    old_value: { permission: key, replacement, affectedRoles: affectedRoles.length, roleMap },
    new_value: null,
  });

  const { emit } = require('../sockets');
  emit('permission:deleted', {
    permission: key,
    replacement,
    affectedRoles: affectedRoles.length,
    roleMap,
    updatedBy: user ? { id: user.id, full_name: user.full_name || null, role: user.role || null } : null,
    at: new Date().toISOString(),
  }, { role: 'sac', broadcast: true });
}
