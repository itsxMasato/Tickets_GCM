#!/usr/bin/env node
'use strict';
const path = require('path');
const firebaseAdmin = require('../src/firebaseAdmin');
const { hashPassword } = require('../src/utils/password');

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
      users: 1,
      categories: 1,
      tickets: 1,
      notifications: 1,
      audit_log: 1,
      ticket_assignments: 1,
      ticket_comments: 1,
      attachments: 1,
    }, { merge: true });

    // Crear usuario admin por defecto si no existe ninguno
    // Crear usuarios por defecto (admin y sac) si no existen
    const usersRef = db.collection('users');
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

    async function ensureUser({ username, email, password, full_name = 'Usuario', role = 'admin', idHint = null }) {
      const lowerUser = username ? username.toLowerCase() : null;
      const lowerEmail = email ? email.toLowerCase() : null;
      let exists = false;
      if (lowerEmail) {
        const snap = await usersRef.where('email_lower', '==', lowerEmail).limit(1).get();
        if (!snap.empty) exists = true;
      }
      if (!exists && lowerUser) {
        const snap2 = await usersRef.where('username_lower', '==', lowerUser).limit(1).get();
        if (!snap2.empty) exists = true;
      }
      if (exists) {
        console.log(`[seed] Usuario existente detectado: ${username || email}`);
        return;
      }

      const hash = await hashPassword(password);

      // Intentar usar idHint si la colección está vacía o si el id no existe
      if (idHint) {
        const doc = await usersRef.doc(String(idHint)).get();
        if (!doc.exists) {
          await usersRef.doc(String(idHint)).set({
            username,
            username_lower: lowerUser,
            password_hash: hash,
            full_name,
            role,
            area: null,
            active: 1,
            created_at: now,
            email: email || null,
            email_lower: lowerEmail,
          });
          console.log(`[seed] Usuario creado con idHint ${idHint}: ${username} / ${email}`);
          return;
        }
      }

      // Crear con id numérico nuevo usando counter
      const countersRef = db.collection('metadata').doc('counters');
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(countersRef);
        const data = snap.exists ? snap.data() : {};
        const current = Number(data.users) || 1;
        const next = current + 1;
        tx.set(countersRef, { users: next }, { merge: true });
        const id = String(next);
        tx.set(usersRef.doc(id), {
          username,
          username_lower: lowerUser,
          password_hash: hash,
          full_name,
          role,
          area: null,
          active: 1,
          created_at: now,
          email: email || null,
          email_lower: lowerEmail,
        });
        console.log(`[seed] Usuario creado: id=${id} username=${username} email=${email}`);
      });
    }

    // Admin por defecto
    await ensureUser({ username: 'admin', email: null, password: process.env.DEFAULT_ADMIN_PASSWORD || 'admin1234', full_name: 'Administrador', role: 'admin', idHint: '1' });
    // Usuario SAC (administrador del sistema)
    await ensureUser({ username: 'sac', email: 'sac@gcm.com', password: process.env.SAC_PASSWORD || 'GCM20206@!', full_name: 'SAC', role: 'sac', idHint: '2' });

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
