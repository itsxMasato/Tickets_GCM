/* Documentado por: Miguel Flores */
'use strict'

const { DefaultNamingStrategy } = require('typeorm');

/**
 * Estrategia de nombres de TypeORM usada por el DataSource. Actualmente hereda el
 * comportamiento por defecto de TypeORM sin overrides (los nombres de columnas/tablas
 * ya se definen explícitamente en cada EntitySchema).
 */
class SnakeCaseNamingStrategy extends DefaultNamingStrategy {}

module.exports = SnakeCaseNamingStrategy;

