#!/usr/bin/env node
/* Documentado por: Miguel Flores */
'use strict'
const path = require('path');
try { require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') }); } catch (_) { }
const orm = require('../src/orm');
const { hashPassword } = require('../src/utils/password');
const { ROLE_VALUES } = require('../src/orm/enums');

async function run() {
  const argv = process.argv.slice(2);
  if (argv.length < 3) {
    console.error('Usage: node scripts/create-user.js <username> <email> <password> [role]');
    process.exitCode = 2;
    return;
  }
  const [username, email, password, role = 'sac'] = argv;
  if (!ROLE_VALUES.includes(role)) {
    console.error(`[create-user] Rol inválido: ${role}. Válidos: ${ROLE_VALUES.join(', ')}`);
    process.exitCode = 2;
    return;
  }

  const normalizedEmail = email ? String(email).trim() : null;
  const normalizedUsername = username ? String(username).trim() : null;

  const repo = await orm.getRepository(orm.User);
  const existing = await repo.findOneBy({ username: normalizedUsername });
  const existingByEmail = normalizedEmail ? await repo.findOneBy({ email: normalizedEmail }) : null;
  if (existing || existingByEmail) {
    console.log('[create-user] Ya existe un usuario con ese email o nombre de usuario. No se creará.');
    return;
  }

  const hash = await hashPassword(password);
  const created = await repo.save({
    username: normalizedUsername,
    password_hash: hash,
    full_name: 'SAC',
    role,
    area: null,
    email: normalizedEmail,
    active: true,
  });
  console.log(`[create-user] Usuario creado: id=${created.id} username=${normalizedUsername} email=${normalizedEmail}`);
}

run()
  .catch((err) => {
    console.error('[create-user] Error:', err && err.stack ? err.stack : err);
    process.exitCode = 1;
  })
  .finally(() => orm.closeORM().catch(() => {}));
