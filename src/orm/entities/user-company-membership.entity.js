/* Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. */
'use strict';

const { EntitySchema } = require('typeorm');
const { ROLE_VALUES } = require('../enums');
const { bitBoolean } = require('../transformers');

/**
 * user_company_memberships — multi-membresía. Un usuario puede pertenecer a N
 * empresas con rol y área distintos en cada una.
 *
 *   id            INT IDENTITY(1,1) PRIMARY KEY
 *   user_id       INT NOT NULL              → users(id) ON DELETE CASCADE
 *   company_id    INT NOT NULL              → companies(id) ON DELETE CASCADE
 *   role          VARCHAR(20) NOT NULL      -- 'supervisor_campo' | 'sac' | 'admin_area' | 'jefe_inmediato'
 *   area_key      NVARCHAR(50) NULL         -- FK lógica a company_areas(company_id, key)
 *   active        BIT NOT NULL DEFAULT 1
 *   is_default    BIT NOT NULL DEFAULT 0    -- membresía seleccionada al login si hay >1
 *   created_at    DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
 *   last_seen_at  DATETIME2 NULL
 *   CONSTRAINT UQ_user_company UNIQUE (user_id, company_id)
 *
 * Multi-tenant core: la membresía es la fuente operativa de "qué puede hacer
 * este usuario en esta empresa". La tabla `users` queda como identidad global
 * (autenticación); `role` y `area` se eliminan de `users` y migran a la
 * membresía. `is_default` marca cuál se selecciona automáticamente al login
 * cuando el usuario tiene varias; si no hay default, el sistema exige
 * selección explícita en el paso 2 del login.
 *
 * El login flow:
 *   1. username + password → valida credenciales.
 *   2. si memberships > 1 → pide selector de empresa.
 *   3. si memberships = 1 → toma esa como active.
 *   4. si memberships = 0 → error 403 NO_MEMBERSHIP.
 *
 * `last_seen_at` se actualiza en cada request autenticado, útil para el
 * ranking de actividad y para detectar membresías inactivas.
 */
module.exports = new EntitySchema({
  name: 'UserCompanyMembership',
  tableName: 'user_company_memberships',
  columns: {
    id:           { primary: true, type: 'integer', generated: 'increment' },
    user_id:      { type: 'integer', nullable: false },
    company_id:   { type: 'integer', nullable: false },
    role:         { type: 'simple-enum', enum: ROLE_VALUES, nullable: false },
    area_key:     { type: 'varchar', length: 50, nullable: true },
    active:       { type: 'integer', default: 1, nullable: false, transformer: bitBoolean() },
    is_default:   { type: 'integer', default: 0, nullable: false, transformer: bitBoolean() },
    created_at:   { type: 'datetime', default: require('../timestamp-default').timestampDefault, nullable: false },
    last_seen_at: { type: 'datetime', nullable: true },
  },
  indices: [
    { name: 'UQ_user_company', unique: true, columns: ['user_id', 'company_id'] },
    { name: 'IX_company_user', columns: ['company_id', 'user_id'] },
  ],
});
