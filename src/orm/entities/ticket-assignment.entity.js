/* Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. */
'use strict';

const { EntitySchema } = require('typeorm');

/**
 * ticket_assignments — historial de reasignaciones.
 *
 *   id            INT IDENTITY(1,1) PRIMARY KEY
 *   ticket_id     INT NOT NULL              → tickets(id) ON DELETE CASCADE
 *   from_user_id  INT NULL                  → users(id)  (nullable: asignación inicial)
 *   to_user_id    INT NOT NULL              → users(id)
 *   assigned_by   INT NOT NULL              → users(id)
 *   notes         NVARCHAR(MAX) NULL
 *   assigned_at   DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
 */
module.exports = new EntitySchema({
  name: 'TicketAssignment',
  tableName: 'ticket_assignments',
  columns: {
    id:           { primary: true, type: 'integer', generated: 'increment' },
    ticket_id:    { type: 'integer', nullable: false },
    from_user_id: { type: 'integer', nullable: true },
    to_user_id:   { type: 'integer', nullable: false },
    assigned_by:  { type: 'integer', nullable: false },
    notes:        { type: 'text', nullable: true },
    assigned_at:  { type: 'datetime', default: require('../timestamp-default').timestampDefault, nullable: false },
  },
});
