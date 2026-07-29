#!/usr/bin/env node
/* Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. */
'use strict';
// Marca/desmarca a un usuario como platform admin (bypass cross-tenant total,
// ver docs/MULTITENANT.md §5.3 y §7.5 "Rollback de emergencia").
const firebaseAdmin = require('../src/firebaseAdmin');

async function run() {
  const argv = process.argv.slice(2);
  if (argv.length < 1) {
    console.error('Usage: node scripts/set-platform-admin.js <id> [true|false]');
    process.exit(2);
  }
  const [id, flagArg] = argv;
  const value = flagArg === 'false' ? false : true;
  try {
    firebaseAdmin.init();
    if (!firebaseAdmin.isInitialized()) {
      console.error('[set-platform-admin] Firebase Admin no inicializado:', firebaseAdmin.getInitializationError());
      process.exit(2);
    }
    const db = firebaseAdmin.getFirestoreInstance();
    const ref = db.collection('users').doc(String(id));
    const snap = await ref.get();
    if (!snap.exists) {
      console.error('[set-platform-admin] Usuario no encontrado:', id);
      process.exit(2);
    }
    await ref.update({ is_platform_admin: value });
    console.log(`[set-platform-admin] Usuario ${id} (${snap.data().username}) actualizado a is_platform_admin=${value}`);
    process.exit(0);
  } catch (err) {
    console.error('[set-platform-admin] Error:', err && err.stack ? err.stack : err);
    process.exit(1);
  }
}

run();
