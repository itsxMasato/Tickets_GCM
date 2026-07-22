/* Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. */
'use strict';

const { EntitySchema } = require('typeorm');

/**
 * ticket_comments — chat del ticket.
 *
 *   id             INT IDENTITY(1,1) PRIMARY KEY
 *   ticket_id      INT NOT NULL              → tickets(id) ON DELETE CASCADE
 *   user_id        INT NOT NULL              → users(id)
 *   comment        NVARCHAR(MAX) NOT NULL
 *   attachment_id  INT NULL                  → attachments(id) ON DELETE CASCADE
 *   created_at     DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
 */
module.exports = new EntitySchema({
  name: 'TicketComment',
  tableName: 'ticket_comments',
  columns: {
    id:            { primary: true, type: 'integer', generated: 'increment' },
    ticket_id:     { type: 'integer', nullable: false },
    user_id:       { type: 'integer', nullable: false },
    comment:       { type: 'text', nullable: false },
    attachment_id: { type: 'integer', nullable: true },
    created_at:    { type: 'datetime', default: require('../timestamp-default').timestampDefault, nullable: false },
  },
});
