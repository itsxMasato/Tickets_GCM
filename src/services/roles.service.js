/* Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. */
'use strict';
const firebaseAdmin = require('../firebaseAdmin');
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

module.exports = { list, get, update };
