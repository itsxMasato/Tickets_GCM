const test = require('node:test');
const assert = require('node:assert/strict');
const { syncFirebaseAuthUser } = require('../src/utils/firebase-auth-sync');

test('creates a Firebase Auth user when the account does not exist yet', async () => {
  const calls = [];
  const authClient = {
    async getUserByEmail(email) {
      calls.push(['getUserByEmail', email]);
      const err = new Error('not found');
      err.code = 'auth/user-not-found';
      throw err;
    },
    async createUser(payload) {
      calls.push(['createUser', payload]);
      return { uid: 'abc', email: payload.email };
    },
    async updateUser() {
      throw new Error('should not update');
    },
  };

  const result = await syncFirebaseAuthUser({
    authClient,
    user: { username: 'Abner', full_name: 'Abner Lagos', email: 'abner@gcm.com' },
    password: 'Abner123',
  });

  assert.equal(result.email, 'abner@gcm.com');
  assert.deepEqual(calls[0], ['getUserByEmail', 'abner@gcm.com']);
  assert.equal(calls[1][0], 'createUser');
  assert.equal(calls[1][1].password, 'Abner123');
});

test('updates the existing Firebase Auth user when the account already exists', async () => {
  const calls = [];
  const authClient = {
    async getUserByEmail(email) {
      calls.push(['getUserByEmail', email]);
      return { uid: 'xyz', email };
    },
    async createUser() {
      throw new Error('should not create');
    },
    async updateUser(uid, payload) {
      calls.push(['updateUser', uid, payload]);
      return { uid, email: payload.email };
    },
  };

  await syncFirebaseAuthUser({
    authClient,
    user: { username: 'Abner', full_name: 'Abner Lagos', email: 'abner@gcm.com' },
    password: 'Abner123',
  });

  assert.equal(calls[1][0], 'updateUser');
  assert.equal(calls[1][1], 'xyz');
  assert.equal(calls[1][2].password, 'Abner123');
});
