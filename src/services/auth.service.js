/* Documentado por: Miguel Flores */
'use strict'
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
const { ROLE_VALUES } = require('../orm/enums');
const membershipsService = require('./memberships.service');

const LIMITS = {
  username: { min: 3, max: 50, pattern: /^[a-zA-Z0-9._-]+$/ },
  fullName: { max: 255 },
  email:    { max: 255, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
  password: { min: 4, max: 200 },
};

const VALID_AREAS = ['operaciones', 'logistica', 'mantenimiento', 'sistemas', 'otro'];

/**
 * Emite por socket.io un evento relacionado a un usuario (creación, actualización, desactivación). Silencia errores de socket.
 * @param {String} event - nombre del evento a emitir
 * @param {Object} user - usuario involucrado
 * @param {Object} [opts] - datos adicionales del payload (ej. changes, fanoutSac)
 * @returns {void}
 */
function emitUser(event, user, opts = {}) {
  try {
    const { emit } = require('../sockets');
    emit(event, { user, ...opts }, {
      user: user.id,
      role: opts.fanoutSac === false ? null : 'sac',
    });
  } catch (e) {}
}

/**
 * Determina si un valor de estado de usuario representa "activo", interpretando las distintas formas en que puede venir almacenado (0, false, '0', 'false' se consideran inactivo).
 * @param {*} value - valor crudo del campo active
 * @returns {Boolean} true si el usuario está activo
 */
function isUserActive(value) {
  return value === 0 || value === false || value === '0' || value === 'false' ? false : true;
}

/**
 * Convierte un registro de usuario de Firestore al formato plano expuesto por la API, normalizando el flag de administrador de plataforma.
 * @param {Object} row - registro crudo de usuario
 * @returns {Object|null} usuario serializado, o null si no se recibió registro
 */
function serialize(row) {
  if (!row)
    return null;
  const isPlatformAdmin = row.isPlatformAdmin === true || row.is_platform_admin === true || row.is_platform_admin === 1 || row.isPlatformAdmin === 1 || row.isPlatformAdmin === '1' || row.is_platform_admin === '1';
  return {
    id: row.id,
    username: row.username,
    full_name: row.full_name,
    role: row.role,
    area: row.area || null,
    email: row.email || null,
    avatar_url: row.avatar_url || null,
    active: isUserActive(row.active) ? 1 : 0,
    is_platform_admin: isPlatformAdmin,
    isPlatformAdmin: isPlatformAdmin,
    created_at: row.created_at instanceof Date
      ? row.created_at.toISOString().replace('T', ' ').slice(0, 19)
      : row.created_at,
  };
}

/**
 * Reduce un objeto de usuario a los campos seguros para exponer (sin password_hash), normalizando el flag de administrador de plataforma.
 * @param {Object} user - usuario a sanear
 * @returns {Object} usuario saneado
 */
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

/**
 * Autentica a un usuario por usuario/contraseña, validando que exista, esté activo y que la contraseña coincida.
 * @param {String} username - nombre de usuario o identificador
 * @param {String} password - contraseña en texto plano
 * @returns {Promise<Object>} usuario autenticado saneado
 */
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

/**
 * Verifica que la contraseña ingresada corresponda al usuario indicado (ej. para reautenticación antes de una acción sensible).
 * @param {String|Number} userId - id del usuario
 * @param {String} password - contraseña en texto plano a verificar
 * @returns {Promise<Boolean>} true si la contraseña es correcta
 */
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

/**
 * Obtiene un usuario por id, serializado para la API.
 * @param {String|Number} id - id del usuario
 * @returns {Promise<Object>} usuario serializado
 */
async function getById(id) {
  const user = await firestoreData.getUserById(id);
  if (!user) throw notFoundError('Usuario no encontrado.');
  return serialize(user);
}

/**
 * Crea un nuevo usuario validando todos sus campos, sincroniza la cuenta en Firebase Auth, opcionalmente crea su membresía de empresa, gestiona la transferencia del rol de administrador inicial (bootstrap) si corresponde, y notifica la creación en tiempo real.
 * @param {Object} params - datos del nuevo usuario
 * @param {String} params.username - nombre de usuario
 * @param {String} params.password - contraseña en texto plano
 * @param {String} params.full_name - nombre completo
 * @param {String} params.role - rol asignado
 * @param {String} [params.area] - área asignada
 * @param {String} [params.email] - email del usuario
 * @param {String|Number} [params.company_id] - empresa a la que se lo vincula
 * @param {Object} requester - usuario que realiza la creación
 * @returns {Promise<Object>} usuario creado serializado
 */
async function createUser({ username, password, full_name, role, area, email, company_id } = {}, requester) {
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

    let row = await getById(created.id);
    if (company_id) {
      try {
        await membershipsService.create(created.id, { company_id: Number(company_id), role }, requester, { allowSACCreate: true });
      } catch (memErr) {
        console.warn('[auth.service] membership creation failed during user create:', memErr.stack || memErr.message);
        throw memErr;
      }
    }

    row = await transferBootstrapAdminIfNeeded(requester, row);
    emitUser('user:created', row);
    return row;
  } catch (err) {
    if (err.code === 'CONFLICT') {
      throw conflictError('El nombre de usuario ya existe.');
    }
    throw err;
  }
}

/**
 * Si el usuario que crea el nuevo registro es la cuenta de administrador inicial (bootstrap) y el usuario creado es SAC, transfiere el rol de administrador de plataforma al nuevo usuario y elimina la cuenta bootstrap (incluida su cuenta de Firebase Auth). Registra la operación en auditoría.
 * @param {Object} requester - usuario que realiza la creación
 * @param {Object} createdUser - usuario recién creado
 * @returns {Promise<Object>} usuario creado, posiblemente actualizado tras la transferencia
 */
async function transferBootstrapAdminIfNeeded(requester, createdUser) {
  if (!requester || createdUser.role !== 'sac') return createdUser;

  const requesterFull = await firestoreData.getUserById(requester.id);
  if (!requesterFull || !requesterFull.is_bootstrap) return createdUser;

  try {
    await firestoreData.updateUser(createdUser.id, { is_platform_admin: true });

    const email = deriveAuthEmail(requesterFull);
    if (email) {
      const auth = require('../firebaseAdmin').getAuth();
      try {
        const authUser = await auth.getUserByEmail(email);
        await auth.deleteUser(authUser.uid);
      } catch (e) {
        if (e.code !== 'auth/user-not-found') throw e;
      }
    }
    await firestoreData.deleteUser(requesterFull.id);

    auditService.logAsync({
      user_id: null,
      action_type: 'bootstrap_admin_removed',
      target_type: 'user',
      target_id: requesterFull.id,
      target_code: requesterFull.username,
      description: `Cuenta de administrador inicial "${requesterFull.username}" eliminada automáticamente; el rol de administrador de plataforma pasó a "${createdUser.username}".`,
    }).catch(() => {});

    return await getById(createdUser.id);
  } catch (err) {
    console.warn('[auth.service] no se pudo completar la transferencia del administrador inicial:', err.stack || err.message);
    return createdUser;
  }
}

/**
 * Actualiza los datos de un usuario aplicando reglas de negocio: impide auto-desactivación y auto-cambio de rol, protege al único SAC y al único administrador de plataforma, gestiona permisos de administrador de plataforma, sincroniza cambios con Firebase Auth y notifica el cambio (o la desactivación) en tiempo real.
 * @param {String|Number} id - id del usuario a actualizar
 * @param {Object} [changes] - campos a actualizar (full_name, role, area, active, password, email, username, company_id, is_platform_admin)
 * @param {Object} currentUser - usuario que realiza la actualización
 * @returns {Promise<Object>} usuario actualizado serializado
 */
async function updateUser(
  id,
  { full_name, role, area, active, password, email, username, company_id, is_platform_admin } = {},
  currentUser
) {
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
    if ((active !== undefined && (active === 0 || active === false)) || (role !== undefined && role !== 'sac')) {
      const target = await getById(id);
      if (target.role === 'sac') {
        const sacUsers = await firestoreData.listUsers({ role: 'sac', active: true });
        if (Array.isArray(sacUsers) && sacUsers.length <= 1) {
          throw forbiddenError('No se puede desactivar o cambiar el rol del único usuario con rol SAC. Crea otro SAC activo primero.');
        }
      }
    }
    if (active !== undefined && (active === 0 || active === false)) {
      const target = await getById(id);
      if (target.is_platform_admin) {
        const activeUsers = await firestoreData.listUsers({ active: true });
        const otherAdmins = (activeUsers || []).filter((u) => u.is_platform_admin && Number(u.id) !== Number(id));
        if (otherAdmins.length === 0) {
          throw forbiddenError('No se puede desactivar al único administrador de plataforma. Asigná otro primero.');
        }
      }
    }

  if (is_platform_admin !== undefined) {
    if (!currentUser || !currentUser.isPlatformAdmin) {
      throw forbiddenError('Solo un administrador de plataforma puede otorgar o revocar ese permiso.');
    }
    const wantsPlatformAdmin = !!is_platform_admin;
    if (!wantsPlatformAdmin && before.is_platform_admin) {
      const activeUsers = await firestoreData.listUsers({ active: true });
      const otherAdmins = (activeUsers || []).filter((u) => u.is_platform_admin && Number(u.id) !== Number(id));
      if (otherAdmins.length === 0) {
        throw forbiddenError('No se puede quitar el permiso al único administrador de plataforma. Asigná otro primero.');
      }
    }
    patch.is_platform_admin = wantsPlatformAdmin;
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
 * Actualiza la URL del avatar de un usuario y notifica el cambio en tiempo real.
 * @param {String|Number} userId - id del usuario
 * @param {String} avatarUrl - nueva URL del avatar
 * @returns {Promise<Object>} usuario actualizado serializado
 */
async function updateAvatar(userId, avatarUrl) {
  const before = await getById(userId);
  const row = await firestoreData.updateUser(userId, { avatar_url: avatarUrl });
  const after = serialize(row);
  emitUser('user:updated', after, { changes: { avatar_url: { from: before.avatar_url ?? null, to: after.avatar_url } } });
  return after;
}

/**
 * Lista usuarios aplicando filtros opcionales de rol, estado activo y área, acotado según el alcance del solicitante.
 * @param {Object} [filters] - filtros de listado (role, active, area)
 * @param {Object} [requester] - usuario que realiza la consulta, usado para acotar el alcance
 * @returns {Promise<Array>} usuarios serializados
 */
async function listUsers({ role, active, area } = {}, requester = null) {
  const rows = await firestoreData.listUsers({ role, active, area }, requester);
  return rows.map(serialize);
}

module.exports = { login, verifyPasswordForUser, getById, sanitize, createUser, updateUser, updateAvatar, listUsers };

