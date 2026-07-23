/* Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores.
 *
 * bootstrap-firebase-auth.js
 *
 * Sincroniza los usuarios de Firestore (colección `users`) hacia Firebase
 * Authentication. Lee cada doc, deriva un email sintético
 * `<username>@ticketsgcm.local`, y crea la cuenta en Auth si todavía no
 * existe. Es idempotente: si el usuario ya está en Auth, lo salta.
 *
 * Es la pieza que faltaba para que el login por username funcione: hasta
 * ahora `scripts/create-user.js` solo escribía en Firestore; Firebase Auth
 * no sabía nada de esos usuarios, así que `signInWithPassword` siempre
 * devolvía "invalid-credential" sin importar la password.
 *
 * Uso:
 *   node scripts/bootstrap-firebase-auth.js                # usa la password provista
 *   node scripts/bootstrap-firebase-auth.js --password X   # fuerza una password para todos
 *   node scripts/bootstrap-firebase-auth.js --dry-run      # no crea nada, solo lista
 *
 * Por defecto la password sale de process.env.BOOTSTRAP_PASSWORD; si no está
 * definida, se usa "Motagua1928" para mantener compatibilidad con el único
 * usuario conocido (Miguel).
 */
'use strict';

const firebaseAdmin = require('../src/firebaseAdmin');
const { deriveAuthEmail } = require('../src/utils/deriveAuthEmail');

const DEFAULT_PASSWORD = 'Motagua1928';

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { dryRun: false, password: process.env.BOOTSTRAP_PASSWORD || DEFAULT_PASSWORD };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dry-run') out.dryRun = true;
    else if (args[i] === '--password') out.password = args[++i];
  }
  return out;
}

async function run() {
  const { dryRun, password } = parseArgs();

  firebaseAdmin.init();
  if (!firebaseAdmin.isInitialized()) {
    console.error('[bootstrap-auth] Firebase Admin no inicializado:', firebaseAdmin.getInitializationError());
    process.exit(2);
  }

  const db = firebaseAdmin.getFirestoreInstance();
  const auth = firebaseAdmin.getAuth();

  console.log(`[bootstrap-auth] ${dryRun ? 'DRY-RUN' : 'EJECUTANDO'} — password=${password === DEFAULT_PASSWORD ? '<default>' : '<custom>'}`);

  const usersSnap = await db.collection('users').get();
  console.log(`[bootstrap-auth] Encontrados ${usersSnap.size} usuarios en Firestore.`);

  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const doc of usersSnap.docs) {
    const data = doc.data();
    const email = deriveAuthEmail(data);
    if (!email) {
      console.warn(`  [skip] doc ${doc.id} sin email ni username derivable`);
      skipped += 1;
      continue;
    }

    try {
      // ¿Ya existe en Auth?
      let existing = null;
      try {
        existing = await auth.getUserByEmail(email);
      } catch (e) {
        if (e.code !== 'auth/user-not-found') throw e;
      }

      if (existing) {
        console.log(`  [exists] ${email} (uid=${existing.uid}, firestoreDoc=${doc.id})`);
        skipped += 1;
        continue;
      }

      if (dryRun) {
        console.log(`  [would-create] ${email} (firestoreDoc=${doc.id})`);
        created += 1;
        continue;
      }

      // Crear en Auth. La password se setea explícitamente para que
      // signInWithPassword funcione sin necesidad de flujo de reset.
      const userRecord = await auth.createUser({
        email,
        password,
        displayName: data.full_name || data.username || undefined,
        disabled: !data.active,
      });
      console.log(`  [created] ${email} → uid=${userRecord.uid} (firestoreDoc=${doc.id})`);

      // Vincular el UID de Auth con el doc de Firestore. El frontend ya
      // busca por `email` en `getUserByIdentifier`, así que si el doc
      // tiene `email`/`email_lower` seteado, no hace falta renombrar el
      // id del doc. Pero si el doc usa un id numérico legado y no
      // tiene email, copiamos el email para que el mapping funcione.
      if (data.id !== userRecord.uid && !data.email) {
        await doc.ref.update({ email, email_lower: email.toLowerCase() });
        console.log(`    [updated] firestoreDoc ${doc.id} ahora tiene email=${email}`);
      }

      created += 1;
    } catch (err) {
      console.error(`  [error] ${email}:`, err.message);
      failed += 1;
    }
  }

  console.log(`\n[bootstrap-auth] Resumen: created=${created}, skipped=${skipped}, failed=${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('[bootstrap-auth] Fatal:', err && err.stack ? err.stack : err);
  process.exit(1);
});
