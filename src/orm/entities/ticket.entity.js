/* Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. */
'use strict';

const { EntitySchema } = require('typeorm');
const { TICKET_STATUS_VALUES, TICKET_PRIORITY_VALUES } = require('../enums');

/**
 * tickets — núcleo del dominio. Replica src/db/schema.sql.
 *
 *   id           INT IDENTITY(1,1) PRIMARY KEY
 *   company_id   INT NOT NULL                 → companies(id) ON DELETE RESTRICT
 *   code         NVARCHAR(50) UNIQUE NOT NULL
 *   title        NVARCHAR(255) NOT NULL
 *   description  NVARCHAR(MAX) NOT NULL
 *   category_id  INT NULL                  → categories(id) ON DELETE SET NULL
 *   area         NVARCHAR(100) NULL
 *   status       VARCHAR(20) NOT NULL      -- simple-enum, default 'recibido'
 *   priority     VARCHAR(20) NOT NULL      -- simple-enum, default 'media'
 *   created_by   INT NOT NULL              → users(id)
 *   assigned_to  INT NULL                  → users(id)
 *   closed_by    INT NULL                  → users(id)
 *   created_at   DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
 *   updated_at   DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
 *   closed_at    DATETIME2 NULL
 *
 * Multi-tenant (Fase 1):
 *   - `company_id` se agrega ahora como NULL para backfill; en Fase 10
 *     el seed lo rellena y el DBA pasa la columna a NOT NULL.
 *   - En Fase 6 el filtro company_id se aplica en todas las queries
 *     del servicio de tickets.
 *
 * TODO(orm): cuando este servicio migre al ORM, los dos `db.transaction()`
 *   en tickets.service.js (assignTicket, changeStatus) se reemplazan por
 *   `await AppDataSource.transaction(async manager => { ... })`.
 */
module.exports = new EntitySchema({
  name: 'Ticket',
  tableName: 'tickets',
  columns: {
    id:           { primary: true, type: 'integer', generated: 'increment' },
    company_id:   { type: 'integer', nullable: true },
    code:         { type: 'varchar', length: 50, unique: true, nullable: false },
    title:        { type: 'varchar', length: 255, nullable: false },
    description:  { type: 'text', nullable: false },
    category_id:  { type: 'integer', nullable: true },
    area:         { type: 'varchar', length: 100, nullable: true },
    status:       { type: 'simple-enum', enum: TICKET_STATUS_VALUES, default: 'recibido', nullable: false },
    priority:     { type: 'simple-enum', enum: TICKET_PRIORITY_VALUES, default: 'media', nullable: false },
    created_by:   { type: 'integer', nullable: false },
    assigned_to:  { type: 'integer', nullable: true },
    closed_by:    { type: 'integer', nullable: true },
    created_at:   { type: 'datetime', default: require('../timestamp-default').timestampDefault, nullable: false },
    updated_at:   { type: 'datetime', default: require('../timestamp-default').timestampDefault, nullable: false },
    closed_at:    { type: 'datetime', nullable: true },
  },
});
