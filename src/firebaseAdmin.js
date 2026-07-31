/* Documentado por: Miguel Flores */
'use strict'
const fs = require('fs');
const path = require('path');
const { initializeApp, cert, applicationDefault } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');

let initialized = false;
let initError = null;

/**
 * Inicializa el SDK Admin de Firebase una sola vez, probando en orden: la variable
 * de entorno FIREBASE_SERVICE_ACCOUNT (JSON inline), FIREBASE_SERVICE_ACCOUNT_PATH
 * (archivo de credenciales, incluyendo keys/service-account.json local), y por
 * último las credenciales por defecto de la aplicación. Deja registrado el estado
 * (initialized / initError) para consultarlo con isInitialized/getInitializationError.
 * @returns {void}
 */
function init() {
  if (initialized) return;
  try {
    try {
      const localKey = path.resolve(__dirname, '..', 'keys', 'service-account.json');
      if (!process.env.FIREBASE_SERVICE_ACCOUNT && !process.env.FIREBASE_SERVICE_ACCOUNT_PATH && fs.existsSync(localKey)) {
        process.env.FIREBASE_SERVICE_ACCOUNT_PATH = localKey;
        console.info('[firebaseAdmin] Usando keys/service-account.json automáticamente (FIREBASE_SERVICE_ACCOUNT_PATH)');
      }
    } catch (e) {}
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      const json = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      const projectId = json.project_id || process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || null;
      const opts = projectId ? { credential: cert(json), projectId } : { credential: cert(json) };
      initializeApp(opts);
      initialized = true;
      initError = null;
      console.info('[firebaseAdmin] Inicializado desde FIREBASE_SERVICE_ACCOUNT env var');
      return;
    }

    if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
      const saPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
      let projectId = process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || null;
      try {
        const content = fs.readFileSync(saPath, 'utf8');
        const json = JSON.parse(content);
        if (json && json.project_id) projectId = projectId || json.project_id;
      } catch (e) {}
      const opts = projectId ? { credential: cert(saPath), projectId } : { credential: cert(saPath) };
      initializeApp(opts);
      initialized = true;
      initError = null;
      console.info('[firebaseAdmin] Inicializado desde FIREBASE_SERVICE_ACCOUNT_PATH');
      return;
    }
    const defaultProject = process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || null;
    if (defaultProject) {
      initializeApp({ credential: applicationDefault(), projectId: defaultProject });
    } else {
      initializeApp();
    }
    initialized = true;
    initError = null;
    console.info('[firebaseAdmin] Inicializado con credenciales por defecto');
    try {
      const db = getFirestore();
      const pid = db && db.app && db.app.options && db.app.options.projectId;
      if (!pid) {
        throw new Error('No se detectó Project ID tras inicializar credenciales por defecto');
      }
    } catch (e) {
      initialized = false;
      initError = e;
      console.warn('[firebaseAdmin] Inicialización incompleta:', e.message);
    }
  } catch (err) {
    console.warn('[firebaseAdmin] No se pudo inicializar firebase-admin:', err.message);
    initialized = false;
    initError = err;
  }
}

/**
 * Verifica que Firebase Admin haya sido inicializado correctamente; si no,
 * lanza un error con código FIREBASE_ADMIN_INIT_FAILED describiendo la causa.
 * @returns {void}
 */
function ensureInitialized() {
  if (!initialized) {
    const message = initError
      ? `Firebase Admin no inicializado — ${initError.message}`
      : 'Firebase Admin no inicializado — configure FIREBASE_SERVICE_ACCOUNT, FIREBASE_SERVICE_ACCOUNT_PATH o GOOGLE_APPLICATION_CREDENTIALS';
    const err = new Error(message);
    err.code = 'FIREBASE_ADMIN_INIT_FAILED';
    throw err;
  }
}

/**
 * Verifica un ID token de Firebase Auth enviado por el cliente y devuelve
 * el token decodificado con los datos del usuario autenticado.
 * @param {String} idToken - ID token emitido por Firebase Auth en el cliente
 * @returns {Promise<Object>} token decodificado (DecodedIdToken)
 */
async function verifyIdToken(idToken) {
  init();
  ensureInitialized();
  return getAuth().verifyIdToken(idToken);
}

/**
 * Inicializa Firebase Admin si hace falta y devuelve la instancia de Firestore lista para usar.
 * @returns {Object} instancia de Firestore (firebase-admin/firestore)
 */
function getFirestoreInstance() {
  init();
  ensureInitialized();
  return getFirestore();
}

/**
 * Indica si Firebase Admin ya fue inicializado exitosamente.
 * @returns {Boolean} true si la inicialización se completó sin errores
 */
function isInitialized() {
  return initialized;
}

/**
 * Devuelve el error capturado durante la última inicialización fallida, si lo hubo.
 * @returns {Error|null} error de inicialización o null si no hubo error
 */
function getInitializationError() {
  return initError;
}

module.exports = { init, verifyIdToken, isInitialized, getInitializationError, getFirestoreInstance, getAuth };

