/* Documentado por: Miguel Flores */
'use strict'

/**
 * Normaliza un id a Number cuando es puramente numérico, o lo deja como String en caso
 * contrario. Devuelve null si el id es null/undefined.
 * @param {String|Number} id - id a normalizar
 * @returns {String|Number|null} id normalizado
 */
function toId(id) {
  if (id === undefined || id === null) return null;
  const str = String(id);
  return /^\d+$/.test(str) ? Number(str) : str;
}

module.exports = { toId };
