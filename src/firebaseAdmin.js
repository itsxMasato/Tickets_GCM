/* Documentado por: Miguel Flores */
'use strict'
const fs = require('fs');
const path = require('path');
const { initializeApp, cert, applicationDefault } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');

let initialized = false;
let initError = null;

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

async function verifyIdToken(idToken) {
  init();
  ensureInitialized();
  return getAuth().verifyIdToken(idToken);
}

function getFirestoreInstance() {
  init();
  ensureInitialized();
  return getFirestore();
}

function isInitialized() {
  return initialized;
}

function getInitializationError() {
  return initError;
}

module.exports = { init, verifyIdToken, isInitialized, getInitializationError, getFirestoreInstance, getAuth };

