/* Documentado por: Miguel Flores */
'use strict'

const isSqliteFallback = process.env.DISABLE_MSSQL === 'true';

/**
 * Función generadora del valor por defecto de columnas de timestamp en las entidades ORM.
 * Devuelve la expresión SQL adecuada según el motor activo: `datetime('now')` para el
 * fallback SQLite (DISABLE_MSSQL=true), o `SYSUTCDATETIME()` para SQL Server.
 * @returns {string} expresión SQL de timestamp por defecto
 */
const timestampDefault = isSqliteFallback
  ? () => "datetime('now')"
  : () => 'SYSUTCDATETIME()';

module.exports = { timestampDefault };

