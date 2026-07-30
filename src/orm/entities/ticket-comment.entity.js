/* Documentado por: Miguel Flores */
'use strict'

const { EntitySchema } = require('typeorm');

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

