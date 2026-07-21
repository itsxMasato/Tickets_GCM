/* Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. */
'use strict';

/**
 * Resolución de variables de entorno para la capa TypeORM.
 *
 * Convenciones:
 *   - MSSQL_*     es el namespace "canónico" para la capa ORM.
 *   - DB_*        es el namespace legacy que ya existía en .env (DB_SERVER, DB_PORT, etc.).
 *                 Si MSSQL_* no está definido, se usa el valor de DB_* como fallback.
 *   - Defaults    solo cuando ni MSSQL_* ni DB_* están presentes.
 *
 * Esto evita obligar al usuario a duplicar variables en .env: el .env actual
 * con DB_SERVER=... sigue funcionando para TypeORM sin cambios.
 */

function bool(v, fallback = false) {
  if (v === undefined || v === null || v === '') return fallback;
  return String(v).toLowerCase() === 'true';
}

function int(v, fallback) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

const rawHost     = process.env.MSSQL_HOST        || process.env.DB_SERVER   || '127.0.0.1';
// MSSQL_HOST admite "hostname" o "hostname,puerto" para named instances
// con puerto fijo (formato nativo del driver mssql). Si trae coma, separamos.
let host = rawHost;
let hostPort = null;
const commaIdx = rawHost.indexOf(',');
if (commaIdx !== -1) {
  host = rawHost.slice(0, commaIdx).trim();
  hostPort = int(rawHost.slice(commaIdx + 1), null);
}
const instanceName = process.env.MSSQL_INSTANCE || process.env.DB_INSTANCE || '';
const port        = int(process.env.MSSQL_PORT,   int(hostPort != null ? hostPort : process.env.DB_PORT, 1433));
const database    = process.env.MSSQL_DATABASE    || process.env.DB_DATABASE || '';
const username    = process.env.MSSQL_USER        || process.env.DB_USER     || '';
const password    = process.env.MSSQL_PASSWORD    || process.env.DB_PASSWORD || '';
const encrypt     = bool(process.env.MSSQL_ENCRYPT,     bool(process.env.DB_ENCRYPT,            false));
const trustCert   = bool(process.env.MSSQL_TRUST_CERT,  bool(process.env.DB_TRUST_SERVER_CERT,  true));
const poolMax     = int(process.env.MSSQL_POOL_MAX, 10);
const synchronize = bool(process.env.ORM_SYNCHRONIZE, false);
const logging     = bool(process.env.ORM_LOGGING, false);

module.exports = {
  MSSQL_HOST: host,
  MSSQL_PORT: port,
  MSSQL_INSTANCE: instanceName,
  MSSQL_DATABASE: database,
  MSSQL_USER: username,
  MSSQL_PASSWORD: password,
  MSSQL_ENCRYPT: encrypt,
  MSSQL_TRUST_CERT: trustCert,
  MSSQL_POOL_MAX: poolMax,
  ORM_SYNCHRONIZE: synchronize,
  ORM_LOGGING: logging,
};
