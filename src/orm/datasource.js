/* Documentado por: Miguel Flores */
'use strict'

require('reflect-metadata');

const { DataSource } = require('typeorm');

const config = require('../config');
const env = require('./env');
const SnakeCaseNamingStrategy = require('./naming-strategy');
const Entities = require('./entities');

const MSSQL_DISABLED = process.env.DISABLE_MSSQL === 'true';
let disabledDataSource = null;

/**
 * Crea (o reutiliza) un DataSource "sustituto" que usa SQLite (better-sqlite3) en vez de
 * SQL Server, activado cuando DISABLE_MSSQL=true. Expone la misma interfaz mínima que un
 * DataSource real de TypeORM (isInitialized, initialize, destroy, getRepository, transaction)
 * para que el resto del código ORM funcione sin distinguir el backend real.
 * @returns {Object} objeto con la interfaz compatible de DataSource respaldado por SQLite
 */
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
    /**
     * Inicializa el DataSource SQLite subyacente (idempotente; reutiliza la promesa en curso
     * si ya se está inicializando).
     * @returns {Promise<DataSource>} el DataSource SQLite inicializado
     */
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
    /**
     * Cierra la conexión del DataSource SQLite subyacente si estaba inicializada.
     * @returns {Promise<void>}
     */
    async destroy() {
      if (initialized) {
        await sqliteDataSource.destroy();
        initialized = false;
        initPromise = null;
      }
    },
    /**
     * Obtiene el repositorio TypeORM de una entidad, inicializando el DataSource si hace falta.
     * @param {Function} Entity - entidad/EntitySchema a repositoriar
     * @returns {Promise<Repository>} repositorio de la entidad
     */
    async getRepository(Entity) {
      if (!initialized) {
        await this.initialize();
      }
      return sqliteDataSource.getRepository(Entity);
    },
    /**
     * Ejecuta una función dentro de una transacción del DataSource SQLite, inicializando si hace falta.
     * @param {Function} runInTransaction - callback a ejecutar dentro de la transacción
     * @returns {Promise<*>} resultado devuelto por runInTransaction
     */
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
    ...(env.MSSQL_INSTANCE && /,\d+$/.test(process.env.MSSQL_HOST || '') === false ? { instanceName: env.MSSQL_INSTANCE } : {}),
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

let initPromise = null;

/**
 * Devuelve el DataSource de la aplicación ya inicializado: el sustituto SQLite si
 * DISABLE_MSSQL=true, o el DataSource real de SQL Server (inicializándolo si es la primera vez).
 * @returns {Promise<DataSource>} DataSource listo para usar
 */
async function getDataSource() {
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

/**
 * Devuelve el DataSource de SQL Server de forma síncrona, asumiendo que ya fue inicializado.
 * Lanza error si el modo SQLite está activo (DISABLE_MSSQL=true) o si aún no se inicializó.
 * @returns {DataSource} DataSource de SQL Server ya inicializado
 */
function getDataSourceSync() {
  if (MSSQL_DISABLED) {
    throw new Error('ORM sync access is disabled by DISABLE_MSSQL');
  }
  if (!AppDataSource.isInitialized) {
    throw new Error('ORM not initialized; call initORM() first or use getRepository()');
  }
  return AppDataSource;
}

/**
 * Inicializa el ORM (alias de getDataSource, pensado para llamarse al arrancar la app).
 * @returns {Promise<DataSource>} DataSource inicializado
 */
async function initORM() {
  return getDataSource();
}

/**
 * Cierra la conexión del DataSource de SQL Server si estaba inicializada.
 * @returns {Promise<void>}
 */
async function closeORM() {
  if (AppDataSource.isInitialized) {
    await AppDataSource.destroy();
    initPromise = null;
  }
}

module.exports = { AppDataSource, getDataSource, getDataSourceSync, initORM, closeORM };

