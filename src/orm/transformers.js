/* Documentado por: Miguel Flores */
'use strict'

const { ValueTransformer } = require('typeorm');

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

