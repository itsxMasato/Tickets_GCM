/* Documentado por: Miguel Flores */
'use strict'
const orm = require('../orm');
const { validationError, forbiddenError, notFoundError } = require('../utils/validators');
const { scopeByCompany } = require('../utils/scope');

/**
 * Valida que el usuario tenga permiso para modificar un proveedor: los admins de plataforma o proveedores globales pasan siempre; el resto solo puede tocar proveedores de su propia empresa.
 * @param {Object} provider - proveedor a validar
 * @param {Object} user - usuario que intenta modificarlo
 * @returns {void}
 */
function assertCanManageProvider(provider, user) {
  if (!user || user.isPlatformAdmin) return;
  if (provider.company_id == null) return;
  if (String(provider.company_id) !== String(user.activeCompanyId)) {
    throw forbiddenError('No puede modificar proveedores de otra empresa.');
  }
}

/**
 * Convierte una fila de proveedor de la base al formato plano expuesto por la API.
 * @param {Object} row - fila cruda de proveedor
 * @returns {Object|null} proveedor serializado, o null si no se recibió fila
 */
function serialize(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    company_id: row.company_id ?? null,
    active: row.active ? 1 : 0,
    created_at: row.created_at,
  };
}

/**
 * Emite por socket.io un evento de cambio de proveedor a los usuarios con rol SAC. Silencia errores de socket.
 * @param {String} event - nombre del evento a emitir
 * @param {Object} provider - proveedor involucrado
 * @param {Object} [opts] - datos adicionales a incluir en el payload del evento (ej. changes)
 * @returns {void}
 */
function emitProvider(event, provider, opts = {}) {
  try {
    const { emit } = require('../sockets');
    emit(event, { provider, ...opts }, { role: 'sac' });
  } catch (e) {}
}

/**
 * Lista los proveedores visibles para el usuario, opcionalmente filtrando solo los activos.
 * @param {Object} [options] - opciones de listado
 * @param {Boolean} [options.activeOnly=true] - si true, excluye proveedores inactivos
 * @param {Object} [user] - usuario que realiza la consulta, usado para acotar por empresa
 * @returns {Promise<Array>} proveedores serializados
 */
async function list({ activeOnly = true } = {}, user = null) {
  const repo = await orm.getRepository(orm.Provider);
  const where = activeOnly ? { active: true } : {};
  let rows = await repo.find({ where });
  if (user && !user.isPlatformAdmin) rows = scopeByCompany(rows, user.activeCompanyId);
  return rows.map(serialize);
}

/**
 * Crea un nuevo proveedor y notifica a SAC en tiempo real.
 * @param {String} name - nombre del proveedor
 * @param {Object} [user] - usuario que lo crea
 * @returns {Promise<Object>} proveedor creado serializado
 */
async function create(name, user = null) {
  const normalizedName = typeof name === 'string' ? name.trim() : '';
  if (!normalizedName) throw validationError('El nombre del proveedor es obligatorio.');
  const repo = await orm.getRepository(orm.Provider);
  const companyId = user && user.activeCompanyId != null ? Number(user.activeCompanyId) : null;
  const existing = await repo.findOne({ where: { name: normalizedName, company_id: companyId } });
  if (existing) throw validationError('Ya existe un proveedor con ese nombre.');
  const row = await repo.save({ name: normalizedName, company_id: companyId, active: true });
  const created = serialize(row);
  emitProvider('provider:created', created);
  return created;
}

/**
 * Actualiza el nombre y/o estado activo de un proveedor, valida permisos por empresa y notifica los cambios a SAC.
 * @param {String|Number} id - id del proveedor a actualizar
 * @param {Object} [changes] - campos a actualizar
 * @param {String} [changes.name] - nuevo nombre
 * @param {Boolean} [changes.active] - nuevo estado activo
 * @param {Object} [user] - usuario que realiza la actualización
 * @returns {Promise<Object>} proveedor actualizado serializado
 */
async function update(id, { name, active } = {}, user = null) {
  const repo = await orm.getRepository(orm.Provider);
  const before = await repo.findOneBy({ id: Number(id) });
  if (before) assertCanManageProvider(before, user);
  if (!before) throw notFoundError('Proveedor no encontrado.');

  const patch = {};
  if (name !== undefined) {
    const normalizedName = typeof name === 'string' ? name.trim() : '';
    if (!normalizedName) throw validationError('El nombre no puede estar vacío.');
    const exists = await repo.findOne({ where: { name: normalizedName, company_id: before.company_id ?? null } });
    if (exists && exists.id !== before.id) throw validationError('Ya existe un proveedor con ese nombre.');
    patch.name = normalizedName;
  }
  if (active !== undefined) patch.active = !!active;

  if (Object.keys(patch).length > 0) await repo.update({ id: before.id }, patch);
  const row = Object.keys(patch).length > 0 ? await repo.findOneBy({ id: before.id }) : before;
  const after = serialize(row);

  const changes = {};
  if (name !== undefined && before.name !== after.name) changes.name = { from: before.name, to: after.name };
  if (active !== undefined && !!before.active !== !!after.active) {
    changes.active = { from: !!before.active, to: !!after.active };
  }
  emitProvider('provider:updated', after, { changes });
  return after;
}

/**
 * Elimina (desactiva) un proveedor existente, validando permisos por empresa y notificando el cambio a SAC.
 * @param {String|Number} id - id del proveedor a eliminar
 * @param {Object} [user] - usuario que realiza la eliminación
 * @returns {Promise<Object>} proveedor resultante tras la baja
 */
async function remove(id, user = null) {
  const repo = await orm.getRepository(orm.Provider);
  const before = await repo.findOneBy({ id: Number(id) });
  if (!before) throw notFoundError('Proveedor no encontrado.');
  assertCanManageProvider(before, user);
  await repo.update({ id: before.id }, { active: false });
  const after = serialize(await repo.findOneBy({ id: before.id }));
  emitProvider('provider:updated', after, { changes: { active: { from: !!before.active, to: false } } });
  return after;
}

module.exports = { list, create, update, remove };
