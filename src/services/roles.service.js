/* Documentado por: Miguel Flores */
'use strict'
const firebaseAdmin = require('../firebaseAdmin');
const firestoreData = require('../firestoreData');
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

function readPermissions(obj) {
  const out = {};
  const safe = (obj && typeof obj === 'object' && !Array.isArray(obj)) ? obj : {};
  for (const k of PERMISSION_KEYS) out[k] = !!safe[k];
  return out;
}

function getPermissionDefinitions() {
  return {
    keys: [...PERMISSION_KEYS],
    labels: { ...PERMISSION_LABELS },
    descriptions: { ...PERMISSION_DESCRIPTIONS },
    critical: Array.from(CRITICAL_PERMS),
  };
}

async function list() {
  firebaseAdmin.init();
  const db = firebaseAdmin.getFirestoreInstance();
  const roles = validators.ROLES;
  const res = {};
  for (const r of roles) {
    const snap = await db.collection('role_permissions').doc(r).get();
    if (snap.exists) {
      res[r] = readPermissions(snap.data() || {});
    } else {
      res[r] = readPermissions(DEFAULTS[r] || {});
    }
  }
  return {
    roles: res,
    permissions: getPermissionDefinitions(),
  };
}

async function get(role) {
  firebaseAdmin.init();
  const db = firebaseAdmin.getFirestoreInstance();
  const snap = await db.collection('role_permissions').doc(role).get();
  if (snap.exists) return readPermissions(snap.data() || {});
  return readPermissions(DEFAULTS[role] || {});
}

async function update(role, body, user) {
  firebaseAdmin.init();
  const db = firebaseAdmin.getFirestoreInstance();
  if (!validators.ROLES.includes(role)) {
    const err = new Error('Rol no válido'); err.statusCode = 400; throw err;
  }
  const oldPerms = await get(role);
  const perms = normalizePermissions(body || {});
  await db.collection('role_permissions').doc(role).set(perms, { merge: true });

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

function badRequest(message, code) {
  const err = new Error(message);
  err.statusCode = 400;
  err.code = code || 'VALIDATION_ERROR';
  return err;
}
function forbidden(message, code) {
  const err = new Error(message);
  err.statusCode = 403;
  err.code = code || 'FORBIDDEN';
  return err;
}
function conflict(message, code) {
  const err = new Error(message);
  err.statusCode = 409;
  err.code = code || 'CONFLICT';
  return err;
}

async function deleteRole(role, body, user) {
  firebaseAdmin.init();
  const db = firebaseAdmin.getFirestoreInstance();

  if (!validators.ROLES.includes(role)) {
    throw badRequest(`Rol "${role}" no existe.`);
  }
  assertRoleDeletable(role, `El rol "${role}" es inamovible porque forma parte del flujo operativo del sistema.`);

  const affectedUsers = await firestoreData.listUsers({ role });
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
    await Promise.all(affectedUsers.map((u) => firestoreData.updateUser(u.id, { role: reassignTo })));
  }

  await db.collection('role_permissions').doc(role).set({});

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

async function deletePermission(key, body, user) {
  firebaseAdmin.init();
  const db = firebaseAdmin.getFirestoreInstance();

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

  const snap = await db.collection('role_permissions').get();
  const storedRoles = {};
  for (const doc of snap.docs) storedRoles[doc.id] = doc.data() || {};

  const affectedRoles = [];
  for (const role of validators.ROLES) {
    const stored = storedRoles[role];
    const effective = stored
      ? readPermissions(stored)
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

  const roleMap = {};
  for (const r of affectedRoles) roleMap[r.role] = true;

  if (replacement) {
    const batch = db.batch();
    for (const r of affectedRoles) {
      const ref = db.collection('role_permissions').doc(r.role);
      batch.set(ref, { [key]: false, [replacement]: true }, { merge: true });
    }
    await batch.commit();
  } else
    {}

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

