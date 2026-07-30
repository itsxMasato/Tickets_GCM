/* Documentado por: Miguel Flores */
'use strict'

const { EntitySchema } = require('typeorm');
const { ROLE_VALUES } = require('../enums');
const { bitBoolean } = require('../transformers');

module.exports = new EntitySchema({
  name: 'UserCompanyMembership',
  tableName: 'user_company_memberships',
  columns: {
    id:           { primary: true, type: 'integer', generated: 'increment' },
    user_id:      { type: 'integer', nullable: false },
    company_id:   { type: 'integer', nullable: false },
    role:         { type: 'simple-enum', enum: ROLE_VALUES, nullable: false },
    active:       { type: 'integer', default: 1, nullable: false, transformer: bitBoolean() },
    is_default:   { type: 'integer', default: 0, nullable: false, transformer: bitBoolean() },
    created_at:   { type: 'datetime', default: require('../timestamp-default').timestampDefault, nullable: false },
    last_seen_at: { type: 'datetime', nullable: true },
  },
  indices: [
    { name: 'UQ_user_company', unique: true, columns: ['user_id', 'company_id'] },
    { name: 'IX_company_user', columns: ['company_id', 'user_id'] },
  ],
});

