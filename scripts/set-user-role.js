#!/usr/bin/env node
'use strict';
const firebaseAdmin = require('../src/firebaseAdmin');

async function run() {
  const argv = process.argv.slice(2);
  if (argv.length < 2) {
    console.error('Usage: node scripts/set-user-role.js <id> <role>');
    process.exit(2);
  }
  const [id, role] = argv;
  try {
    firebaseAdmin.init();
    if (!firebaseAdmin.isInitialized()) {
      console.error('[set-role] Firebase Admin no inicializado:', firebaseAdmin.getInitializationError());
      process.exit(2);
    }
    const db = firebaseAdmin.getFirestoreInstance();
    const ref = db.collection('users').doc(String(id));
    const snap = await ref.get();
    if (!snap.exists) {
      console.error('[set-role] Usuario no encontrado:', id);
      process.exit(2);
    }
    await ref.update({ role });
    console.log(`[set-role] Usuario ${id} actualizado a role=${role}`);
    process.exit(0);
  } catch (err) {
    console.error('[set-role] Error:', err && err.stack ? err.stack : err);
    process.exit(1);
  }
}

run();
