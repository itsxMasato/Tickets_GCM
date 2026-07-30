/* Documentado por: Miguel Flores */
'use strict'

const { DefaultNamingStrategy } = require('typeorm');

class SnakeCaseNamingStrategy extends DefaultNamingStrategy {}

module.exports = SnakeCaseNamingStrategy;

