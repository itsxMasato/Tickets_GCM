/* Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. */
'use strict';

const { EntitySchema } = require('typeorm');
const { bitBoolean } = require('../transformers');

/**
 * companies — entidades tenant. Cada empresa del grupo GCM.
 *
 *   id          INT IDENTITY(1,1) PRIMARY KEY
 *   name        NVARCHAR(200) NOT NULL            -- "GCM Norte", "Oficina principal"
 *   slug        NVARCHAR(50)  UNIQUE NOT NULL     -- "gcm-norte", "oficina-principal"
 *   logo_url    NVARCHAR(500) NULL                -- asset servido por /uploads o CDN
 *   color       NVARCHAR(20)  NULL                -- hex "#0F2A47" o token "navy" para fallback
 *   active      BIT NOT NULL DEFAULT 1
 *   is_default  BIT NOT NULL DEFAULT 0            -- empresa asignada a registros legacy en la migración
 *   created_at  DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
 *   updated_at  DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
 *
 * Multi-tenant core: todos los datos de negocio (tickets, users, categories, etc.)
 * referencian a una `companies.id` vía `company_id`. El flag `is_default` se usa
 * durante la migración inicial para que los registros preexistentes se asignen
 * a la empresa legacy (típicamente "GCM Central") y se puedan migrar después.
 *
 * `slug` es UNIQUE global y se usa en URLs amigables. Se autogenera a partir
 * de `name` (slugify), pero se puede customizar al crear la empresa.
 *
 * El `color` es el accent del brand contextual (sidebar, topbar, badges).
 * Si es NULL, el layout usa los tokens del brand del grupo.
 */
module.exports = new EntitySchema({
  name: 'Company',
  tableName: 'companies',
  columns: {
    id:         { primary: true, type: 'integer', generated: 'increment' },
    name:       { type: 'varchar', length: 200, nullable: false },
    slug:       { type: 'varchar', length: 50,  unique: true, nullable: false },
    logo_url:   { type: 'varchar', length: 500, nullable: true },
    color:      { type: 'varchar', length: 20,  nullable: true },
    active:     { type: 'integer', default: 1, nullable: false, transformer: bitBoolean() },
    is_default: { type: 'integer', default: 0, nullable: false, transformer: bitBoolean() },
    created_at: { type: 'datetime', default: require('../timestamp-default').timestampDefault, nullable: false },
    updated_at: { type: 'datetime', default: require('../timestamp-default').timestampDefault, nullable: false },
  },
});
