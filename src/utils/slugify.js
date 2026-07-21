/* Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. */
'use strict';

/**
 * slugify — convierte un string a un slug URL-friendly.
 *
 * Reglas:
 *   - Quita diacríticos (NFD + strip combining marks): "Cañón" → "canon"
 *   - Lowercase
 *   - Solo deja [a-z0-9\s-]; el resto lo reemplaza por espacio
 *   - Colapsa espacios y guiones; los une con un solo '-'
 *   - Trunca a 50 chars (límite de la columna `companies.slug`)
 *
 * No agrega dependencias. Aceptable para textos en español.
 * Cobertura Unicode: básica (Latin). Otros alfabetos no se cubren en Fase 2.
 *
 * @param {string} input
 * @returns {string} slug vacío si el input no tiene chars válidos
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
