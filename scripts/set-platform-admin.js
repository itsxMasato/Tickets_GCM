#!/usr/bin/env node
/* Documentado por: Miguel Flores */
'use strict'
const path = require('path');
try { require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') }); } catch (_) { }
const orm = require('../src/orm');

async function run() {
  const argv = process.argv.slice(2);
  if (argv.length < 1) {
    console.error('Usage: node scripts/set-platform-admin.js <id> [true|false]');
    process.exitCode = 2;
    return;
  }
  const [id, flagArg] = argv;
  const value = flagArg !== 'false';

  const repo = await orm.getRepository(orm.User);
  const user = await repo.findOneBy({ id: Number(id) });
  if (!user) {
    console.error('[set-platform-admin] Usuario no encontrado:', id);
    process.exitCode = 2;
    return;
  }
  await repo.update({ id: user.id }, { is_platform_admin: value });
  console.log(`[set-platform-admin] Usuario ${id} (${user.username}) actualizado a is_platform_admin=${value}`);
}

run()
  .catch((err) => {
    console.error('[set-platform-admin] Error:', err && err.stack ? err.stack : err);
    process.exitCode = 1;
  })
  .finally(() => orm.closeORM().catch(() => {}));
