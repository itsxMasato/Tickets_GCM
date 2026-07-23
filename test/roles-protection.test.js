const test = require('node:test');
const assert = require('node:assert/strict');

const { PROTECTED_ROLES, isProtectedRole, assertRoleDeletable } = require('../src/utils/role-guards');

test('los roles base del flujo quedan protegidos frente al borrado', () => {
  assert.deepEqual(PROTECTED_ROLES, ['sac', 'jefe_inmediato', 'admin_area', 'supervisor_campo']);
  for (const role of PROTECTED_ROLES) {
    assert.equal(isProtectedRole(role), true);
  }
  assert.throws(() => assertRoleDeletable('sac'), /No se puede eliminar/i);
  assert.doesNotThrow(() => assertRoleDeletable('custom_role'));
});
