/* Documentado por: Miguel Flores */
'use strict'
const firestoreData = require('../firestoreData');
const { validationError, forbiddenError } = require('../utils/validators');

function assertCanManageCategory(category, user) {
  if (!user || user.isPlatformAdmin) return;
  if (category.company_id == null) return;
  if (String(category.company_id) !== String(user.activeCompanyId)) {
    throw forbiddenError('No puede modificar categorías de otra empresa.');
  }
}

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

function emitCategory(event, category, opts = {}) {
  try {
    const { emit } = require('../sockets');
    emit(event, { category, ...opts }, { role: 'sac' });
  } catch (e) {}
}

async function list({ activeOnly = true } = {}, user = null) {
  const rows = await firestoreData.listCategories(activeOnly, user);
  return rows.map(serialize);
}

async function create(name, user = null) {
  if (!name || !name.trim()) throw validationError('El nombre de la categoría es obligatorio.');
  const row = await firestoreData.createCategory(name, user);
  const created = serialize(row);
  emitCategory('category:created', created);
  return created;
}

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

