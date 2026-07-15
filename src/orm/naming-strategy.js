'use strict';

const { DefaultNamingStrategy } = require('typeorm');

/**
 * SnakeCaseNamingStrategy
 *
 * Esta capa define los `tableName` y los nombres de columna explícitamente
 * en snake_case dentro de cada EntitySchema. TypeORM respeta el `customName`
 * en `columnName(propertyName, customName, ...)` y respeta el `userSpecifiedName`
 * en `tableName(targetName, userSpecifiedName)`, por lo que el comportamiento
 * por defecto de TypeORM ya encaja con lo que queremos.
 *
 * Mantener esta clase como punto de extensión explícito: si en el futuro se
 * introducen relaciones con @ManyToOne/@OneToMany, las FKs generadas
 * automáticamente (`categoryId` → `categoryId`) se transformarán a snake_case
 * (`category_id`) vía la convención por defecto.
 *
 * Si en algún momento queremos forzar snake_case aunque el `customName` no
 * venga ya snakecaseado, sobreescribir `columnName` aquí con:
 *
 *   columnName(propertyName, customName, embeddedPrefixes) {
 *     const name = customName || propertyName;
 *     if (embeddedPrefixes.length)
 *       return snakeCase(embeddedPrefixes.join('_')) + '_' + snakeCase(name);
 *     return snakeCase(name);
 *   }
 */
class SnakeCaseNamingStrategy extends DefaultNamingStrategy {}

module.exports = SnakeCaseNamingStrategy;
