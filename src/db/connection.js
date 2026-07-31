/* Documentado por: Miguel Flores */
'use strict'
const Database = require('better-sqlite3');
const config = require('../config');

let db;

/**
 * Devuelve la conexión singleton a la base SQLite legacy, creándola (con WAL y foreign_keys
 * activados) la primera vez que se solicita.
 * @returns {Database} instancia de better-sqlite3
 */
function getDb() {
  if (!db) {
    db = new Database(config.dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

/**
 * Cierra la conexión SQLite legacy actual, si existe, y limpia la referencia singleton.
 * @returns {void}
 */
function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = { getDb, closeDb };

