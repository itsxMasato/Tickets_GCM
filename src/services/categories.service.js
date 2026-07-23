/* Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. */
'use strict';
const firestoreData = require('../firestoreData');
const { validationError } = require('../utils/validators');

function serialize(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    active: row.active ? 1 : 0,
    created_at: row.created_at,
  };
}

/**
 * Emite un evento de categoría a la sala 'sac' (gestión administrativa).
 * Es seguro llamarlo cuando el socket aún no está inicializado.
 */
function emitCategory(event, category, opts = {}) {
  try {
    const { emit } = require('../sockets');
    emit(event, { category, ...opts }, { role: 'sac' });
  } catch (e) {
    /* socket no inicializado aún */
  }
}

async function list({ activeOnly = true } = {}) {
  const rows = await firestoreData.listCategories(activeOnly);
  return rows.map(serialize);
}

async function create(name) {
  if (!name || !name.trim()) throw validationError('El nombre de la categoría es obligatorio.');
  const row = await firestoreData.createCategory(name);
  const created = serialize(row);
  emitCategory('category:created', created);
  return created;
}

async function update(id, { name, active } = {}) {
  // Capturamos el "antes" para enviar un diff explícito en el evento.
  const before = await firestoreData.getCategoryById(id).catch(() => null);
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

async function remove(id) {
  const before = await firestoreData.getCategoryById(id);
  if (!before) {
    const err = new Error('Categoría no encontrada.');
    err.code = 'NOT_FOUND';
    throw err;
  }
  await firestoreData.deleteCategory(id);
  emitCategory('category:deleted', { id: before.id, name: before.name });
  return before;
}

module.exports = { list, create, update, remove };
