'use strict';

const { getDataSource, getDataSourceSync } = require('../datasource');

/**
 * getRepository(Entity)
 *
 * Versión async: inicializa la conexión si todavía no está abierta y devuelve
 * el repositorio de TypeORM. Es la API recomendada para usar dentro de
 * servicios HTTP (ruta) y sockets.
 */
async function getRepository(Entity) {
  const ds = await getDataSource();
  return ds.getRepository(Entity);
}

/**
 * getRepositorySync(Entity)
 *
 * Versión sync: retorna el repositorio incluso cuando MSSQL está deshabilitado
 * por DISABLE_MSSQL, rechazando el acceso inmediato en ese modo.
 */
function getRepositorySync(Entity) {
  const ds = getDataSourceSync();
  return ds.getRepository(Entity);
}

module.exports = { getRepository, getRepositorySync };
