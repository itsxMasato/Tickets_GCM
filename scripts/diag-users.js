/* Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. */
// Diagnóstico: leer usuarios de Firestore
require('dotenv').config();
const admin = require('../src/firebaseAdmin');
admin.init();
const db = admin.getFirestoreInstance();

(async () => {
  try {
    const snap = await db.collection('users').get();
    console.log('Firestore users:', snap.size);
    for (const doc of snap.docs) {
      const d = doc.data();
      console.log(' ', doc.id, '|', d.username, '|', d.role, '| active:', d.active, '| name:', d.full_name);
    }

    // Filtrar por active=1
    console.log('\n--- active=1 ---');
    const snap1 = await db.collection('users').where('active', '==', 1).get();
    console.log('Count:', snap1.size);

    // Filtrar por active=1 y role=sac
    console.log('\n--- active=1 + role=sac ---');
    const snap2 = await db.collection('users').where('active', '==', 1).where('role', '==', 'sac').get();
    console.log('Count:', snap2.size);

    // Por role
    for (const r of ['sac', 'jefe_inmediato', 'admin_area', 'supervisor_campo']) {
      const s = await db.collection('users').where('role', '==', r).get();
      const s1 = await db.collection('users').where('role', '==', r).where('active', '==', 1).get();
      console.log(`role=${r}: total=${s.size}, active=${s1.size}`);
    }

    process.exit(0);
  } catch (e) {
    console.error('Err:', e.message);
    process.exit(1);
  }
})();
