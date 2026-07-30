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

