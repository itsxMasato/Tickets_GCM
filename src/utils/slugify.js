/* Documentado por: Miguel Flores */
'use strict'

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

