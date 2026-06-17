const Database = require('better-sqlite3');
const config = require('./src/config');
const db = new Database(config.dbPath);
console.log('dbPath', config.dbPath);
console.log('foreign_keys', db.pragma('foreign_keys', { simple: true }));
console.log('table_info tickets', db.prepare("PRAGMA table_info('tickets')").all());
console.log('foreign_key_list tickets', db.prepare("PRAGMA foreign_key_list('tickets')").all());
console.log('ticket schema', db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='tickets'").get().sql);
console.log('user 11', db.prepare('SELECT id, username, role, active FROM users WHERE id = ?').get(11));
console.log('category 1', db.prepare('SELECT id, name, active FROM categories WHERE id = ?').get(1));
try {
  const stmt = db.prepare("INSERT INTO tickets (code, title, description, category_id, status, priority, created_by) VALUES (?, ?, ?, ?, 'recibido', ?, ?)");
  const result = stmt.run('TEST-0001', 'Prueba direct', 'Descripcion directa', 1, 'media', 11);
  console.log('inserted', result.lastInsertRowid);
} catch (err) {
  console.error('insert error', err && err.message);
  if (err && err.code) console.error('code', err.code, 'errno', err.errno);
}
db.close();
