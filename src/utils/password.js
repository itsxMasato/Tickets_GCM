'use strict';
const bcrypt = require('bcrypt');

const COST = 10;

async function hashPassword(plain) {
  return bcrypt.hash(plain, COST);
}

async function verifyPassword(plain, hash) {
  if (!plain || !hash) return false;
  return bcrypt.compare(plain, hash);
}

module.exports = { hashPassword, verifyPassword };
