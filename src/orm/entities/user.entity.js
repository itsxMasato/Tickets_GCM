'use strict';

const { EntitySchema } = require('typeorm');
const { ROLE_VALUES } = require('../enums');

/**
 * users — replica de la tabla en src/db/schema.sql.
 *
 *   id            INT IDENTITY(1,1) PRIMARY KEY
 *   username      NVARCHAR(255) UNIQUE NOT NULL
 *   password_hash NVARCHAR(255) NOT NULL
 *   full_name     NVARCHAR(255) NOT NULL
 *   email         NVARCHAR(255) NULL
 *   role          VARCHAR(20) NOT NULL  -- simple-enum: 4 valores
 *   area          NVARCHAR(100) NULL
 *   active        BIT NOT NULL DEFAULT 1
 *   created_at    DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
 *
 * Notas de la capa ORM:
 *   - `active` se persiste como 0/1 (BIT) sin transformer; cuando los servicios
 *     migren al ORM se agregará un transformer para boolean real en JS.
 *   - FK ON DELETE: la app actual no tiene FKs desde users (es la tabla padre);
 *     el resto de las entidades referencia users con CASCADE o SET NULL, definido
 *     en la T-SQL del schema MSSQL (fuera de scope de esta sesión).
 */
module.exports = new EntitySchema({
  name: 'User',
  tableName: 'users',
  columns: {
    id:            { primary: true, type: 'integer', generated: 'increment' },
    username:      { type: 'varchar', length: 255, unique: true, nullable: false },
    password_hash: { type: 'varchar', length: 255, nullable: false },
    full_name:     { type: 'varchar', length: 255, nullable: false },
    email:         { type: 'varchar', length: 255, nullable: true },
    role:          { type: 'simple-enum', enum: ROLE_VALUES, nullable: false },
    area:          { type: 'varchar', length: 100, nullable: true },
    active:        { type: 'boolean', default: 1, nullable: false },
    created_at:    { type: 'datetime', default: require('../timestamp-default').timestampDefault, nullable: false },
  },
});
