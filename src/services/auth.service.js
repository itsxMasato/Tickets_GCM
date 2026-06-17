'use strict';
const { getDb } = require('../db/connection');
const { verifyPassword, hashPassword } = require('../utils/password');
const { validationError, notFoundError, ROLES } = require('../utils/validators');

async function login(username, password) {
  if (!username || !password) {
    throw validationError('Debe ingresar usuario y contraseña.');
  }
  const db = getDb();
  const user = db
    .prepare('SELECT id, username, password_hash, full_name, role, area, active FROM users WHERE username = ?')
    .get(username);
  if (!user) throw validationError('Credenciales inválidas.');
  if (!user.active) throw validationError('Usuario inactivo. Contacte al administrador.');
  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) throw validationError('Credenciales inválidas.');
  return sanitize(user);
}

function getById(id) {
  const db = getDb();
  const user = db
    .prepare('SELECT id, username, full_name, role, area, active, created_at FROM users WHERE id = ?')
    .get(id);
  if (!user) throw notFoundError('Usuario no encontrado.');
  return user;
}

function sanitize(user) {
  return {
    id: user.id,
    username: user.username,
    full_name: user.full_name,
    role: user.role,
    area: user.area || null,
    active: !!user.active,
  };
}

async function createUser({ username, password, full_name, role, area }) {
  if (!username || !password || !full_name || !role) {
    throw validationError('Todos los campos son obligatorios.');
  }
  if (!ROLES.includes(role)) {
    throw validationError('Rol inválido.');
  }
  if (password.length < 4) {
    throw validationError('La contraseña debe tener al menos 4 caracteres.');
  }
  const db = getDb();
  const exists = db.prepare('SELECT 1 FROM users WHERE username = ?').get(username);
  if (exists) throw validationError('El nombre de usuario ya existe.');
  const hash = await hashPassword(password);
  const result = db
    .prepare('INSERT INTO users (username, password_hash, full_name, email, role, area) VALUES (?, ?, ?, ?, ?, ?)')
    .run(username, hash, full_name, null, role, area || null);
  return getById(result.lastInsertRowid);
}

async function updateUser(id, { full_name, role, area, active, password }) {
  const user = getById(id);
  const db = getDb();
  const fields = [];
  const values = [];
  if (full_name !== undefined) { fields.push('full_name = ?'); values.push(full_name); }
  if (role !== undefined) {
    if (!ROLES.includes(role)) throw validationError('Rol inválido.');
    fields.push('role = ?'); values.push(role);
  }
  if (area !== undefined) { fields.push('area = ?'); values.push(area || null); }
  if (active !== undefined) { fields.push('active = ?'); values.push(active ? 1 : 0); }
  if (password) {
    if (password.length < 4) throw validationError('La contraseña debe tener al menos 4 caracteres.');
    const h = await hashPassword(password);
    fields.push('password_hash = ?'); values.push(h);
  }
  if (fields.length === 0) return user;
  values.push(id);
  db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return getById(id);
}

function listUsers({ role, active, area } = {}) {
  const db = getDb();
  const where = [];
  const params = [];
  if (role) { where.push('role = ?'); params.push(role); }
  if (area) { where.push('area = ?'); params.push(area); }
  if (active !== undefined) { where.push('active = ?'); params.push(active ? 1 : 0); }
  const sql = `SELECT id, username, full_name, role, area, active, created_at FROM users${where.length ? ' WHERE ' + where.join(' AND ') : ''} ORDER BY full_name`;
  return db.prepare(sql).all(...params);
}

module.exports = { login, getById, sanitize, createUser, updateUser, listUsers };
