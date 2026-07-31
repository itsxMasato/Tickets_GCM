/* Documentado por: Miguel Flores */
'use strict'

const { ValueTransformer } = require('typeorm');

/**
 * Crea un ValueTransformer de TypeORM para columnas BIT no nulas: convierte booleanos JS
 * a 0/1 al escribir en la base (to) y de vuelta a boolean al leer (from), tratando
 * null/undefined como false al leer.
 * @returns {ValueTransformer} transformer con métodos to/from
 */
function bitBoolean() {
  return {
    to(value) {
      if (value === null || value === undefined) return value;
      return value ? 1 : 0;
    },
    from(value) {
      if (value === null || value === undefined) return false;
      return value === 1 || value === true;
    },
  };
}

/**
 * Igual que bitBoolean() pero preserva null/undefined en vez de convertirlos a false,
 * para columnas BIT nullable.
 * @returns {ValueTransformer} transformer con métodos to/from
 */
function bitNullableBoolean() {
  return {
    to(value) {
      if (value === null || value === undefined) return null;
      return value ? 1 : 0;
    },
    from(value) {
      if (value === null || value === undefined) return null;
      return value === 1 || value === true;
    },
  };
}

module.exports = { bitBoolean, bitNullableBoolean };

