/* Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. */
'use strict';
const firebaseAdmin = require('../firebaseAdmin');
const firestoreData = require('../firestoreData');
const validators = require('../utils/validators');
const auditService = require('./audit.service');

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

// Definición por defecto de permisos por rol (se usan si no hay documento en Firestore)
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
  // Reglas duras anti-extraños y anti-borrado (usada en el WRITE path).
  //  1. Si obj no es objeto, rechazamos.
  //  2. Sólo aceptamos las 6 claves de PERMISSION_KEYS. Cualquier otra
  //     se ignora silenciosamente (defensa contra prototype-pollution y
  //     payloads malformados).
  //  3. Si falta alguna de las 6 claves, rechazamos con 400 (anti-borrado:
  //     un cliente con bug no puede borrar un permiso por omisión).
  //  4. Cada valor debe ser boolean puro; cualquier otro tipo se interpreta
  //     como false (defensa contra JSON malformado).
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
  // Filtrar claves ajenas: no las aplicamos. Si llegan, log para auditoría
  // de intentos de smuggling. No es fatal: el cliente puede tener campos
  // extra no críticos en su payload.
  const extras = incoming.filter((k) => !PERMISSION_KEYS.includes(k));
  if (extras.length) {
    console.warn(`[roles.service] update: ignorando claves ajenas: ${extras.join(', ')}`);
  }
  return out;
}

function readPermissions(obj) {
  // Versión laxa usada en el READ path (list/get): completa claves
  // faltantes con `false`. Esto protege contra documentos de Firestore
  // antiguos que no tengan las 6 claves — al leerlos, devolvemos 6
  // booleanos sin tirar 500.
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

    // Tiempo real: todos los SAC conectados ven el cambio al instante.
    // También lo emitimos a la sala 'tickets' para que cualquier vista
    // que cachee permisos pueda invalidar su cache si lo necesita.
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

// ─────────────────────────────────────────────────────────────────────────
// Eliminación de roles y permisos
//
// deleteRole(role, body, user)
//   Body: { reassignTo: 'admin_area' }   // requerido si hay usuarios
//   Reglas:
//     - role === 'sac'                    → 403 (rol del sistema, inamovible)
//     - role ∉ validators.ROLES           → 400
//     - usuarios con ese rol > 0 y sin reassignTo (o inválido) → 409
//
// deletePermission(key, body, user)
//   Body: { replacement: 'createTicket' }  // requerido si hay roles usándolo
//   Reglas:
//     - key ∉ PERMISSION_KEYS             → 400
//     - replacement === key               → 400
//     - reemplazo obligatorio si hay roles con permissions[key] === true
//     - si key ∈ CRITICAL_PERMS, replacement debe estar activo en TODOS
//       los roles donde estaba key (evita "apagué manageUsers y nadie
//       puede administrar")
//     - si key está activo en DEFAULTS de algún rol, 409 — el permiso
//       no se puede borrar del sistema mientras el default lo incluya
// ─────────────────────────────────────────────────────────────────────────

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
  // Defensa crítica: 'sac' es la última línea de defensa operativa. Jamás
  // se borra. Si se borrara, el sistema quedaría sin nadie que pueda
  // gestionar permisos (que es exactamente lo que esta pantalla permite).
  if (role === 'sac') {
    throw forbidden('El rol SAC es inamovible: es la única cuenta que puede gestionar permisos.', 'ROLE_PROTECTED');
  }

  // Lookup de usuarios afectados.
  const affectedUsers = await firestoreData.listUsers({ role });
  const hasUsers = affectedUsers.length > 0;

  // Validación de reassignTo.
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
  }

  // Snapshot de los permisos actuales para el audit log.
  const oldPerms = await get(role);

  // Reasignar usuarios en paralelo.
  if (hasUsers) {
    await Promise.all(affectedUsers.map((u) => firestoreData.updateUser(u.id, { role: reassignTo })));
  }

  // Borrar el doc de permisos del rol.
  await db.collection('role_permissions').doc(role).delete();

  // Audit log.
  await auditService.logAsync({
    user_id: user?.id || null,
    action_type: 'role_deleted',
    target_type: 'role',
    target_code: role,
    description: `Eliminó el rol "${validators.ROLE_LABEL[role] || role}"${hasUsers ? ` y reasignó ${affectedUsers.length} ${affectedUsers.length === 1 ? 'usuario' : 'usuarios'} a "${validators.ROLE_LABEL[reassignTo] || reassignTo}"` : ''}.`,
    old_value: { role, permissions: oldPerms, usersReassigned: affectedUsers.length, reassignedTo: reassignTo },
    new_value: null,
  });

  // Realtime.
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

  // 1) Detectar roles donde `key` está activo.
  //   Combinamos dos fuentes: docs en Firestore + DEFAULTS hardcoded.
  //   Si un rol está en defaults con key=true, el permiso no se puede
  //   borrar — el sistema lo bloquearía con 409.
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
      // ¿El permiso está activo por default y el rol nunca se customizó?
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

  // Defensa de permisos críticos: si replacement no queda activo en TODOS
  // los roles donde estaba key, rechazamos. Evita que un SAC apague
  // manageUsers y nadie pueda volver a encenderlo.
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

  // 2) Aplicar el cambio. Set atómico: key=false, replacement=true (merge).
  //   Si el rol ya tenía replacement=true, el merge lo deja igual (idempotente).
  const roleMap = {};
  for (const r of affectedRoles) roleMap[r.role] = true;

  if (replacement) {
    const batch = db.batch();
    for (const r of affectedRoles) {
      const ref = db.collection('role_permissions').doc(r.role);
      batch.set(ref, { [key]: false, [replacement]: true }, { merge: true });
    }
    await batch.commit();
  } else {
    // replacement nulo + 0 affectedRoles ya se manejó arriba con 409.
    // Este branch queda solo si affectedRoles=[] (todos los roles tienen
    // key=false y nunca se customizó). No hay nada que escribir.
  }

  // Audit log.
  await auditService.logAsync({
    user_id: user?.id || null,
    action_type: 'permission_deleted',
    target_type: 'permission',
    target_code: key,
    description: `Eliminó el permiso "${PERMISSION_LABELS[key]}"${replacement ? ` reemplazándolo por "${PERMISSION_LABELS[replacement]}"` : ''} en ${affectedRoles.length} ${affectedRoles.length === 1 ? 'rol' : 'roles'}.`,
    old_value: { permission: key, replacement, affectedRoles: affectedRoles.length, roleMap },
    new_value: null,
  });

  // Realtime.
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
