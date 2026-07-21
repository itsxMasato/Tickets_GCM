/* Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. */
'use strict';

const { EntitySchema } = require('typeorm');
const { CALENDAR_EVENT_TYPE_VALUES } = require('../enums');

/**
 * calendar_events — bloques de tiempo personales que cada usuario programa
 * en su Gantt. Opcionalmente se vinculan a un ticket para indicar "voy a
 * trabajar este ticket entre estas fechas".
 *
 *   id           INT IDENTITY(1,1) PRIMARY KEY
 *   user_id      INT NOT NULL                  → users(id) ON DELETE CASCADE
 *   company_id   INT NOT NULL                  → companies(id) ON DELETE RESTRICT
 *   ticket_id    INT NULL                      → tickets(id) ON DELETE SET NULL
 *   title        NVARCHAR(200) NOT NULL
 *   notes        NVARCHAR(MAX) NULL
 *   start_at     DATETIME2 NOT NULL
 *   end_at       DATETIME2 NOT NULL
 *   color        VARCHAR(20) NULL              -- token del set canónico: ocean, deep, accent, brand
 *   type         VARCHAR(20) NOT NULL DEFAULT 'personal'  -- simple-enum
 *   created_at   DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
 *   updated_at   DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
 *
 * Multi-tenant (Fase 1):
 *   - `company_id` se agrega para queries cross-tenant del usuario sin
 *     tener que hacer JOIN a users. En Fase 6 el filtro se aplica en el
 *     service de calendario.
 *
 * Reglas de invariante (las valida calendar.service.js):
 *   - end_at > start_at
 *   - title 1..200 chars
 *   - color ∈ { ocean, deep, accent, brand }  (default 'ocean')
 *   - type ∈ CALENDAR_EVENT_TYPE_VALUES
 *
 * Migración a MSSQL: agregar la tabla via ORM_SYNCHRONIZE=true en dev, o
 * pegar el CREATE TABLE del espejo SQLite (ver src/db/schema.sql).
 */
module.exports = new EntitySchema({
  name: 'CalendarEvent',
  tableName: 'calendar_events',
  columns: {
    id:         { primary: true, type: 'integer', generated: 'increment' },
    user_id:    { type: 'integer', nullable: false },
    company_id: { type: 'integer', nullable: true },
    ticket_id:  { type: 'integer', nullable: true },
    title:      { type: 'varchar', length: 200, nullable: false },
    notes:      { type: 'text', nullable: true },
    start_at:   { type: 'datetime', nullable: false },
    end_at:     { type: 'datetime', nullable: false },
    color:      { type: 'varchar', length: 20, nullable: true },
    type:       { type: 'simple-enum', enum: CALENDAR_EVENT_TYPE_VALUES, default: 'personal', nullable: false },
    created_at: { type: 'datetime', default: require('../timestamp-default').timestampDefault, nullable: false },
    updated_at: { type: 'datetime', default: require('../timestamp-default').timestampDefault, nullable: false },
  },
});
