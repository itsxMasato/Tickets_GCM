/* Documentado por: Miguel Flores */
'use strict'

const { EntitySchema } = require('typeorm');

module.exports = new EntitySchema({
  name: 'AuditLog',
  tableName: 'audit_log',
  columns: {
    id:          { primary: true, type: 'integer', generated: 'increment' },
    user_id:     { type: 'integer', nullable: true },
    company_id:  { type: 'integer', nullable: true },
    action_type: { type: 'varchar', length: 50, nullable: false },
    target_type: { type: 'varchar', length: 50, nullable: false },
    target_id:   { type: 'integer', nullable: true },
    target_code: { type: 'varchar', length: 50, nullable: true },
    description: { type: 'text', nullable: true },
    old_value:   { type: 'text', nullable: true },
    new_value:   { type: 'text', nullable: true },
    ip_address:  { type: 'varchar', length: 45, nullable: true },
    created_at:  { type: 'datetime', default: require('../timestamp-default').timestampDefault, nullable: false },
  },
});

