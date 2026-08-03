/* Documentado por: Miguel Flores */
'use strict'

const { EntitySchema } = require('typeorm');
const { ROLE_VALUES } = require('../enums');

// Entidad ORM: tabla `role_labels`. Nombre visible personalizado por rol (override del label
// estándar del código; si no hay fila para un rol, se usa el label por defecto). La clave
// primaria es la propia columna `role` (una fila como máximo por rol) — no hay `id` surrogate,
// único caso así en el proyecto. updated_by referencia al usuario que hizo el último cambio.
module.exports = new EntitySchema({
  name: 'RoleLabel',
  tableName: 'role_labels',
  columns: {
    role:       { primary: true, type: 'simple-enum', enum: ROLE_VALUES, nullable: false },
    label:      { type: 'varchar', length: 80, nullable: false },
    updated_at: { type: 'datetime', default: require('../timestamp-default').timestampDefault, nullable: false },
    updated_by: { type: 'integer', nullable: true },
  },
});
