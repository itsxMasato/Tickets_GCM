/* Documentado por: Miguel Flores */
'use strict'

const { EntitySchema } = require('typeorm');

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

