/* Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. */
﻿'use strict';
const firestoreData = require('../firestoreData');
const { verifyPassword, hashPassword } = require('../utils/password');
const { syncFirebaseAuthUser } = require('../utils/firebase-auth-sync');
const { deriveAuthEmail } = require('../utils/deriveAuthEmail');
const auditService = require('./audit.service');
const {
  validationError,
  notFoundError,
  conflictError,
  forbiddenError,
  requireString,
  optionalString,
  isOneOf,
} = require('../utils/validators');
// ROLE_VALUES vive en src/orm/enums.js (única fuente canónica del enum de
// roles en backend). Anteriormente se importaba desde validators, que sólo
// exporta ROLES — eso provocaba `Cannot read properties of undefined
// (reading 'includes')` al editar un usuario.
const { ROLE_VALUES } = require('../orm/enums');
const membershipsService = require('./memberships.service');

// Límites duros. Más allá de esto, el sistema rechaza la entrada.
const LIMITS = {
  username: { min: 3, max: 50, pattern: /^[a-zA-Z0-9._-]+$/ },
  fullName: { max: 255 },
  email:    { max: 255, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
  password: { min: 4, max: 200 },
};

// Áreas válidas del sistema (espejo de clients/utils/permissions.js → AREAS).
// Si Firestore/ORM añade un área, se actualiza aquí.
const VALID_AREAS = ['operaciones', 'logistica', 'mantenimiento', 'sistemas', 'otro'];

/**
 * Emite un evento de usuario a las salas correspondientes. Es seguro
 * llamarlo cuando el socket aún no está inicializado.
 *
 * Eventos:
 *   - user:created   → user:{id}, 'sac'
 *   - user:updated   → user:{id} (siempre), 'sac' si cambió role/area/active
 *   - user:deactivated → user:{id} (siempre), 'sac'
 */
function emitUser(event, user, opts = {}) {
  try {
    const { emit } = require('../sockets');
    emit(event, { user, ...opts }, {
      user: user.id,
      role: opts.fanoutSac === false ? null : 'sac',
    });
  } catch (e) {
    /* socket no inicializado aún */
  }
}

function isUserActive(value) {
  return value === 0 || value === false || value === '0' || value === 'false' ? false : true;
}

function serialize(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    full_name: row.full_name,
    role: row.role,
    area: row.area || null,
    email: row.email || null,
    avatar_url: row.avatar_url || null,
    active: isUserActive(row.active) ? 1 : 0,
    created_at: row.created_at instanceof Date
      ? row.created_at.toISOString().replace('T', ' ').slice(0, 19)
      : row.created_at,
  };
}

function sanitize(user) {
  const isPlatformAdmin = user && (user.isPlatformAdmin === true || user.is_platform_admin === true || user.is_platform_admin === 1 || user.isPlatformAdmin === 1 || user.isPlatformAdmin === '1' || user.is_platform_admin === '1');
  return {
    id: user.id,
    username: user.username,
    full_name: user.full_name,
    role: user.role,
    area: user.area || null,
    email: user.email || null,
    avatar_url: user.avatar_url || null,
    active: isUserActive(user.active),
    is_platform_admin: isPlatformAdmin,
    isPlatformAdmin: isPlatformAdmin,
  };
}

async function login(username, password) {
  if (!username || !password) {
    throw validationError('Debe ingresar usuario y contraseña.');
  }

  const user = await firestoreData.getUserByIdentifier(username);
  if (!user) throw validationError('Credenciales inválidas.');
  if (!user.active) throw validationError('Usuario inactivo. Contacte al administrador.');

  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) throw validationError('Credenciales inválidas.');

  return sanitize(user);
}

async function verifyPasswordForUser(userId, password) {
  if (!password) {
    throw validationError('Debe ingresar su contraseña.');
  }
  const user = await firestoreData.getUserById(userId);
  if (!user) {
    throw validationError('Usuario no encontrado.');
  }
  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) {
    throw validationError('Contraseña incorrecta.');
  }
  return true;
}

async function getById(id) {
  const user = await firestoreData.getUserById(id);
  if (!user) throw notFoundError('Usuario no encontrado.');
  return serialize(user);
}

async function createUser({ username, password, full_name, role, area, email, company_id } = {}, requester) {
  // Validación dura. Cada campo se sanitiza ANTES de tocar Firestore:
  //  - username: regex estricto (sólo letras, dígitos, . _ -) + longitudes.
  //  - full_name: requerido, max 255, trim.
  //  - role: debe ser uno de ROLE_VALUES (validators.Roles.includes ya estaba,
  //    ahora con requireString para fallar antes si no llega string).
  //  - area: opcional, debe estar en VALID_AREAS si viene.
  //  - email: opcional, regex RFC-light + max 255.
  //  - password: min 4, max 200 (defensa contra body gigante).
  const cleanUsername = requireString(username, 'Usuario', LIMITS.username.max);
  if (cleanUsername.length < LIMITS.username.min) {
    throw validationError(`El usuario debe tener al menos ${LIMITS.username.min} caracteres.`);
  }
  if (!LIMITS.username.pattern.test(cleanUsername)) {
    throw validationError('El usuario sólo puede contener letras, dígitos, puntos, guiones y guiones bajos.');
  }
  const cleanFullName = requireString(full_name, 'Nombre completo', LIMITS.fullName.max);
  if (!ROLE_VALUES.includes(role)) {
    throw validationError('Rol inválido.');
  }
  let cleanArea = null;
  if (area !== undefined && area !== null && area !== '') {
    if (typeof area !== 'string' || !VALID_AREAS.includes(area)) {
      throw validationError('Área inválida.');
    }
    cleanArea = area;
  }
  let cleanEmail = null;
  if (email !== undefined && email !== null && email !== '') {
    if (typeof email !== 'string' || email.length > LIMITS.email.max || !LIMITS.email.pattern.test(email)) {
      throw validationError('Email inválido.');
    }
    cleanEmail = email.trim();
  }
  if (typeof password !== 'string' || password.length < LIMITS.password.min) {
    throw validationError(`La contraseña debe tener al menos ${LIMITS.password.min} caracteres.`);
  }
  if (password.length > LIMITS.password.max) {
    throw validationError(`La contraseña no puede superar los ${LIMITS.password.max} caracteres.`);
  }

  const hash = await hashPassword(password);
  try {
    const created = await firestoreData.createUser({
      username: cleanUsername,
      password_hash: hash,
      full_name: cleanFullName,
      role,
      area: cleanArea,
      email: cleanEmail,
    });

    await syncFirebaseAuthUser({
      authClient: require('../firebaseAdmin').getAuth(),
      user: {
        username: cleanUsername,
        full_name: cleanFullName,
        email: deriveAuthEmail({ username: cleanUsername, email: cleanEmail }),
      },
      password,
    }).catch((syncErr) => {
      console.warn('[auth.service] firebase auth sync failed on create', syncErr.stack || syncErr.message);
      // Antes esto solo quedaba en el log del servidor, que nadie del
      // equipo revisa — si Firebase Auth queda desincronizado (ej. no se
      // creo la cuenta), el usuario no puede loguearse via el fallback de
      // Firebase y no hay ningun rastro visible en la app para un SAC/admin
      // que investigue. Lo dejamos en /audit para que sea descubrible.
      auditService.logAsync({
        user_id: null,
        action_type: 'firebase_auth_sync_failed',
        target_type: 'user',
        target_id: created.id,
        target_code: cleanUsername,
        description: `No se pudo sincronizar la cuenta de Firebase Auth de "${cleanUsername}" al crearla: ${syncErr.message}`,
        new_value: { username: cleanUsername, context: 'create' },
      }).catch(() => {});
    });

    const row = await getById(created.id);
    // Si vino company_id en el payload, intentamos crear la membresía
    // asociada para que el usuario quede ligado a una empresa desde
    // el momento de su creación. El service de membresías valida
    // unicidad y áreas; permitimos explícitamente que un SAC cree la
    // membresía pasando allowSACCreate = true.
    if (company_id) {
      try {
        await membershipsService.create(created.id, { company_id: Number(company_id), role }, requester, { allowSACCreate: true });
      } catch (memErr) {
        // No revertimos la creación del user (no hay deleteUser helper).
        // Informar y propagar el error para que el caller lo pueda manejar.
        console.warn('[auth.service] membership creation failed during user create:', memErr.stack || memErr.message);
        throw memErr;
      }
    }

    emitUser('user:created', row);
    return row;
  } catch (err) {
    if (err.code === 'CONFLICT') {
      throw conflictError('El nombre de usuario ya existe.');
    }
    throw err;
  }
}

async function updateUser(id, { full_name, role, area, active, password, email, username, company_id } = {}, currentUser) {
  // currentUser viene de req.user (seteado por requireAuth). Se usa para
  // anti-self-demote: un SAC no puede desactivarse ni perder el rol 'sac'.
  if (currentUser && Number(currentUser.id) === Number(id)) {
    if (active === false || active === 0) {
      throw forbiddenError('No puede desactivar su propia cuenta.');
    }
    if (role !== undefined && role !== 'sac') {
      throw forbiddenError('No puede cambiar su propio rol.');
    }
  }

  const before = await getById(id);

  const patch = {};
    // Protección: no permitir desactivar o cambiar el rol del ÚLTIMO SAC.
    // Si el target es SAC y se intenta desactivar o cambiar su rol fuera de 'sac',
    // comprobamos cuántos SAC activos quedan en el sistema.
    if ((active !== undefined && (active === 0 || active === false)) || (role !== undefined && role !== 'sac')) {
      const target = await getById(id);
      if (target.role === 'sac') {
        const sacUsers = await firestoreData.listUsers({ role: 'sac', active: true });
        if (Array.isArray(sacUsers) && sacUsers.length <= 1) {
          throw forbiddenError('No se puede desactivar o cambiar el rol del único usuario con rol SAC. Crea otro SAC activo primero.');
        }
      }
    }

  if (full_name !== undefined) {
    patch.full_name = requireString(full_name, 'Nombre completo', LIMITS.fullName.max);
  }
  if (username !== undefined) {
    const clean = requireString(username, 'Usuario', LIMITS.username.max);
    if (clean.length < LIMITS.username.min) {
      throw validationError(`El usuario debe tener al menos ${LIMITS.username.min} caracteres.`);
    }
    if (!LIMITS.username.pattern.test(clean)) {
      throw validationError('El usuario sólo puede contener letras, dígitos, puntos, guiones y guiones bajos.');
    }
    patch.username = clean;
  }
  if (role !== undefined) {
    if (typeof role !== 'string' || !ROLE_VALUES.includes(role)) {
      throw validationError('Rol inválido.');
    }
    patch.role = role;
  }
  if (area !== undefined) {
    if (area === null || area === '') {
      patch.area = null;
    } else if (typeof area !== 'string' || !VALID_AREAS.includes(area)) {
      throw validationError('Área inválida.');
    } else {
      patch.area = area;
    }
  }
  if (email !== undefined) {
    if (email === null || email === '') {
      patch.email = null;
    } else if (typeof email !== 'string' || email.length > LIMITS.email.max || !LIMITS.email.pattern.test(email)) {
      throw validationError('Email inválido.');
    } else {
      patch.email = email.trim();
    }
  }
  if (active !== undefined) {
    // Aceptamos boolean, 0/1 (lo que mande Firestore o un cliente legacy).
    if (typeof active === 'boolean') {
      patch.active = active ? 1 : 0;
    } else if (active === 1 || active === '1' || active === 'true') {
      patch.active = 1;
    } else if (active === 0 || active === '0' || active === 'false') {
      patch.active = 0;
    } else {
      throw validationError('Estado (active) inválido.');
    }
  }
  if (password) {
    if (typeof password !== 'string' || password.length < LIMITS.password.min) {
      throw validationError(`La contraseña debe tener al menos ${LIMITS.password.min} caracteres.`);
    }
    if (password.length > LIMITS.password.max) {
      throw validationError(`La contraseña no puede superar los ${LIMITS.password.max} caracteres.`);
    }
    patch.password_hash = await hashPassword(password);
  }

  if (Object.keys(patch).length === 0 && company_id === undefined) {
    return before;
  }

  let row = before;
  if (Object.keys(patch).length > 0) {
    try {
      row = await firestoreData.updateUser(id, patch);
    } catch (err) {
      if (err.code === 'NOT_FOUND') {
        throw notFoundError('Usuario no encontrado.');
      }
      if (err.code === 'CONFLICT') {
        throw conflictError(err.message);
      }
      throw err;
    }
  }

  // Asignar empresa a un usuario existente (para altas hechas antes de la
  // migración multi-tenant, que quedaron sin membresía). Si ya tiene una
  // membresía en esa empresa, no hacemos nada (idempotente); cualquier otro
  // error se propaga.
  if (company_id) {
    try {
      await membershipsService.create(
        id,
        { company_id: Number(company_id), role: patch.role || before.role },
        currentUser,
        { allowSACCreate: true },
      );
    } catch (memErr) {
      if (memErr.code !== 'CONFLICT') {
        console.warn('[auth.service] membership creation failed during user update:', memErr.stack || memErr.message);
        throw memErr;
      }
    }
  }

  const shouldSyncFirebase = password || patch.email !== undefined || patch.username !== undefined || patch.full_name !== undefined;
  if (shouldSyncFirebase) {
    const newEmail = deriveAuthEmail({
      username: patch.username !== undefined ? patch.username : before.username,
      email: patch.email !== undefined ? patch.email : before.email,
    });
    const currentEmail = deriveAuthEmail({ username: before.username, email: before.email });

    await syncFirebaseAuthUser({
      authClient: require('../firebaseAdmin').getAuth(),
      user: {
        username: patch.username !== undefined ? patch.username : before.username,
        full_name: patch.full_name !== undefined ? patch.full_name : before.full_name,
        email: newEmail,
      },
      currentEmail,
      password,
    }).catch((syncErr) => {
      console.warn('[auth.service] firebase auth sync failed on update', syncErr.stack || syncErr.message);
      // Ver comentario equivalente en create(): sin esto, un cambio de
      // password/email/username que falla al sincronizar con Firebase Auth
      // queda desincronizado en silencio (Firestore actualizado, Firebase
      // Auth con las credenciales viejas) sin ningun rastro visible.
      auditService.logAsync({
        user_id: null,
        action_type: 'firebase_auth_sync_failed',
        target_type: 'user',
        target_id: id,
        target_code: patch.username !== undefined ? patch.username : before.username,
        description: `No se pudo sincronizar la cuenta de Firebase Auth de "${before.username}" al actualizarla: ${syncErr.message}`,
        new_value: { fields_changed: Object.keys(patch), context: 'update' },
      }).catch(() => {});
    });
  }
  const after = await getById(id);

  // Decidir qué evento emitir.
  // - Si pasó de activo a inactivo, priorizamos 'user:deactivated' (un
  //   evento más fuerte, fácil de filtrar en el cliente).
  // - Si cambió role/area, 'user:updated' con diff explícito.
  // - Para cambios triviales (full_name, email, password) también
  //   emitimos 'user:updated' para que la vista de usuarios refresque.
  if (before.active && !after.active) {
    emitUser('user:deactivated', after);
  } else {
    const changes = {};
    for (const key of ['full_name', 'role', 'area', 'active', 'email', 'username']) {
      if (before[key] !== after[key]) changes[key] = { from: before[key] ?? null, to: after[key] ?? null };
    }
    emitUser('user:updated', after, { changes });
  }
  return after;
}

/**
 * updateAvatar — autoservicio: cualquier usuario autenticado puede cambiar
 * SU PROPIA foto de perfil (a diferencia de updateUser, que solo puede
 * llamar SAC). El caller (auth.routes.js) ya se aseguró de borrar el
 * archivo físico anterior antes de llamar esto.
 */
async function updateAvatar(userId, avatarUrl) {
  const before = await getById(userId);
  const row = await firestoreData.updateUser(userId, { avatar_url: avatarUrl });
  const after = serialize(row);
  emitUser('user:updated', after, { changes: { avatar_url: { from: before.avatar_url ?? null, to: after.avatar_url } } });
  return after;
}

async function listUsers({ role, active, area } = {}, requester = null) {
  const rows = await firestoreData.listUsers({ role, active, area }, requester);
  return rows.map(serialize);
}

module.exports = { login, verifyPasswordForUser, getById, sanitize, createUser, updateUser, updateAvatar, listUsers };
