/* Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. */
import { getApp, getApps, initializeApp } from 'firebase/app';
import { collection, doc, serverTimestamp, setDoc, getFirestore } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from 'firebase/auth';
import { api } from './api.js';

const firebaseConfig = {
  apiKey: 'AIzaSyA2XWVQzinsD5psKBAytqPZTPHZZ-PimDs',
  authDomain: 'ticketsgcm.firebaseapp.com',
  projectId: 'ticketsgcm',
  storageBucket: 'ticketsgcm.appspot.com',
  messagingSenderId: '904822562355',
  appId: '1:904822562355:web:a4a884b91aec37189b4d46',
};

let firebaseInitPromise = null;

export async function initializeFirebase() {
  if (firebaseInitPromise) return firebaseInitPromise;

  firebaseInitPromise = (async () => {
    const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    const db = getFirestore(app);
    const auth = getAuth(app);

    // Optional: onAuthStateChanged hook para debug
    onAuthStateChanged(auth, (u) => {
      if (u) console.info('[firebase] user signed in', u.email);
    });

    const bootstrapRef = doc(collection(db, 'gcm_bootstrap'), 'app-start');
    await setDoc(bootstrapRef, {
      initializedAt: serverTimestamp(),
      source: 'tickets-gcm',
      appName: 'Tickets GCM',
    });

    console.info('[firebase] Firestore listo y colección creada:', 'gcm_bootstrap');
    return { app, db, auth };
  })();

  return firebaseInitPromise;
}

export async function signInWithFirebaseEmail(email, password) {
  const appInfo = await initializeFirebase();
  const auth = appInfo.auth;
  if (!auth) throw new Error('Auth no inicializado');
  const userCred = await signInWithEmailAndPassword(auth, email, password);
  const idToken = await userCred.user.getIdToken();
  return { idToken, user: userCred.user };
}

// verifyCurrentPassword — usada por el gate de contraseña antes de exportar
// (ticket-detail, tickets-list, reports, audit, users, companies). El check
// local (`/api/auth/verify-password`) sólo compara contra el password_hash
// guardado en Firestore; los usuarios migrados a Firebase Auth (ver
// bootstrap-firebase-auth.js) tienen ese hash desactualizado, así que
// siempre daba "contraseña incorrecta" aunque la contraseña real (la de
// Firebase) fuera correcta. Mismo fallback de dos pasos que ya usa el
// login (onSubmit en login.js): local primero, Firebase después.
export async function verifyCurrentPassword(password) {
  try {
    await api.auth.verifyPassword({ password });
    return true;
  } catch (err) {
    // Sólo reintentamos si el fallo fue de credenciales; un error de red o
    // de servidor debe propagarse tal cual, no disfrazarse de "incorrecta".
    if (err?.status !== 400 && err?.status !== 401 && err?.status !== 404) throw err;
  }

  const { user } = await api.auth.me();
  const identifier = user?.username || user?.email;
  if (!identifier) throw Object.assign(new Error('Contraseña incorrecta.'), { status: 401 });

  try {
    const { email } = await api.auth.resolveLogin({ identifier });
    await signInWithFirebaseEmail(email, password);
    return true;
  } catch {
    throw Object.assign(new Error('Contraseña incorrecta.'), { status: 401 });
  }
}

// signOutFirebase — "cerrar sesión" en la app solo destruía la sesión de
// Express (api.auth.logout); la credencial de Firebase Auth se guarda con
// persistencia por defecto en IndexedDB y quedaba viva en el navegador sin
// que la app tuviera forma de verla ni cerrarla. En una máquina compartida,
// "cerrar sesión" no cerraba sesión de verdad. Best-effort: si Firebase
// nunca se inicializó o no hay usuario, no hace nada.
export async function signOutFirebase() {
  try {
    const appInfo = await initializeFirebase();
    if (appInfo.auth?.currentUser) await signOut(appInfo.auth);
  } catch (e) {
    console.warn('[firebase] no se pudo cerrar la sesión de Firebase Auth:', e?.message || e);
  }
}
