'use strict';

const { EntitySchema } = require('typeorm');
const { NOTIFICATION_TYPE_VALUES } = require('../enums');

/**
 * notifications — inbox por usuario.
 *
 *   id          INT IDENTITY(1,1) PRIMARY KEY
 *   user_id     INT NOT NULL                → users(id) ON DELETE CASCADE
 *   type        VARCHAR(40) NOT NULL        -- simple-enum, 8 valores
 *   ticket_id   INT NULL                    → tickets(id) ON DELETE CASCADE
 *   title       NVARCHAR(255) NOT NULL
 *   body        NVARCHAR(MAX) NULL
 *   read        BIT NOT NULL DEFAULT 0
 *   created_at  DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
 */
module.exports = new EntitySchema({
  name: 'Notification',
  tableName: 'notifications',
  columns: {
    id:         { primary: true, type: 'integer', generated: 'increment' },
    user_id:    { type: 'integer', nullable: false },
    type:       { type: 'simple-enum', enum: NOTIFICATION_TYPE_VALUES, nullable: false },
    ticket_id:  { type: 'integer', nullable: true },
    title:      { type: 'varchar', length: 255, nullable: false },
    body:       { type: 'text', nullable: true },
    read:       { type: 'boolean', default: 0, nullable: false },
    created_at: { type: 'datetime', default: require('../timestamp-default').timestampDefault, nullable: false },
  },
});
