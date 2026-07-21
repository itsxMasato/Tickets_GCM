/* Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. */
'use strict';

const { EntitySchema } = require('typeorm');
const { bitBoolean } = require('../transformers');

/**
 * categories — replica de la tabla en src/db/schema.sql.
 *
 *   id          INT IDENTITY(1,1) PRIMARY KEY
 *   company_id  INT NOT NULL                 → companies(id) ON DELETE RESTRICT
 *   name        NVARCHAR(255) NOT NULL
 *   active      BIT NOT NULL DEFAULT 1
 *   created_at  DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
 *
 * Multi-tenant (Fase 1):
 *   - El UNIQUE pasa de solo `name` a `(company_id, name)` en MSSQL.
 *     `unique: true` acá se queda en `name` para no romper la columna
 *     legacy; el constraint compuesto se declara en el T-SQL del DBA.
 */
module.exports = new EntitySchema({
  name: 'Category',
  tableName: 'categories',
  columns: {
    id:         { primary: true, type: 'integer', generated: 'increment' },
    company_id: { type: 'integer', nullable: true },
    name:       { type: 'varchar', length: 255, nullable: false },
    active:     { type: 'integer', default: 1, nullable: false, transformer: bitBoolean() },
    created_at: { type: 'datetime', default: require('../timestamp-default').timestampDefault, nullable: false },
  },
});
