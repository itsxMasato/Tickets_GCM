/* Documentado por: Miguel Flores */
'use strict';

/**
 * Orquesta el login intentando primero el flujo local (username/password contra la base local)
 * y, si falla con 401/404, hace fallback al flujo de Firebase: resuelve el email de login,
 * inicia sesión con Firebase, y canjea el idToken resultante contra el backend.
 * Cualquier otro error del login local (distinto de 401/404) se propaga sin intentar el fallback.
 * @param {Object} params
 * @param {string} params.identifier - username o email ingresado
 * @param {string} params.password - contraseña ingresada
 * @param {Function} params.localLogin - función que intenta el login local (identifier, password)
 * @param {Function} params.resolveLogin - función que resuelve el email de Firebase a partir del identifier
 * @param {Function} params.signInWithFirebaseEmail - función que autentica contra Firebase (email, password)
 * @param {Function} params.firebaseExchange - función que canjea el idToken de Firebase por sesión propia
 * @returns {Promise<Object>} resultado del login con { ...datos, mode: 'local'|'firebase' }
 */
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

