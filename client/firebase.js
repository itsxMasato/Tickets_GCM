import { getApp, getApps, initializeApp } from 'firebase/app';
import { collection, doc, serverTimestamp, setDoc, getFirestore } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged } from 'firebase/auth';

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
