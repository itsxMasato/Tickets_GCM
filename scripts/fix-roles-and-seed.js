#!/usr/bin/env node
/* Documentado por: Miguel Flores */
'use strict'
const Database = require('better-sqlite3');
const path = require('path');
const cfg = require('../src/config');
const db = new Database(cfg.dbPath);

console.log('DB:', cfg.dbPath);

const createSqlRow = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'").get();
const createSql = createSqlRow && createSqlRow.sql ? createSqlRow.sql : '';

if (!/admin_area/.test(createSql) || !/jefe_inmediato/.test(createSql)) {
  console.log('Rebuilding users table to canonical schema and migrating roles...');
  const tx = db.transaction(() => {
    db.prepare(`CREATE TABLE IF NOT EXISTS users_new (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      username        TEXT NOT NULL UNIQUE,
      password_hash   TEXT NOT NULL,
      full_name       TEXT NOT NULL,
      email           TEXT,
      role            TEXT NOT NULL CHECK (role IN ('supervisor_campo','sac','admin_area','jefe_inmediato')),
      area            TEXT,
      active          INTEGER NOT NULL DEFAULT 1,
      created_at      TEXT NOT NULL DEFAULT (datetime('now'))
    )`).run();

    const rows = db.prepare('SELECT id,username,password_hash,full_name,email,role,area,active,created_at FROM users').all();
    const insert = db.prepare('INSERT INTO users_new (id,username,password_hash,full_name,email,role,area,active,created_at) VALUES (?,?,?,?,?,?,?,?,?)');
    for (const r of rows) {
      let newRole = r.role;
      if (r.role === 'admin') newRole = 'admin_area';
      if (r.role === 'encargado') newRole = 'jefe_inmediato';
      insert.run(r.id, r.username, r.password_hash, r.full_name, r.email, newRole, r.area, r.active, r.created_at);
    }

    db.prepare('DROP TABLE users').run();
    db.prepare("ALTER TABLE users_new RENAME TO users").run();

    const maxIdRow = db.prepare('SELECT MAX(id) AS m FROM users').get();
    const maxId = maxIdRow ? (maxIdRow.m || 0) : 0;
    try { db.prepare('INSERT OR REPLACE INTO sqlite_sequence(name, seq) VALUES (?, ?)').run('users', maxId); } catch (e) {}
  });
  tx();
  console.log('Migration complete.');
} else {
  console.log('Users table already uses canonical roles; skipping migration.');
}

const USERS = [
  { username: 'sac',  password: 'sac123',  full_name: 'Atención al Cliente',     email: 'sac@gcm.com',  role: 'sac',              area: null },
  { username: 'jope', password: 'jefe123', full_name: 'Jefe Operaciones',       email: 'jope@gcm.com', role: 'jefe_inmediato',   area: 'operaciones' },
  { username: 'jlog', password: 'jefe123', full_name: 'Jefe Logística',         email: 'jlog@gcm.com', role: 'jefe_inmediato',   area: 'logistica' },
  { username: 'jman', password: 'jefe123', full_name: 'Jefe Mantenimiento',     email: 'jman@gcm.com', role: 'jefe_inmediato',   area: 'mantenimiento' },
  { username: 'aope', password: 'area123', full_name: 'Admin Operaciones',      email: 'aope@gcm.com', role: 'admin_area',       area: 'operaciones' },
  { username: 'alog', password: 'area123', full_name: 'Admin Logística',        email: 'alog@gcm.com', role: 'admin_area',       area: 'logistica' },
  { username: 'aman', password: 'area123', full_name: 'Admin Mantenimiento',    email: 'aman@gcm.com', role: 'admin_area',       area: 'mantenimiento' },
  { username: 'sup1', password: 'sup123',  full_name: 'Supervisor Norte',       email: 'sup1@gcm.com', role: 'supervisor_campo', area: 'operaciones' },
  { username: 'sup2', password: 'sup123',  full_name: 'Supervisor Sur',         email: 'sup2@gcm.com', role: 'supervisor_campo', area: 'logistica' }
];

const insert = db.prepare('INSERT INTO users (username,password_hash,full_name,email,role,area,active) VALUES (?,?,?,?,?,?,1)');
const existsStmt = db.prepare('SELECT COUNT(*) AS c FROM users WHERE username = ?');
const bcrypt = require('bcrypt');

for (const u of USERS) {
  const c = existsStmt.get(u.username).c;
  if (c > 0) {
    console.log('skip', u.username);
  } else {
    const hash = bcrypt.hashSync(u.password, 10);
    insert.run(u.username, hash, u.full_name, u.email, u.role, u.area);
    console.log('inserted', u.username);
  }
}

console.log('Final users:');
console.table(db.prepare('SELECT id,username,full_name,role,area,active FROM users').all());

db.close();

