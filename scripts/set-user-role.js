#!/usr/bin/env node
/* Documentado por: Miguel Flores */
'use strict'
const path = require('path');
try { require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') }); } catch (_) { }
const orm = require('../src/orm');
const { ROLE_VALUES } = require('../src/orm/enums');

async function run() {
  const argv = process.argv.slice(2);
  if (argv.length < 2) {
    console.error('Usage: node scripts/set-user-role.js <id> <role>');
    process.exitCode = 2;
    return;
  }
  const [id, role] = argv;
  if (!ROLE_VALUES.includes(role)) {
    console.error(`[set-role] Rol inválido: ${role}. Válidos: ${ROLE_VALUES.join(', ')}`);
    process.exitCode = 2;
    return;
  }

  const repo = await orm.getRepository(orm.User);
  const user = await repo.findOneBy({ id: Number(id) });
  if (!user) {
    console.error('[set-role] Usuario no encontrado:', id);
    process.exitCode = 2;
    return;
  }
  await repo.update({ id: user.id }, { role });
  console.log(`[set-role] Usuario ${id} (${user.username}) actualizado a role=${role}`);
}

run()
  .catch((err) => {
    console.error('[set-role] Error:', err && err.stack ? err.stack : err);
    process.exitCode = 1;
  })
  .finally(() => orm.closeORM().catch(() => {}));
