/* Documentado por: Miguel Flores */
'use strict'

const { EntitySchema } = require('typeorm');
const { bitBoolean } = require('../transformers');

// Entidad ORM: tabla `providers`. Catálogo de proveedores externos (ej. AQ) a los que se
// puede enviar un ticket (garantía, reparación externa, compra de repuesto), opcionalmente
// acotado a una empresa (company_id) en el esquema multitenant.
module.exports = new EntitySchema({
  name: 'Provider',
  tableName: 'providers',
  columns: {
    id:         { primary: true, type: 'integer', generated: 'increment' },
    company_id: { type: 'integer', nullable: true },
    name:       { type: 'varchar', length: 255, nullable: false },
    active:     { type: 'integer', default: 1, nullable: false, transformer: bitBoolean() },
    created_at: { type: 'datetime', default: require('../timestamp-default').timestampDefault, nullable: false },
  },
});
