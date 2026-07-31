/* Documentado por: Miguel Flores */
'use strict';

const PROTECTED_ROLES = ['sac', 'jefe_inmediato', 'admin_area', 'supervisor_campo'];

/**
 * Indica si un rol es uno de los roles base del sistema (protegidos contra eliminación/reasignación).
 * @param {string} role - nombre del rol
 * @returns {boolean} true si el rol está en PROTECTED_ROLES
 */
function isProtectedRole(role) {
  return PROTECTED_ROLES.includes(role);
}

/**
 * Lanza un error (403/ROLE_PROTECTED) si el rol dado es un rol base protegido, impidiendo su borrado.
 * @param {string} role - nombre del rol a validar
 * @param {string} [message] - mensaje de error personalizado
 * @returns {void}
 */
function assertRoleDeletable(role, message = 'No se puede eliminar un rol base del flujo operativo.') {
  if (isProtectedRole(role)) {
    const err = new Error(message);
    err.statusCode = 403;
    err.code = 'ROLE_PROTECTED';
    throw err;
  }
}

module.exports = { PROTECTED_ROLES, isProtectedRole, assertRoleDeletable };

