#!/usr/bin/env node
/* Documentado por: Miguel Flores */
'use strict'
const crypto = require('crypto');
const firebaseAdmin = require('../src/firebaseAdmin');
const firestoreData = require('../src/firestoreData');
const { hashPassword } = require('../src/utils/password');
const { deriveAuthEmail } = require('../src/utils/deriveAuthEmail');
const { syncFirebaseAuthUser } = require('../src/utils/firebase-auth-sync');

const BOOTSTRAP_USERNAME = 'admin';
const BOOTSTRAP_FULL_NAME = 'Administrador inicial (temporal)';

async function run() {
  try {
    firebaseAdmin.init();
    if (!firebaseAdmin.isInitialized()) {
      console.error('[seed] Firebase Admin no inicializado: ', firebaseAdmin.getInitializationError());
      console.error('Asegúrese de definir FIREBASE_SERVICE_ACCOUNT o FIREBASE_SERVICE_ACCOUNT_PATH o GOOGLE_APPLICATION_CREDENTIALS');
      process.exit(2);
    }

    const db = firebaseAdmin.getFirestoreInstance();

    const countersRef = db.collection('metadata').doc('counters');
    const countersSnap = await countersRef.get();
    const existingCounters = countersSnap.exists ? countersSnap.data() : {};
    const DEFAULT_COUNTERS = {
      users: 0,
      categories: 1,
      tickets: 1,
      notifications: 1,
      audit_log: 1,
      ticket_assignments: 1,
      ticket_comments: 1,
      attachments: 1,
    };
    const missingCounters = {};
    for (const [key, defaultValue] of Object.entries(DEFAULT_COUNTERS)) {
      if (existingCounters[key] === undefined) missingCounters[key] = defaultValue;
    }
    if (Object.keys(missingCounters).length > 0) {
      console.log('[seed] Inicializando contadores faltantes:', Object.keys(missingCounters).join(', '));
      await countersRef.set(missingCounters, { merge: true });
    } else {
      console.log('[seed] Contadores ya existentes, no se modifican.');
    }

    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

    const catSnap = await db.collection('categories').limit(1).get();
    if (catSnap.empty) {
      console.log('[seed] Creando categorías por defecto...');
      const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
      const cats = [
        { id: '1', name: 'General', name_lower: 'general', active: 1, created_at: now },
      ];
      for (const c of cats) await db.collection('categories').doc(c.id).set(c);
      console.log('[seed] Categorías creadas.');
    } else {
      console.log('[seed] Ya existen categorías, no se crearán.');
    }

    const usersSnap = await db.collection('users').limit(1).get();
    if (usersSnap.empty) {
      console.log('[seed] No hay usuarios, creando administrador inicial temporal...');
      const tempPassword = crypto.randomBytes(12).toString('hex');
      const passwordHash = await hashPassword(tempPassword);

      const created = await firestoreData.createUser({
        username: BOOTSTRAP_USERNAME,
        password_hash: passwordHash,
        full_name: BOOTSTRAP_FULL_NAME,
        role: 'sac',
        area: null,
        email: null,
      });
      await firestoreData.updateUser(created.id, { is_platform_admin: true, is_bootstrap: true });

      const email = deriveAuthEmail({ username: BOOTSTRAP_USERNAME, email: null });
      await syncFirebaseAuthUser({
        authClient: firebaseAdmin.getAuth(),
        user: { username: BOOTSTRAP_USERNAME, full_name: BOOTSTRAP_FULL_NAME, email },
        password: tempPassword,
      });

      console.log('[seed] Administrador inicial creado. Guarde estas credenciales, no se mostrarán de nuevo:');
      console.log(`[seed]   usuario:    ${BOOTSTRAP_USERNAME}`);
      console.log(`[seed]   contraseña: ${tempPassword}`);
      console.log('[seed] Esta cuenta se elimina automáticamente al crear el primer usuario real con rol "sac".');
    } else {
      console.log('[seed] Ya existen usuarios, no se crea administrador inicial.');
    }

    console.log('[seed] Seed finalizado correctamente.');
    process.exit(0);
  } catch (err) {
    console.error('[seed] Error:', err && err.message ? err.message : err);
    process.exit(1);
  }
}

module.exports = run;

if (require.main === module) {
  run();
}

