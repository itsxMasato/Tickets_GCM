'use strict';

const { EntitySchema } = require('typeorm');

/**
 * attachments — archivos subidos a tickets.
 *
 *   id             INT IDENTITY(1,1) PRIMARY KEY
 *   ticket_id      INT NOT NULL              → tickets(id) ON DELETE CASCADE
 *   user_id        INT NOT NULL              → users(id)
 *   comment_id     INT NULL                  → ticket_comments(id) ON DELETE SET NULL
 *   filename       NVARCHAR(255) NOT NULL    -- nombre en disco
 *   original_name  NVARCHAR(255) NOT NULL    -- nombre original subido
 *   mime_type      NVARCHAR(100) NOT NULL
 *   size           INT NOT NULL
 *   uploaded_at    DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
 */
module.exports = new EntitySchema({
  name: 'Attachment',
  tableName: 'attachments',
  columns: {
    id:            { primary: true, type: 'integer', generated: 'increment' },
    ticket_id:     { type: 'integer', nullable: false },
    user_id:       { type: 'integer', nullable: false },
    comment_id:    { type: 'integer', nullable: true },
    filename:      { type: 'varchar', length: 255, nullable: false },
    original_name: { type: 'varchar', length: 255, nullable: false },
    mime_type:     { type: 'varchar', length: 100, nullable: false },
    size:          { type: 'integer', nullable: false },
    uploaded_at:   { type: 'datetime', default: require('../timestamp-default').timestampDefault, nullable: false },
  },
});
