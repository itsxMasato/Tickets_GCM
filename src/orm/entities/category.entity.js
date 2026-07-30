/* Documentado por: Miguel Flores */
'use strict'

const { EntitySchema } = require('typeorm');
const { bitBoolean } = require('../transformers');

module.exports = new EntitySchema({
  name: 'Category',
  tableName: 'categories',
  columns: {
    id:         { primary: true, type: 'integer', generated: 'increment' },
    company_id: { type: 'integer', nullable: true },
    name:       { type: 'varchar', length: 255, nullable: false },
    active:     { type: 'integer', default: 1, nullable: false, transformer: bitBoolean() },
    created_at: { type: 'datetime', default: require('../timestamp-default').timestampDefault, nullable: false },
  },
});

