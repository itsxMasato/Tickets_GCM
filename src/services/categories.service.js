'use strict';
const { getDb } = require('../db/connection');
const { validationError, notFoundError } = require('../utils/validators');

function list({ activeOnly = true } = {}) {
  const db = getDb();
  const sql = activeOnly
    ? 'SELECT id, name, active, created_at FROM categories WHERE active = 1 ORDER BY name'
    : 'SELECT id, name, active, created_at FROM categories ORDER BY name';
  return db.prepare(sql).all();
}

function create(name) {
  if (!name || !name.trim()) throw validationError('El nombre de la categoría es obligatorio.');
  const db = getDb();
  const exists = db.prepare('SELECT 1 FROM categories WHERE LOWER(name) = LOWER(?)').get(name.trim());
  if (exists) throw validationError('Ya existe una categoría con ese nombre.');
  const result = db.prepare('INSERT INTO categories (name) VALUES (?)').run(name.trim());
  return db.prepare('SELECT id, name, active, created_at FROM categories WHERE id = ?').get(result.lastInsertRowid);
}

function update(id, { name, active }) {
  const db = getDb();
  const current = db.prepare('SELECT id FROM categories WHERE id = ?').get(id);
  if (!current) throw notFoundError('Categoría no encontrada.');
  const fields = [];
  const values = [];
  if (name !== undefined) {
    if (!name.trim()) throw validationError('El nombre no puede estar vacío.');
    const exists = db.prepare('SELECT 1 FROM categories WHERE LOWER(name) = LOWER(?) AND id != ?').get(name.trim(), id);
    if (exists) throw validationError('Ya existe una categoría con ese nombre.');
    fields.push('name = ?'); values.push(name.trim());
  }
  if (active !== undefined) { fields.push('active = ?'); values.push(active ? 1 : 0); }
  if (fields.length === 0) return db.prepare('SELECT id, name, active, created_at FROM categories WHERE id = ?').get(id);
  values.push(id);
  db.prepare(`UPDATE categories SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return db.prepare('SELECT id, name, active, created_at FROM categories WHERE id = ?').get(id);
}

module.exports = { list, create, update };
