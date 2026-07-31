/* Documentado por: Miguel Flores */
'use strict'
const firebaseAdmin = require('./firebaseAdmin');

/**
 * Obtiene la instancia de Firestore a través de Firebase Admin, inicializándolo
 * si es necesario. Lanza un error descriptivo si Firebase Admin no está listo.
 * @returns {Object} instancia de Firestore
 */
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

/**
 * Genera la fecha/hora actual en formato compatible con columnas SQL (YYYY-MM-DD HH:mm:ss).
 * @returns {String} fecha y hora actual formateada
 */
function nowSql() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

/**
 * Genera el siguiente ID numérico autoincremental para una colección, usando
 * el documento metadata/counters dentro de una transacción de Firestore.
 * Reintenta con backoff exponencial si la transacción es abortada por contención.
 * @param {String} collectionName - nombre de la colección para la que se pide el siguiente id
 * @param {Number} [attempt] - número de reintento actual (uso interno para el backoff)
 * @returns {Promise<Number>} siguiente id disponible para la colección
 */
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
    if (!isAborted || attempt >= 8)
      throw err;
    const backoffMs = Math.min(800, 20 * 2 ** attempt) + Math.random() * 30;
    await new Promise((resolve) => setTimeout(resolve, backoffMs));
    return getNextId(collectionName, attempt + 1);
  }
}

/**
 * Busca un documento por su id dentro de una colección de Firestore.
 * @param {String} collectionName - nombre de la colección
 * @param {String|Number} id - id del documento a buscar
 * @returns {Promise<Object|null>} documento encontrado (con id) o null si no existe
 */
async function getById(collectionName, id) {
  const db = getFirestore();
  const docRef = db.collection(collectionName).doc(String(id));
  const snap = await docRef.get();
  if (!snap.exists) return null;
  return { id: Number(String(id)) || String(id), ...snap.data() };
}

/**
 * Crea un documento nuevo en una colección de Firestore. Si no se provee id,
 * se genera uno autoincremental con getNextId.
 * @param {String} collectionName - nombre de la colección donde crear el documento
 * @param {Object} data - datos a guardar en el documento
 * @param {String|Number} [id] - id explícito a usar; si se omite, se genera automáticamente
 * @returns {Promise<Object>} documento creado (con id incluido)
 */
async function createDoc(collectionName, data, id = null) {
  const db = getFirestore();
  const docId = id ? String(id) : String(await getNextId(collectionName));
  const docRef = db.collection(collectionName).doc(docId);
  await docRef.set(data);
  return { id: Number(docId) || docId, ...data };
}

/**
 * Aplica un patch parcial a un documento existente de Firestore y devuelve el documento actualizado.
 * @param {String} collectionName - nombre de la colección
 * @param {String|Number} id - id del documento a actualizar
 * @param {Object} patch - campos a actualizar en el documento
 * @returns {Promise<Object>} documento actualizado (con id)
 */
async function updateDoc(collectionName, id, patch) {
  const db = getFirestore();
  const docRef = db.collection(collectionName).doc(String(id));
  await docRef.update(patch);
  const snap = await docRef.get();
  return { id: Number(String(id)) || String(id), ...snap.data() };
}

/**
 * Elimina un documento de una colección de Firestore por su id.
 * @param {String} collectionName - nombre de la colección
 * @param {String|Number} id - id del documento a eliminar
 * @returns {Promise<void>}
 */
async function deleteDoc(collectionName, id) {
  const db = getFirestore();
  await db.collection(collectionName).doc(String(id)).delete();
}

/**
 * Busca el primer documento de una colección cuyo campo indicado coincida con el valor dado.
 * @param {String} collectionName - nombre de la colección
 * @param {String} field - nombre del campo a filtrar
 * @param {*} value - valor que debe tener el campo
 * @returns {Promise<Object|null>} primer documento que coincide, o null si no hay ninguno
 */
async function findOne(collectionName, field, value) {
  const db = getFirestore();
  const q = db.collection(collectionName).where(field, '==', value).limit(1);
  const snap = await q.get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  const id = doc.id;
  return { id: Number(id) || id, ...doc.data() };
}

/**
 * Busca varios documentos de una colección aplicando una lista de filtros where,
 * con orden y límite opcionales.
 * @param {String} collectionName - nombre de la colección
 * @param {Array<Array>} [filters] - lista de tuplas [campo, operador, valor] para el where
 * @param {String} [orderBy] - campo por el cual ordenar los resultados
 * @param {String} [direction] - dirección del orden ('asc' o 'desc')
 * @param {Number} [limit] - cantidad máxima de documentos a devolver
 * @returns {Promise<Array<Object>>} documentos que cumplen los filtros
 */
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

/**
 * Devuelve todos los documentos de una colección, con orden opcional.
 * @param {String} collectionName - nombre de la colección
 * @param {String} [orderBy] - campo por el cual ordenar los resultados
 * @param {String} [direction] - dirección del orden ('asc' o 'desc')
 * @returns {Promise<Array<Object>>} todos los documentos de la colección
 */
async function listAll(collectionName, orderBy = null, direction = 'asc') {
  const db = getFirestore();
  let q = db.collection(collectionName);
  if (orderBy) q = q.orderBy(orderBy, direction);
  const snap = await q.get();
  return snap.docs.map((doc) => ({ id: Number(doc.id) || doc.id, ...doc.data() }));
}

/**
 * Aplica el mismo patch a varios documentos de una colección en una sola operación batch de Firestore.
 * @param {String} collectionName - nombre de la colección
 * @param {Array<String|Number>} idList - ids de los documentos a actualizar
 * @param {Object} patch - campos a actualizar en cada documento
 * @returns {Promise<void>}
 */
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
  deleteDoc,
  findOne,
  findMany,
  listAll,
  batchUpdate,
};

