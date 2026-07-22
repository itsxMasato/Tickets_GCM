/* Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. */
'use strict';

const { EntitySchema } = require('typeorm');
const { ROLE_VALUES } = require('../enums');
const { bitBoolean } = require('../transformers');

/**
 * role_permissions — permisos customizables por empresa.
 *
 *   id              INT IDENTITY(1,1) PRIMARY KEY
 *   company_id      INT NOT NULL              → companies(id) ON DELETE CASCADE
 *   role            VARCHAR(20) NOT NULL      -- 'sac' | 'jefe_inmediato' | 'admin_area' | 'supervisor_campo'
 *   permission_key  VARCHAR(50) NOT NULL      -- 'manageUsers' | 'viewReports' | 'viewAllTickets' | etc.
 *   value           BIT NOT NULL              -- 1 = permitido, 0 = denegado
 *   CONSTRAINT UQ_role_perm UNIQUE (company_id, role, permission_key)
 *
 * Reemplaza la antigua `role_permissions/{roleKey}` (Firestore global) que
 * tenía un solo set de permisos por rol sin scope de empresa. Ahora cada
 * empresa puede customizar qué puede hacer cada rol: empresaA puede
 * permitir que su `admin_area` vea reportes, empresaB no.
 *
 * Los defaults globales siguen viviendo en código (`src/services/roles.service.js`
 * → `DEFAULTS`). El service hace:
 *   1. Carga override de la empresa: `role_permissions WHERE company_id = ? AND role = ?`.
 *   2. Si no hay override, devuelve el default del enum de rol.
 *   3. Si hay override parcial, mergea: los keys no overridden mantienen default.
 *
 * `permission_key` es el mismo set de 6 booleanos que ya existía:
 *   'manageUsers', 'manageCategories', 'viewReports', 'viewAllTickets',
 *   'createTicket', 'assign'.
 *
 * El `is_platform_admin` NO se modela acá — es un flag en `users` que
 * bypasea todos los checks de permisos. El `roles.service.js` siempre
 * devuelve `true` para platform admin sin consultar esta tabla.
 */
module.exports = new EntitySchema({
  name: 'RolePermission',
  tableName: 'role_permissions',
  columns: {
    id:             { primary: true, type: 'integer', generated: 'increment' },
    company_id:     { type: 'integer', nullable: false },
    role:           { type: 'simple-enum', enum: ROLE_VALUES, nullable: false },
    permission_key: { type: 'varchar', length: 50, nullable: false },
    value:          { type: 'integer', nullable: false, transformer: bitBoolean() },
  },
  indices: [
    { name: 'UQ_role_perm', unique: true, columns: ['company_id', 'role', 'permission_key'] },
  ],
});
