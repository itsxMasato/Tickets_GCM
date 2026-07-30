/* Documentado por: Miguel Flores */
require('dotenv').config();
const admin = require('../src/firebaseAdmin');
admin.init();
const db = admin.getFirestoreInstance();

(async () => {
  try {
    console.log('--- role_permissions ---');
    const snap = await db.collection('role_permissions').get();
    console.log('Count:', snap.size);
    for (const doc of snap.docs) {
      const d = doc.data();
      console.log(' ', doc.id, '=>', JSON.stringify(d));
    }

    console.log('\n--- DEFAULTS en src/services/roles.service.js ---');
    console.log('Los defaults son estáticos. Si no hay doc en Firestore, se usan los defaults.');

    process.exit(0);
  } catch (e) {
    console.error('Err:', e.message);
    process.exit(1);
  }
})();

