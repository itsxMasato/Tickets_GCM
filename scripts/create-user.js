/* Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. */
#!/usr/bin/env node
'use strict';
const firebaseAdmin = require('../src/firebaseAdmin');
const { hashPassword } = require('../src/utils/password');

async function run() {
  const argv = process.argv.slice(2);
  if (argv.length < 3) {
    console.error('Usage: node scripts/create-user.js <username> <email> <password> [role]');
    process.exit(2);
  }
  const [username, email, password, role = 'admin'] = argv;
  try {
    firebaseAdmin.init();
    if (!firebaseAdmin.isInitialized()) {
      console.error('[create-user] Firebase Admin no inicializado:', firebaseAdmin.getInitializationError());
      process.exit(2);
    }
    const db = firebaseAdmin.getFirestoreInstance();

    const normalizedEmail = email ? String(email).trim().toLowerCase() : null;
    const normalizedUsername = username ? String(username).trim() : null;

    // Buscar usuario existente por email o username
    const usersRef = db.collection('users');
    const q1 = normalizedEmail ? usersRef.where('email_lower', '==', normalizedEmail).limit(1).get() : Promise.resolve({ empty: true });
    const q2 = normalizedUsername ? usersRef.where('username_lower', '==', normalizedUsername.toLowerCase()).limit(1).get() : Promise.resolve({ empty: true });
    const [snapEmail, snapUser] = await Promise.all([q1, q2]);
    if ((snapEmail && !snapEmail.empty) || (snapUser && !snapUser.empty)) {
      console.log('[create-user] Ya existe un usuario con ese email o nombre de usuario. No se creará.');
      process.exit(0);
    }

    const hash = await hashPassword(password);
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

    // Usar transacción para incrementar counter y crear doc con id numérico
    const countersRef = db.collection('metadata').doc('counters');
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(countersRef);
      const data = snap.exists ? snap.data() : {};
      const current = Number(data.users) || 1; // si es 1, siguiente será 2
      const next = current + 1;
      tx.set(countersRef, { users: next }, { merge: true });
      const id = String(next);
      const userDocRef = usersRef.doc(id);
      const payload = {
        username: normalizedUsername,
        username_lower: normalizedUsername.toLowerCase(),
        password_hash: hash,
        full_name: 'SAC',
        role: role,
        area: null,
        active: 1,
        created_at: now,
        email: email,
        email_lower: normalizedEmail,
      };
      tx.set(userDocRef, payload);
      console.log(`[create-user] Usuario creado: id=${id} username=${normalizedUsername} email=${normalizedEmail}`);
    });
    process.exit(0);
  } catch (err) {
    console.error('[create-user] Error:', err && err.stack ? err.stack : err);
    process.exit(1);
  }
}

run();
