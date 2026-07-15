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

async function getNextId(collectionName) {
  const db = getFirestore();
  const counterRef = db.collection('metadata').doc('counters');
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(counterRef);
    const data = snap.exists ? snap.data() : {};
    const current = Number(data[collectionName]) || 0;
    const next = current + 1;
    tx.set(counterRef, { [collectionName]: next }, { merge: true });
    return next;
  });
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
