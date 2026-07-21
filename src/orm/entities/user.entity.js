/* Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. */
'use strict';

const { EntitySchema } = require('typeorm');
const { ROLE_VALUES } = require('../enums');
const { bitBoolean } = require('../transformers');

/**
 * users — replica de la tabla en src/db/schema.sql.
 *
 *   id                  INT IDENTITY(1,1) PRIMARY KEY
 *   username            NVARCHAR(255) UNIQUE NOT NULL
 *   password_hash       NVARCHAR(255) NOT NULL
 *   full_name           NVARCHAR(255) NOT NULL
 *   email               NVARCHAR(255) NULL
 *   is_platform_admin   BIT NOT NULL DEFAULT 0   -- bypass cross-tenant
 *   active              BIT NOT NULL DEFAULT 1
 *   created_at          DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
 *
 * Multi-tenant (Fase 1):
 *   - `role` y `area` se mantienen por compat con la sesión actual; en
 *     Fase 2 se migran a user_company_memberships y se quitan de acá.
 *   - `is_platform_admin` permite bypass del scope por empresa (Miguel).
 *     Cuando está activo, el middleware lo trata como superusuario.
 *
 * Notas de la capa ORM:
 *   - `active` e `is_platform_admin` se persisten como 0/1 (BIT en MSSQL,
 *     INTEGER en SQLite) con transformer `bitBoolean()` (ver
 *     src/orm/transformers.js) para que la capa JS siempre vea boolean
 *     estricto. La razón de no usar `type: 'boolean'` es que TypeORM 1.0
 *     + better-sqlite3 hidrata boolean columns como `false` siempre.
 *   - FK ON DELETE: la app actual no tiene FKs desde users (es la tabla padre);
 *     el resto de las entidades referencia users con CASCADE o SET NULL, definido
 *     en la T-SQL del schema MSSQL (fuera de scope de esta sesión).
 */
module.exports = new EntitySchema({
  name: 'User',
  tableName: 'users',
  columns: {
    id:                { primary: true, type: 'integer', generated: 'increment' },
    username:          { type: 'varchar', length: 255, unique: true, nullable: false },
    password_hash:     { type: 'varchar', length: 255, nullable: false },
    full_name:         { type: 'varchar', length: 255, nullable: false },
    email:             { type: 'varchar', length: 255, nullable: true },
    is_platform_admin: { type: 'integer', default: 0, nullable: false, transformer: bitBoolean() },
    active:            { type: 'integer', default: 1, nullable: false, transformer: bitBoolean() },
    created_at:        { type: 'datetime', default: require('../timestamp-default').timestampDefault, nullable: false },
  },
});
