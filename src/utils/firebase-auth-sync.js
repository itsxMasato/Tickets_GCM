/* Documentado por: Miguel Flores */
'use strict';

/**
 * Sincroniza un usuario de la app con Firebase Authentication: busca si ya existe una cuenta
 * de Firebase Auth con el email actual o el anterior (por si cambió), y la actualiza; si no
 * existe ninguna, crea una cuenta nueva (requiere password en ese caso).
 * @param {Object} params
 * @param {Object} params.authClient - cliente de Firebase Admin Auth (getUserByEmail/updateUser/createUser)
 * @param {Object} params.user - usuario de la app (email, full_name, username)
 * @param {string} [params.password] - contraseña a setear/usar al crear la cuenta
 * @param {string} [params.currentEmail] - email previo del usuario, para detectar cambios de email
 * @returns {Promise<{email: string, uid: string, created: boolean}>} resultado de la sincronización
 */
async function syncFirebaseAuthUser({ authClient, user, password, currentEmail }) {
  if (!authClient || typeof authClient.getUserByEmail !== 'function') {
    throw new Error('authClient must implement getUserByEmail');
  }
  if (!user?.email) {
    throw new Error('user.email is required for Firebase auth sync');
  }

  const newEmail = String(user.email).trim().toLowerCase();
  const currentEmailNormalized = currentEmail ? String(currentEmail).trim().toLowerCase() : null;
  const updatePayload = {
    email: newEmail,
    displayName: user.full_name || user.username || newEmail,
  };
  if (password) {
    updatePayload.password = password;
  }

  /**
   * Busca un usuario de Firebase Auth por email, devolviendo null si no existe
   * (en vez de propagar el error auth/user-not-found).
   * @param {string} email - email a buscar
   * @returns {Promise<Object|null>} usuario de Firebase Auth encontrado, o null
   */
  async function findByEmail(email) {
    try {
      return await authClient.getUserByEmail(email);
    } catch (err) {
      if (err?.code === 'auth/user-not-found') return null;
      throw err;
    }
  }

  let existing = null;
  if (currentEmailNormalized && currentEmailNormalized !== newEmail) {
    existing = await findByEmail(currentEmailNormalized);
  }
  if (!existing) {
    existing = await findByEmail(newEmail);
  }

  if (existing?.uid) {
    if (typeof authClient.updateUser !== 'function') {
      throw new Error('authClient must implement updateUser');
    }
    await authClient.updateUser(existing.uid, updatePayload);
    return { email: newEmail, uid: existing.uid, created: false };
  }

  if (typeof authClient.createUser !== 'function') {
    throw new Error('authClient must implement createUser');
  }
  if (!password) {
    throw new Error('password is required to create Firebase auth user');
  }

  const created = await authClient.createUser({
    email: newEmail,
    displayName: user.full_name || user.username || newEmail,
    password,
  });
  return { email: newEmail, uid: created?.uid, created: true };
}

module.exports = { syncFirebaseAuthUser };

