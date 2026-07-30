/* Documentado por: Miguel Flores */
import { getApp, getApps, initializeApp } from 'firebase/app';
import { collection, doc, serverTimestamp, setDoc, getFirestore } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword, signOut, setPersistence, browserSessionPersistence } from 'firebase/auth';
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
    await setPersistence(auth, browserSessionPersistence);

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

export async function verifyCurrentPassword(password) {
  try {
    await api.auth.verifyPassword({ password });
    return true;
  } catch (err) {
    if (err?.status !== 400 && err?.status !== 401 && err?.status !== 404)
      throw err;
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

export async function signOutFirebase() {
  try {
    const appInfo = await initializeFirebase();
    if (appInfo.auth?.currentUser) await signOut(appInfo.auth);
  } catch (e) {
    console.warn('[firebase] no se pudo cerrar la sesión de Firebase Auth:', e?.message || e);
  }
}

