/* Documentado por: Miguel Flores */
'use strict'
const orm = require('../orm');
const { verifyPassword, hashPassword } = require('../utils/password');
const auditService = require('./audit.service');
const {
  validationError,
  notFoundError,
  conflictError,
  forbiddenError,
  requireString,
} = require('../utils/validators');
const { ROLE_VALUES } = require('../orm/enums');
const { scopeUsersByCompany } = require('../utils/scope');
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
 * Convierte una fila de usuario de la base al formato plano expuesto por la API.
 * @param {Object} row - fila cruda de usuario
 * @returns {Object|null} usuario serializado, o null si no se recibió fila
 */
function serialize(row) {
  if (!row)
    return null;
  const isPlatformAdmin = !!row.is_platform_admin;
  return {
    id: row.id,
    username: row.username,
    full_name: row.full_name,
    role: row.role,
    area: row.area || null,
    email: row.email || null,
    avatar_url: row.avatar_url || null,
    active: row.active ? 1 : 0,
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
  const isPlatformAdmin = !!(user && user.is_platform_admin);
  return {
    id: user.id,
    username: user.username,
    full_name: user.full_name,
    role: user.role,
    area: user.area || null,
    email: user.email || null,
    avatar_url: user.avatar_url || null,
    active: !!user.active,
    is_platform_admin: isPlatformAdmin,
    isPlatformAdmin: isPlatformAdmin,
  };
}

/**
 * Busca un usuario por username o email (case-insensitive por collation de SQL Server),
 * probando en orden: username exacto, email exacto, y si el identificador tiene formato
 * de email, el username de la parte local (antes del @) como último recurso.
 * @param {String} identifier - username o email ingresado por el usuario
 * @returns {Promise<Object|null>} usuario encontrado, o null
 */
async function findUserByIdentifier(identifier) {
  const normalized = typeof identifier === 'string' ? identifier.trim() : '';
  if (!normalized) return null;
  const repo = await orm.getRepository(orm.User);

  let user = await repo.findOneBy({ username: normalized });
  if (user) return user;

  user = await repo.findOneBy({ email: normalized });
  if (user) return user;

  if (normalized.includes('@')) {
    const local = normalized.split('@')[0];
    user = await repo.findOneBy({ username: local });
  }
  return user;
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

  const user = await findUserByIdentifier(username);
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
  const repo = await orm.getRepository(orm.User);
  const user = await repo.findOneBy({ id: Number(userId) });
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
  const repo = await orm.getRepository(orm.User);
  const user = await repo.findOneBy({ id: Number(id) });
  if (!user) throw notFoundError('Usuario no encontrado.');
  return serialize(user);
}

/**
 * Crea un nuevo usuario validando todos sus campos, opcionalmente crea su membresía de
 * empresa, gestiona la transferencia del rol de administrador inicial (bootstrap) si
 * corresponde, y notifica la creación en tiempo real.
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

  const repo = await orm.getRepository(orm.User);
  const existing = await repo.findOneBy({ username: cleanUsername });
  if (existing || (cleanEmail && await repo.findOneBy({ email: cleanEmail }))) {
    throw conflictError('El nombre de usuario ya existe.');
  }

  const hash = await hashPassword(password);
  let created;
  try {
    created = await repo.save({
      username: cleanUsername,
      password_hash: hash,
      full_name: cleanFullName,
      role,
      area: cleanArea,
      email: cleanEmail,
      active: true,
    });
  } catch (err) {
    if (err && (err.number === 2627 || err.number === 2601)) {
      throw conflictError('El nombre de usuario ya existe.');
    }
    throw err;
  }

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
}

/**
 * Si el usuario que crea el nuevo registro es la cuenta de administrador inicial (bootstrap) y el usuario creado es SAC, transfiere el rol de administrador de plataforma al nuevo usuario y elimina la cuenta bootstrap. Registra la operación en auditoría.
 * @param {Object} requester - usuario que realiza la creación
 * @param {Object} createdUser - usuario recién creado
 * @returns {Promise<Object>} usuario creado, posiblemente actualizado tras la transferencia
 */
async function transferBootstrapAdminIfNeeded(requester, createdUser) {
  if (!requester || createdUser.role !== 'sac') return createdUser;

  const repo = await orm.getRepository(orm.User);
  const requesterFull = await repo.findOneBy({ id: Number(requester.id) });
  if (!requesterFull || !requesterFull.is_bootstrap) return createdUser;

  try {
    await repo.update({ id: createdUser.id }, { is_platform_admin: true });
    await repo.delete({ id: requesterFull.id });

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
 * Actualiza los datos de un usuario aplicando reglas de negocio: impide auto-desactivación y auto-cambio de rol, protege al único SAC y al único administrador de plataforma, gestiona permisos de administrador de plataforma y notifica el cambio (o la desactivación) en tiempo real.
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

  const repo = await orm.getRepository(orm.User);
  const before = await getById(id);

  const patch = {};
  if ((active !== undefined && (active === 0 || active === false)) || (role !== undefined && role !== 'sac')) {
    if (before.role === 'sac') {
      const sacUsers = await repo.find({ where: { role: 'sac', active: true } });
      if (Array.isArray(sacUsers) && sacUsers.length <= 1) {
        throw forbiddenError('No se puede desactivar o cambiar el rol del único usuario con rol SAC. Crea otro SAC activo primero.');
      }
    }
  }
  if (active !== undefined && (active === 0 || active === false)) {
    if (before.is_platform_admin) {
      const activeAdmins = await repo.count({ where: { active: true, is_platform_admin: true } });
      const otherAdmins = activeAdmins - (before.id === Number(id) ? 1 : 0);
      if (otherAdmins <= 0) {
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
      const activeAdmins = await repo.count({ where: { active: true, is_platform_admin: true } });
      if (activeAdmins - 1 <= 0) {
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
    const conflict = await repo.findOneBy({ username: clean });
    if (conflict && conflict.id !== Number(id)) throw conflictError('El nombre de usuario ya existe.');
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
      const clean = email.trim();
      const conflict = await repo.findOneBy({ email: clean });
      if (conflict && conflict.id !== Number(id)) throw conflictError('Ese correo ya está en uso por otro usuario.');
      patch.email = clean;
    }
  }
  if (active !== undefined) {
    if (typeof active === 'boolean') {
      patch.active = active;
    } else if (active === 1 || active === '1' || active === 'true') {
      patch.active = true;
    } else if (active === 0 || active === '0' || active === 'false') {
      patch.active = false;
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

  if (Object.keys(patch).length > 0) {
    try {
      await repo.update({ id: Number(id) }, patch);
    } catch (err) {
      if (err && (err.number === 2627 || err.number === 2601)) {
        throw conflictError('El nombre de usuario o email ya está en uso.');
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
  const repo = await orm.getRepository(orm.User);
  await repo.update({ id: Number(userId) }, { avatar_url: avatarUrl });
  const after = await getById(userId);
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
  const repo = await orm.getRepository(orm.User);
  const where = {};
  if (role) where.role = role;
  if (active !== undefined) where.active = !!active;
  if (area) where.area = area;
  const rows = await repo.find({ where });

  if (!requester || requester.isPlatformAdmin || requester.role === 'sac' || requester.activeCompanyId == null) {
    return rows.map(serialize);
  }
  const membershipRepo = await orm.getRepository(orm.UserCompanyMembership);
  const memberships = await membershipRepo.find();
  return scopeUsersByCompany(rows, memberships, requester).map(serialize);
}

module.exports = { login, verifyPasswordForUser, getById, sanitize, createUser, updateUser, updateAvatar, listUsers };
