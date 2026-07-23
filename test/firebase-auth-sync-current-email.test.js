const test = require('node:test');
const assert = require('node:assert/strict');
const { syncFirebaseAuthUser } = require('../src/utils/firebase-auth-sync');

test('updates Firebase Auth user when email address changes and currentEmail is provided', async () => {
  const calls = [];
  const authClient = {
    async getUserByEmail(email) {
      calls.push(['getUserByEmail', email]);
      if (email === 'abner@oldmail.com') {
        return { uid: 'xyz', email };
      }
      const err = new Error('not found');
      err.code = 'auth/user-not-found';
      throw err;
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
    currentEmail: 'abner@oldmail.com',
    password: 'Abner123',
  });

  assert.deepEqual(calls[0], ['getUserByEmail', 'abner@oldmail.com']);
  assert.equal(calls[1][0], 'updateUser');
  assert.equal(calls[1][1], 'xyz');
  assert.equal(calls[1][2].email, 'abner@gcm.com');
});
