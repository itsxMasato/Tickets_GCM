#!/usr/bin/env node
'use strict';
const firebaseAdmin = require('../src/firebaseAdmin');

async function run() {
  try {
    // Inicializar (usa FIREBASE_SERVICE_ACCOUNT o FIREBASE_SERVICE_ACCOUNT_PATH o ADC)
    firebaseAdmin.init();
    if (!firebaseAdmin.isInitialized()) {
      console.error('[seed] Firebase Admin no inicializado: ', firebaseAdmin.getInitializationError());
      console.error('Asegúrese de definir FIREBASE_SERVICE_ACCOUNT o FIREBASE_SERVICE_ACCOUNT_PATH o GOOGLE_APPLICATION_CREDENTIALS');
      process.exit(2);
    }

    const db = firebaseAdmin.getFirestoreInstance();

    console.log('[seed] Creando metadata/counters...');
    const countersRef = db.collection('metadata').doc('counters');
    await countersRef.set({
      users: 0,
      categories: 1,
      tickets: 1,
      notifications: 1,
      audit_log: 1,
      ticket_assignments: 1,
      ticket_comments: 1,
      attachments: 1,
    }, { merge: true });

    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

    // Crear categorías iniciales si no existen
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

    console.log('[seed] Seed finalizado correctamente.');
    process.exit(0);
  } catch (err) {
    console.error('[seed] Error:', err && err.message ? err.message : err);
    process.exit(1);
  }
}

run();
