'use strict';

async function authenticateWithFallback({
  identifier,
  password,
  localLogin,
  resolveLogin,
  signInWithFirebaseEmail,
  firebaseExchange,
}) {
  if (!identifier || !password) {
    const error = new Error('Debe ingresar usuario y contraseña.');
    error.status = 400;
    throw error;
  }

  try {
    const localResult = await localLogin(identifier, password);
    return { ...localResult, mode: 'local' };
  } catch (err) {
    const status = err?.status || 500;
    if (status !== 401 && status !== 404) {
      throw err;
    }
  }

  const resolved = await resolveLogin(identifier);
  const { idToken } = await signInWithFirebaseEmail(resolved.email, password);
  const firebaseResult = await firebaseExchange(idToken);
  return { ...firebaseResult, mode: 'firebase' };
}

module.exports = { authenticateWithFallback };
