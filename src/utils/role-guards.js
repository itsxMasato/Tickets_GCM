/* Documentado por: Miguel Flores */
'use strict';

const PROTECTED_ROLES = ['sac', 'jefe_inmediato', 'admin_area', 'supervisor_campo'];

function isProtectedRole(role) {
  return PROTECTED_ROLES.includes(role);
}

function assertRoleDeletable(role, message = 'No se puede eliminar un rol base del flujo operativo.') {
  if (isProtectedRole(role)) {
    const err = new Error(message);
    err.statusCode = 403;
    err.code = 'ROLE_PROTECTED';
    throw err;
  }
}

module.exports = { PROTECTED_ROLES, isProtectedRole, assertRoleDeletable };

