/* Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. */
'use strict';

require('reflect-metadata');

const { DataSource } = require('typeorm');

const config = require('../config');
const env = require('./env');
const SnakeCaseNamingStrategy = require('./naming-strategy');
const Entities = require('./entities');

/**
 * DataSource (TypeORM) para SQL Server.
 *
 * Esta capa convive con la conexión SQLite existente (`src/db/connection.js`).
 * No se inicializa al levantar el proceso: el primer `initORM()` o
 * `getRepository(...)` abre la conexión. Eso preserva el contrato actual de
 * que la app booteara sin SQL Server.
 *
 * Reglas:
 *   - `synchronize: false` por default. Encenderlo (`ORM_SYNCHRONIZE=true`)
 *     solo en dev cuando las tablas no existen y querés que TypeORM las cree
 *     desde las entidades.
 *   - FK constraints (ON DELETE CASCADE/SET NULL) NO están declaradas en las
 *     entidades: con `synchronize: false` no se emiten. El DBA las replica en
 *     la T-SQL del schema MSSQL (fuera de scope de esta sesión).
 *   - Las booleanas (`active`, `read`) salen como 0/1 desde MSSQL. Cuando los
 *     servicios migren, agregar transformer.
 */

const MSSQL_DISABLED = process.env.DISABLE_MSSQL === 'true';
let disabledDataSource = null;

function createDisabledDataSource() {
  if (disabledDataSource) return disabledDataSource;

  const sqliteOptions = {
    type: 'better-sqlite3',
    database: config.dbPath,
    synchronize: false,
    logging: false,
    entities: Object.values(Entities),
    namingStrategy: new SnakeCaseNamingStrategy(),
  };
  const sqliteDataSource = new DataSource(sqliteOptions);
  let initialized = false;
  let initPromise = null;

  disabledDataSource = {
    get isInitialized() {
      return initialized;
    },
    async initialize() {
      if (!initialized) {
        if (!initPromise) {
          initPromise = sqliteDataSource.initialize()
            .then((ds) => {
              initialized = true;
              return ds;
            })
            .catch((err) => {
              initPromise = null;
              throw err;
            });
        }
        await initPromise;
      }
      return sqliteDataSource;
    },
    async destroy() {
      if (initialized) {
        await sqliteDataSource.destroy();
        initialized = false;
        initPromise = null;
      }
    },
    async getRepository(Entity) {
      if (!initialized) {
        await this.initialize();
      }
      return sqliteDataSource.getRepository(Entity);
    },
    async transaction(runInTransaction) {
      if (!initialized) {
        await this.initialize();
      }
      return sqliteDataSource.transaction(runInTransaction);
    },
  };
  return disabledDataSource;
}

const options = {
  type: 'mssql',
  host: env.MSSQL_HOST,
  port: env.MSSQL_PORT,
  username: env.MSSQL_USER,
  password: env.MSSQL_PASSWORD,
  database: env.MSSQL_DATABASE,
  synchronize: env.ORM_SYNCHRONIZE,
  logging: env.ORM_LOGGING ? ['error', 'warn'] : false,
  entities: Object.values(Entities),
  namingStrategy: new SnakeCaseNamingStrategy(),
  options: {
    encrypt: env.MSSQL_ENCRYPT,
    trustServerCertificate: env.MSSQL_TRUST_CERT,
    enableArithAbort: true,
    // Si MSSQL_INSTANCE está definido (named instance) y NO se fijó puerto
    // explícito en host, dejamos que el driver use SQL Browser. Si host ya
    // trae ",puerto" (puerto fijo), ignoramos instanceName para no forzar
    // resolución por Browser.
    ...(env.MSSQL_INSTANCE && /,\d+$/.test(process.env.MSSQL_HOST || '') === false
      ? { instanceName: env.MSSQL_INSTANCE }
      : {}),
  },
  pool: {
    max: env.MSSQL_POOL_MAX,
    min: 0,
    idleTimeoutMillis: 30000,
  },
  connectionTimeout: 15000,
  requestTimeout: 15000,
};

const AppDataSource = new DataSource(options);

/**
 * Inicialización perezosa con promesa compartida.
 *
 *   - `AppDataSource.isInitialized` ya es true → devuelve.
 *   - Hay un init en curso (`initPromise`) → espera esa misma promesa.
 *   - No hay nada → arranca `initialize()` y cachea la promesa. Si falla, se
 *     limpia `initPromise` para permitir reintento.
 */
let initPromise = null;

async function getDataSource() {
  // Bypass temporal: si se quiere desactivar la conexión a MSSQL en este
  // entorno, definir DISABLE_MSSQL=true en las variables de entorno (o en
  // el archivo .env). Esto evita que el proceso intente abrir la conexión
  // remota y provoque timeouts durante desarrollo local (por ejemplo cuando
  // estás trabajando con Firebase y no quieres errores por MSSQL caído).
  if (MSSQL_DISABLED) {
    return createDisabledDataSource();
  }
  if (AppDataSource.isInitialized) return AppDataSource;
  if (!initPromise) {
    initPromise = AppDataSource.initialize().catch((err) => {
      initPromise = null;
      throw err;
    });
  }
  await initPromise;
  return AppDataSource;
}

function getDataSourceSync() {
  if (MSSQL_DISABLED) {
    throw new Error('ORM sync access is disabled by DISABLE_MSSQL');
  }
  if (!AppDataSource.isInitialized) {
    throw new Error('ORM not initialized; call initORM() first or use getRepository()');
  }
  return AppDataSource;
}

async function initORM() {
  return getDataSource();
}

async function closeORM() {
  if (AppDataSource.isInitialized) {
    await AppDataSource.destroy();
    initPromise = null;
  }
}

module.exports = { AppDataSource, getDataSource, getDataSourceSync, initORM, closeORM };
