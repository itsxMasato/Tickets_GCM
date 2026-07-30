/* Documentado por: Miguel Flores */
'use strict';

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

