/* Documentado por: Miguel Flores */
'use strict'

const { getDataSource, getDataSourceSync } = require('../datasource');

async function getRepository(Entity) {
  const ds = await getDataSource();
  return ds.getRepository(Entity);
}

function getRepositorySync(Entity) {
  const ds = getDataSourceSync();
  return ds.getRepository(Entity);
}

module.exports = { getRepository, getRepositorySync };

