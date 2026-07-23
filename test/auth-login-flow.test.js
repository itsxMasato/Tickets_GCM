const test = require('node:test');
const assert = require('node:assert/strict');
const { authenticateWithFallback } = require('../src/utils/auth-login-flow');

test('uses local login first when the password is valid', async () => {
  let localCalls = 0;
  let firebaseCalls = 0;

  const result = await authenticateWithFallback({
    identifier: 'abner',
    password: 'Abner123',
    localLogin: async () => {
      localCalls += 1;
      return { user: { id: 42, username: 'abner' } };
    },
    resolveLogin: async () => {
      throw new Error('resolveLogin should not be called');
    },
    signInWithFirebaseEmail: async () => {
      firebaseCalls += 1;
      return { idToken: 'token' };
    },
    firebaseExchange: async () => {
      firebaseCalls += 1;
      return { user: { id: 99 } };
    },
  });

  assert.equal(localCalls, 1);
  assert.equal(firebaseCalls, 0);
  assert.equal(result.mode, 'local');
  assert.equal(result.user.username, 'abner');
});

test('falls back to Firebase when local login fails with invalid credentials', async () => {
  let localCalls = 0;
  let firebaseCalls = 0;

  const result = await authenticateWithFallback({
    identifier: 'abner',
    password: 'wrong',
    localLogin: async () => {
      localCalls += 1;
      const error = new Error('Credenciales inválidas.');
      error.status = 401;
      throw error;
    },
    resolveLogin: async () => ({ email: 'abner@ticketsgcm.local' }),
    signInWithFirebaseEmail: async () => {
      firebaseCalls += 1;
      return { idToken: 'token' };
    },
    firebaseExchange: async () => {
      firebaseCalls += 1;
      return { user: { id: 7, username: 'abner' } };
    },
  });

  assert.equal(localCalls, 1);
  assert.equal(firebaseCalls, 2);
  assert.equal(result.mode, 'firebase');
  assert.equal(result.user.username, 'abner');
});
