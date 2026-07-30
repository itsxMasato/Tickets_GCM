/* Documentado por: Miguel Flores */
'use strict'

const { EntitySchema } = require('typeorm');
const { ROLE_VALUES } = require('../enums');
const { bitBoolean } = require('../transformers');

module.exports = new EntitySchema({
  name: 'User',
  tableName: 'users',
  columns: {
    id:                { primary: true, type: 'integer', generated: 'increment' },
    username:          { type: 'varchar', length: 255, unique: true, nullable: false },
    password_hash:     { type: 'varchar', length: 255, nullable: false },
    full_name:         { type: 'varchar', length: 255, nullable: false },
    email:             { type: 'varchar', length: 255, nullable: true },
    is_platform_admin: { type: 'integer', default: 0, nullable: false, transformer: bitBoolean() },
    active:            { type: 'integer', default: 1, nullable: false, transformer: bitBoolean() },
    created_at:        { type: 'datetime', default: require('../timestamp-default').timestampDefault, nullable: false },
  },
});

