/* Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. */
'use strict';

/**
 * src/orm/transformers.js
 *
 * Transformers para columnas que se persisten como BIT (MSSQL) o
 * INTEGER 0/1 (SQLite) pero se exponen como boolean en JS.
 *
 * Por qué existe:
 *   TypeORM 1.0 + better-sqlite3 mapea `type: 'boolean'` a INTEGER 0/1
 *   en SQLite pero al hidratar SIEMPRE devuelve `false` (bug del
 *   driver). En MSSQL nativo, BIT se devuelve como boolean pero el
 *   serializador JSON del backend termina mezclando tipos (algunos
 *   services hacen `!!row.active`, otros pasan el row directo).
 *
 *   La solución portable es declarar la columna como `type: 'integer'`
 *   con un transformer que:
 *     - to DB:    normaliza truthy → 1, falsy → 0  (incluye boolean, número, undefined)
 *     - from DB:  convierte 1/0 → boolean estricto
 *
 *   Así el row hidratado en JS tiene SIEMPRE un boolean real, indistinto
 *   de si la columna vive en SQLite (INTEGER) o MSSQL (BIT).
 *
 * Uso:
 *   const { bitBoolean } = require('../transformers');
 *   active: { type: 'integer', default: 1, nullable: false, transformer: bitBoolean() }
 *
 * Si la columna acepta NULL, usar `bitNullable()` (sigue devolviendo
 * null cuando el valor es null, en vez de coercionar a false).
 *
 * El `value` de role_permissions NO es nullable y siempre 0/1; usa
 * bitBoolean() también.
 */

const { ValueTransformer } = require('typeorm');

/**
 * bitBoolean — transformer BIT/INTEGER ↔ boolean estricto.
 *
 * to DB:
 *   undefined / null  → null (si la columna lo permitiera); en este proyecto
 *                       las columnas boolean son NOT NULL, pero igual
 *                       dejamos el null pass-through para no romper.
 *   truthy            → 1
 *   falsy             → 0
 *
 * from DB:
 *   1 / true  → true
 *   0 / false → false
 *   null      → false  (defensivo; las columnas activas acá son NOT NULL)
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
 * bitNullableBoolean — versión nullable. Útil para columnas opcionales
 * que pueden ser NULL, NULL ≠ false. Si el codebase no tiene columnas
 * así, no se usa. (Reservada para extensiones futuras.)
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
