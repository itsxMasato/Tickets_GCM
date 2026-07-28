/* Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. */
'use strict';
const firebaseAdmin = require('./firebaseAdmin');

function getFirestore() {
  firebaseAdmin.init();
  if (!firebaseAdmin.isInitialized()) {
    const initError = firebaseAdmin.getInitializationError();
    const message = initError
      ? `Firebase Admin no inicializado — ${initError.message}`
      : 'Firebase Admin no inicializado — configure FIREBASE_SERVICE_ACCOUNT, FIREBASE_SERVICE_ACCOUNT_PATH o GOOGLE_APPLICATION_CREDENTIALS';
    throw new Error(message);
  }
  return firebaseAdmin.getFirestoreInstance();
}

function nowSql() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

// getNextId — contador atómico compartido (transacción sobre un único doc
// metadata/counters). Bajo ráfagas de creación muy concurrentes (decenas de
// creaciones de ticket realmente simultáneas) Firestore aborta algunas
// transacciones por contención en ese documento ("ABORTED due to
// cross-transaction contention", código 10) — es su forma de arbitrar
// cuando muchas transacciones pelean por el mismo doc a la vez. Abortar NO
// significa que se aplicó nada parcial (Firestore garantiza todo-o-nada),
// así que es seguro reintentar. Sin este reintento, un usuario que crea un
// ticket en el peor momento de una ráfaga se llevaba un error 500 en vez
// de simplemente tardar unos milisegundos más.
async function getNextId(collectionName, attempt = 0) {
  const db = getFirestore();
  const counterRef = db.collection('metadata').doc('counters');
  try {
    return await db.runTransaction(async (tx) => {
      const snap = await tx.get(counterRef);
      const data = snap.exists ? snap.data() : {};
      const current = Number(data[collectionName]) || 0;
      const next = current + 1;
      tx.set(counterRef, { [collectionName]: next }, { merge: true });
      return next;
    }, { maxAttempts: 10 });
  } catch (err) {
    const isAborted = err.code === 10 || /aborted/i.test(err.message || '');
    if (!isAborted || attempt >= 8) throw err;
    // Backoff exponencial con jitter: espacia los reintentos para que las
    // transacciones que chocaron no vuelvan a chocar todas en el mismo
    // instante. Tope de 8 reintentos adicionales (más los 10 intentos
    // internos de runTransaction) es generoso para cualquier ráfaga
    // realista sin arriesgar un loop largo si algo está genuinamente roto.
    const backoffMs = Math.min(800, 20 * 2 ** attempt) + Math.random() * 30;
    await new Promise((resolve) => setTimeout(resolve, backoffMs));
    return getNextId(collectionName, attempt + 1);
  }
}

async function getById(collectionName, id) {
  const db = getFirestore();
  const docRef = db.collection(collectionName).doc(String(id));
  const snap = await docRef.get();
  if (!snap.exists) return null;
  return { id: Number(String(id)) || String(id), ...snap.data() };
}

async function createDoc(collectionName, data, id = null) {
  const db = getFirestore();
  const docId = id ? String(id) : String(await getNextId(collectionName));
  const docRef = db.collection(collectionName).doc(docId);
  await docRef.set(data);
  return { id: Number(docId) || docId, ...data };
}

async function updateDoc(collectionName, id, patch) {
  const db = getFirestore();
  const docRef = db.collection(collectionName).doc(String(id));
  await docRef.update(patch);
  const snap = await docRef.get();
  return { id: Number(String(id)) || String(id), ...snap.data() };
}

async function findOne(collectionName, field, value) {
  const db = getFirestore();
  const q = db.collection(collectionName).where(field, '==', value).limit(1);
  const snap = await q.get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  const id = doc.id;
  return { id: Number(id) || id, ...doc.data() };
}

async function findMany(collectionName, filters = [], orderBy = null, direction = 'asc', limit = null) {
  const db = getFirestore();
  let q = db.collection(collectionName);
  for (const [field, op, value] of filters) {
    q = q.where(field, op, value);
  }
  if (orderBy) q = q.orderBy(orderBy, direction);
  if (limit) q = q.limit(limit);
  const snap = await q.get();
  return snap.docs.map((doc) => ({ id: Number(doc.id) || doc.id, ...doc.data() }));
}

async function listAll(collectionName, orderBy = null, direction = 'asc') {
  const db = getFirestore();
  let q = db.collection(collectionName);
  if (orderBy) q = q.orderBy(orderBy, direction);
  const snap = await q.get();
  return snap.docs.map((doc) => ({ id: Number(doc.id) || doc.id, ...doc.data() }));
}

async function batchUpdate(collectionName, idList, patch) {
  const db = getFirestore();
  const batch = db.batch();
  for (const id of idList) {
    const docRef = db.collection(collectionName).doc(String(id));
    batch.update(docRef, patch);
  }
  await batch.commit();
}

module.exports = {
  getFirestore,
  nowSql,
  getNextId,
  getById,
  createDoc,
  updateDoc,
  findOne,
  findMany,
  listAll,
  batchUpdate,
};
