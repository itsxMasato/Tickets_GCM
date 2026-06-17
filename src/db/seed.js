'use strict';
const bcrypt = require('bcrypt');
const { getDb, closeDb } = require('./connection');

// Roles: supervisor_campo | sac | admin_area | jefe_inmediato
const USERS = [
  // SAC — Servicio al cliente (administrador de todo)
  { username: 'sac',  password: 'sac123',  full_name: 'Atención al Cliente',     email: 'sac@gcm.com',  role: 'sac',              area: null },

  // Jefes inmediatos (uno por área — solo ellos pueden cerrar)
  { username: 'jope', password: 'jefe123', full_name: 'Jefe Operaciones',       email: 'jope@gcm.com', role: 'jefe_inmediato',   area: 'operaciones' },
  { username: 'jlog', password: 'jefe123', full_name: 'Jefe Logística',         email: 'jlog@gcm.com', role: 'jefe_inmediato',   area: 'logistica' },
  { username: 'jman', password: 'jefe123', full_name: 'Jefe Mantenimiento',     email: 'jman@gcm.com', role: 'jefe_inmediato',   area: 'mantenimiento' },

  // Administradores de área (reciben y resuelven, no cierran)
  { username: 'aope', password: 'area123', full_name: 'Admin Operaciones',      email: 'aope@gcm.com', role: 'admin_area',       area: 'operaciones' },
  { username: 'alog', password: 'area123', full_name: 'Admin Logística',        email: 'alog@gcm.com', role: 'admin_area',       area: 'logistica' },
  { username: 'aman', password: 'area123', full_name: 'Admin Mantenimiento',    email: 'aman@gcm.com', role: 'admin_area',       area: 'mantenimiento' },

  // Supervisores de campo (generan tickets)
  { username: 'sup1', password: 'sup123',  full_name: 'Supervisor Norte',       email: 'sup1@gcm.com', role: 'supervisor_campo', area: 'operaciones' },
  { username: 'sup2', password: 'sup123',  full_name: 'Supervisor Sur',         email: 'sup2@gcm.com', role: 'supervisor_campo', area: 'logistica' },
];

const CATEGORIES = [
  'Falla de equipo',
  'Solicitud de mantenimiento',
  'Incidencia en entrega',
  'Solicitud de material',
  'Reporte de novedad',
  'Solicitud de acceso',
  'Otro',
];

async function seed() {
  const db = getDb();
  const userCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (userCount === 0) {
    const insertUser = db.prepare(
      'INSERT INTO users (username, password_hash, full_name, email, role, area) VALUES (?, ?, ?, ?, ?, ?)'
    );
    for (const u of USERS) {
      const hash = await bcrypt.hash(u.password, 10);
      insertUser.run(u.username, hash, u.full_name, u.email, u.role, u.area);
    }
    console.log(`[seed] Insertados ${USERS.length} usuarios.`);
  }

  const catCount = db.prepare('SELECT COUNT(*) AS c FROM categories').get().c;
  if (catCount === 0) {
    const insertCat = db.prepare('INSERT INTO categories (name) VALUES (?)');
    for (const name of CATEGORIES) insertCat.run(name);
    console.log(`[seed] Insertadas ${CATEGORIES.length} categorías.`);
  }
}

module.exports = seed;

if (require.main === module) {
  seed().then(() => closeDb()).catch((err) => { console.error(err); process.exit(1); });
}
