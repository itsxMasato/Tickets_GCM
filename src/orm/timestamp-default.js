'use strict';

const isSqliteFallback = process.env.DISABLE_MSSQL === 'true';

const timestampDefault = isSqliteFallback
  ? () => "datetime('now')"
  : () => 'SYSUTCDATETIME()';

module.exports = { timestampDefault };
