#!/usr/bin/env node
/* Documentado por: Miguel Flores */
'use strict'
const firebaseAdmin = require('../src/firebaseAdmin');

const COLLECTIONS_TO_WIPE = [
  'tickets',
  'ticket_assignments',
  'ticket_comments',
  'attachments',
  'categories',
  'calendar_events',
  'notifications',
  'audit_log',
  'audit_action_types',
  'audit_active_users',
];

const DEBUG_USERNAME = 'debug_jefe_tmp';

async function countAndMaybeDelete(db, collectionName, confirm) {
  const snap = await db.collection(collectionName).get();
  const count = snap.size;
  if (!confirm || count === 0)
    return count;

  const docs = snap.docs;
  for (let i = 0; i < docs.length; i += 500) {
    const batch = db.batch();
    docs.slice(i, i + 500).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  return count;
}

async function run() {
  const confirm = process.argv.includes('--confirm');

  firebaseAdmin.init();
  if (!firebaseAdmin.isInitialized()) {
    console.error('[reset] Firebase Admin no inicializado:', firebaseAdmin.getInitializationError());
    process.exit(2);
  }
  const db = firebaseAdmin.getFirestoreInstance();

  console.log(confirm ? '=== BORRANDO (--confirm activo) ===' : '=== DRY RUN (sin --confirm, no se borra nada) ===');
  console.log('');

  const results = {};
  for (const col of COLLECTIONS_TO_WIPE) {
    results[col] = await countAndMaybeDelete(db, col, confirm);
  }

  console.log('Colecciones ' + (confirm ? 'borradas' : 'a borrar') + ':');
  for (const [col, count] of Object.entries(results)) {
    console.log(`  - ${col}: ${count} documento(s)`);
  }

  console.log('');
  const userSnap = await db.collection('users').where('username_lower', '==', DEBUG_USERNAME).get();
  if (userSnap.empty) {
    console.log(`Usuario @${DEBUG_USERNAME}: no encontrado (nada que borrar).`);
  } else {
    for (const userDoc of userSnap.docs) {
      const userId = userDoc.id;
      const userData = userDoc.data();
      console.log(`Usuario @${DEBUG_USERNAME} (id=${userId}): ${confirm ? 'borrando' : 'se borraría'}.`);

      const memSnap = await db.collection('user_company_memberships').where('user_id', '==', Number(userId)).get();
      console.log(`  Membresías asociadas: ${memSnap.size}`);

      if (confirm) {
        if (!memSnap.empty) {
          const batch = db.batch();
          memSnap.docs.forEach((d) => batch.delete(d.ref));
          await batch.commit();
        }
        await userDoc.ref.delete();

        try {
          const { deriveAuthEmail } = require('../src/utils/deriveAuthEmail');
          const email = deriveAuthEmail({ username: userData.username, email: userData.email });
          if (email) {
            const authUser = await firebaseAdmin.getAuth().getUserByEmail(email).catch(() => null);
            if (authUser) {
              await firebaseAdmin.getAuth().deleteUser(authUser.uid);
              console.log(`  Cuenta de Firebase Auth (${email}) eliminada.`);
            } else {
              console.log(`  Sin cuenta de Firebase Auth para ${email} (nada que hacer).`);
            }
          }
        } catch (err) {
          console.warn('  No se pudo verificar/borrar la cuenta de Firebase Auth:', err.message);
        }
      }
    }
  }

  console.log('');
  console.log('Se preservan sin tocar: users (salvo el de arriba), role_permissions, companies, user_company_memberships (salvo las del usuario de prueba), y todo archivo físico en uploads/.');

  if (!confirm) {
    console.log('');
    console.log('Nada se borró todavía. Para ejecutar de verdad: node scripts/reset-for-deploy.js --confirm');
  }

  process.exit(0);
}

run().catch((err) => {
  console.error('[reset] Error:', err && err.stack ? err.stack : err);
  process.exit(1);
});

