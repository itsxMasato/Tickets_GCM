'use strict';
const fs = require('fs');
const path = require('path');
const { initializeApp, cert, applicationDefault } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');

// Inicializa Firebase Admin si hay credenciales en entorno.
// Soporta dos formas:
//  - FIREBASE_SERVICE_ACCOUNT: JSON string con la llave del service account
//  - FIREBASE_SERVICE_ACCOUNT_PATH: path al JSON del service account

let initialized = false;
let initError = null;

function init() {
  if (initialized) return;
  try {
    // Prefer explicit JSON in env
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

    // If a path to a service account JSON is provided, try reading it to infer project_id
    if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
      const saPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
      let projectId = process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || null;
      try {
        const content = fs.readFileSync(saPath, 'utf8');
        const json = JSON.parse(content);
        if (json && json.project_id) projectId = projectId || json.project_id;
      } catch (e) {
        // Could be a path that the cert helper can resolve, fallthrough
      }
      const opts = projectId ? { credential: cert(saPath), projectId } : { credential: cert(saPath) };
      initializeApp(opts);
      initialized = true;
      initError = null;
      console.info('[firebaseAdmin] Inicializado desde FIREBASE_SERVICE_ACCOUNT_PATH');
      return;
    }
    // Intentar inicialización por defecto (ADC) — funciona en GCP o cuando
    // GOOGLE_APPLICATION_CREDENTIALS está seteada. Preferimos pasar projectId
    // si está disponible en las variables de entorno.
    const defaultProject = process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || null;
    if (defaultProject) {
      initializeApp({ credential: applicationDefault(), projectId: defaultProject });
    } else {
      initializeApp();
    }
    initialized = true;
    initError = null;
    console.info('[firebaseAdmin] Inicializado con credenciales por defecto');
    // Verificar que Firestore tiene projectId utilizable
    try {
      const db = getFirestore();
      const pid = db && db.app && db.app.options && db.app.options.projectId;
      if (!pid) {
        throw new Error('No se detectó Project ID tras inicializar credenciales por defecto');
      }
    } catch (e) {
      // Marca como no inicializado y guarda el error para mensajes claros
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
