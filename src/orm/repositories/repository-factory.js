/* Documentado por: Miguel Flores */
'use strict'

const { getDataSource, getDataSourceSync } = require('../datasource');

/**
 * Obtiene el repositorio TypeORM de una entidad, inicializando el DataSource si hace falta.
 * @param {Function} Entity - entidad/EntitySchema a repositoriar
 * @returns {Promise<Repository>} repositorio de la entidad
 */
async function getRepository(Entity) {
  const ds = await getDataSource();
  return ds.getRepository(Entity);
}

/**
 * Obtiene el repositorio TypeORM de una entidad de forma síncrona, asumiendo que el
 * DataSource ya fue inicializado previamente.
 * @param {Function} Entity - entidad/EntitySchema a repositoriar
 * @returns {Repository} repositorio de la entidad
 */
function getRepositorySync(Entity) {
  const ds = getDataSourceSync();
  return ds.getRepository(Entity);
}

module.exports = { getRepository, getRepositorySync };

