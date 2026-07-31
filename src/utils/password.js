/* Documentado por: Miguel Flores */
'use strict'
const bcrypt = require('bcrypt');

const COST = 10;

/**
 * Genera el hash bcrypt de una contraseña en texto plano, usando el costo definido (COST).
 * @param {string} plain - contraseña en texto plano
 * @returns {Promise<string>} hash bcrypt resultante
 */
async function hashPassword(plain) {
  return bcrypt.hash(plain, COST);
}

/**
 * Verifica que una contraseña en texto plano coincida con un hash bcrypt dado.
 * Devuelve false (sin lanzar error) si falta alguno de los dos valores.
 * @param {string} plain - contraseña en texto plano
 * @param {string} hash - hash bcrypt almacenado
 * @returns {Promise<boolean>} true si coinciden
 */
async function verifyPassword(plain, hash) {
  if (!plain || !hash) return false;
  return bcrypt.compare(plain, hash);
}

module.exports = { hashPassword, verifyPassword };

