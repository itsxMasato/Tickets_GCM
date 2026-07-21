/* Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. */
const Database = require('better-sqlite3');
const config = require('../src/config');

const db = new Database(config.dbPath);
db.pragma('foreign_keys = ON');

console.log('DB_PATH', config.dbPath);
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map((r) => r.name);
console.log('tables', tables);
for (const t of tables) {
  console.log('\nTABLE', t);
  const cols = db.prepare(`PRAGMA table_info(${t})`).all();
  console.log(cols);
}
console.log('\nFOREIGN KEY CHECK:', db.prepare('PRAGMA foreign_key_check').all());
db.close();
