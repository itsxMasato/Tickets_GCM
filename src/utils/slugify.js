/* Documentado por: Miguel Flores */
'use strict'

/**
 * Convierte un texto arbitrario en un slug: minúsculas, sin acentos/diacríticos,
 * sin caracteres especiales, espacios colapsados en guiones, y truncado a 50 caracteres.
 * @param {string} input - texto de entrada
 * @returns {string} slug generado (cadena vacía si input no es string)
 */
function slugify(input) {
  if (typeof input !== 'string') return '';
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 50);
}

module.exports = { slugify };

