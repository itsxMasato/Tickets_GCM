/* Documentado por: Miguel Flores */
'use strict'

const { EntitySchema } = require('typeorm');
const { bitBoolean } = require('../transformers');

module.exports = new EntitySchema({
  name: 'Company',
  tableName: 'companies',
  columns: {
    id:         { primary: true, type: 'integer', generated: 'increment' },
    name:       { type: 'varchar', length: 200, nullable: false },
    slug:       { type: 'varchar', length: 50,  unique: true, nullable: false },
    logo_url:   { type: 'varchar', length: 500, nullable: true },
    color:      { type: 'varchar', length: 20,  nullable: true },
    code_prefix: { type: 'varchar', length: 6, unique: true, nullable: true },
    location:   { type: 'varchar', length: 200, nullable: true },
    responsible_user_id: { type: 'integer', nullable: true },
    active:     { type: 'integer', default: 1, nullable: false, transformer: bitBoolean() },
    is_default: { type: 'integer', default: 0, nullable: false, transformer: bitBoolean() },
    created_at: { type: 'datetime', default: require('../timestamp-default').timestampDefault, nullable: false },
    updated_at: { type: 'datetime', default: require('../timestamp-default').timestampDefault, nullable: false },
  },
});

