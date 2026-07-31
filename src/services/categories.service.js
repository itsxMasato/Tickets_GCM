/* Documentado por: Miguel Flores */
'use strict'
const firestoreData = require('../firestoreData');
const { validationError, forbiddenError } = require('../utils/validators');

/**
 * Valida que el usuario tenga permiso para modificar una categoría: los admins de plataforma o categorías globales pasan siempre; el resto solo puede tocar categorías de su propia empresa.
 * @param {Object} category - categoría a validar
 * @param {Object} user - usuario que intenta modificarla
 * @returns {void}
 */
function assertCanManageCategory(category, user) {
  if (!user || user.isPlatformAdmin) return;
  if (category.company_id == null) return;
  if (String(category.company_id) !== String(user.activeCompanyId)) {
    throw forbiddenError('No puede modificar categorías de otra empresa.');
  }
}

/**
 * Convierte un registro de categoría de Firestore al formato plano expuesto por la API.
 * @param {Object} row - registro crudo de categoría
 * @returns {Object|null} categoría serializada, o null si no se recibió registro
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
 * Emite por socket.io un evento de cambio de categoría a los usuarios con rol SAC. Silencia errores de socket.
 * @param {String} event - nombre del evento a emitir
 * @param {Object} category - categoría involucrada
 * @param {Object} [opts] - datos adicionales a incluir en el payload del evento (ej. changes)
 * @returns {void}
 */
function emitCategory(event, category, opts = {}) {
  try {
    const { emit } = require('../sockets');
    emit(event, { category, ...opts }, { role: 'sac' });
  } catch (e) {}
}

/**
 * Lista las categorías visibles para el usuario, opcionalmente filtrando solo las activas.
 * @param {Object} [options] - opciones de listado
 * @param {Boolean} [options.activeOnly=true] - si true, excluye categorías inactivas
 * @param {Object} [user] - usuario que realiza la consulta, usado para acotar por empresa
 * @returns {Promise<Array>} categorías serializadas
 */
async function list({ activeOnly = true } = {}, user = null) {
  const rows = await firestoreData.listCategories(activeOnly, user);
  return rows.map(serialize);
}

/**
 * Crea una nueva categoría y notifica a SAC en tiempo real.
 * @param {String} name - nombre de la categoría
 * @param {Object} [user] - usuario que la crea
 * @returns {Promise<Object>} categoría creada serializada
 */
async function create(name, user = null) {
  if (!name || !name.trim()) throw validationError('El nombre de la categoría es obligatorio.');
  const row = await firestoreData.createCategory(name, user);
  const created = serialize(row);
  emitCategory('category:created', created);
  return created;
}

/**
 * Actualiza el nombre y/o estado activo de una categoría, valida permisos por empresa y notifica los cambios a SAC.
 * @param {String|Number} id - id de la categoría a actualizar
 * @param {Object} [changes] - campos a actualizar
 * @param {String} [changes.name] - nuevo nombre
 * @param {Boolean} [changes.active] - nuevo estado activo
 * @param {Object} [user] - usuario que realiza la actualización
 * @returns {Promise<Object>} categoría actualizada serializada
 */
async function update(id, { name, active } = {}, user = null) {
  const before = await firestoreData.getCategoryById(id).catch(() => null);
  if (before) assertCanManageCategory(before, user);
  const row = await firestoreData.updateCategory(id, { name, active });
  const after = serialize(row);
  const changes = {};
  if (before) {
    if (name !== undefined && before.name !== after.name) changes.name = { from: before.name, to: after.name };
    if (active !== undefined && !!before.active !== !!after.active) {
      changes.active = { from: !!before.active, to: !!after.active };
    }
  }
  emitCategory('category:updated', after, { changes });
  return after;
}

/**
 * Elimina (desactiva) una categoría existente, validando permisos por empresa y notificando el cambio a SAC.
 * @param {String|Number} id - id de la categoría a eliminar
 * @param {Object} [user] - usuario que realiza la eliminación
 * @returns {Promise<Object>} categoría resultante tras la baja
 */
async function remove(id, user = null) {
  const before = await firestoreData.getCategoryById(id);
  if (!before) {
    const err = new Error('Categoría no encontrada.');
    err.code = 'NOT_FOUND';
    throw err;
  }
  assertCanManageCategory(before, user);
  const after = await firestoreData.deleteCategory(id);
  emitCategory('category:updated', after, { changes: { active: { from: !!before.active, to: false } } });
  return after;
}

module.exports = { list, create, update, remove };

