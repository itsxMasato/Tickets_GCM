/* Documentado por: Miguel Flores */
'use strict'

const { EntitySchema } = require('typeorm');
const { NOTIFICATION_TYPE_VALUES } = require('../enums');
const { bitBoolean } = require('../transformers');

module.exports = new EntitySchema({
  name: 'Notification',
  tableName: 'notifications',
  columns: {
    id:         { primary: true, type: 'integer', generated: 'increment' },
    user_id:    { type: 'integer', nullable: false },
    company_id: { type: 'integer', nullable: true },
    type:       { type: 'simple-enum', enum: NOTIFICATION_TYPE_VALUES, nullable: false },
    ticket_id:  { type: 'integer', nullable: true },
    title:      { type: 'varchar', length: 255, nullable: false },
    body:       { type: 'text', nullable: true },
    read:       { type: 'integer', default: 0, nullable: false, transformer: bitBoolean() },
    created_at: { type: 'datetime', default: require('../timestamp-default').timestampDefault, nullable: false },
  },
});

