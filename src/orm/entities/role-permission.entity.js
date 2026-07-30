/* Documentado por: Miguel Flores */
'use strict'

const { EntitySchema } = require('typeorm');
const { ROLE_VALUES } = require('../enums');
const { bitBoolean } = require('../transformers');

module.exports = new EntitySchema({
  name: 'RolePermission',
  tableName: 'role_permissions',
  columns: {
    id:             { primary: true, type: 'integer', generated: 'increment' },
    company_id:     { type: 'integer', nullable: false },
    role:           { type: 'simple-enum', enum: ROLE_VALUES, nullable: false },
    permission_key: { type: 'varchar', length: 50, nullable: false },
    value:          { type: 'integer', nullable: false, transformer: bitBoolean() },
  },
  indices: [
    { name: 'UQ_role_perm', unique: true, columns: ['company_id', 'role', 'permission_key'] },
  ],
});

