'use strict';

const { EntitySchema } = require('typeorm');

/**
 * categories — replica de la tabla en src/db/schema.sql.
 *
 *   id          INT IDENTITY(1,1) PRIMARY KEY
 *   name        NVARCHAR(255) UNIQUE NOT NULL
 *   active      BIT NOT NULL DEFAULT 1
 *   created_at  DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
 */
module.exports = new EntitySchema({
  name: 'Category',
  tableName: 'categories',
  columns: {
    id:         { primary: true, type: 'integer', generated: 'increment' },
    name:       { type: 'varchar', length: 255, unique: true, nullable: false },
    active:     { type: 'boolean', default: 1, nullable: false },
    created_at: { type: 'datetime', default: require('../timestamp-default').timestampDefault, nullable: false },
  },
});
