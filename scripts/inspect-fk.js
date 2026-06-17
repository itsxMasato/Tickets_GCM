const Database = require('better-sqlite3');
const paths = ['data/tickets.db', 'data/test_tickets.db'];
for (const p of paths) {
  try {
    const db = new Database(p);
    db.pragma('foreign_keys = ON');
    console.log('DB', p);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((r) => r.name);
    for (const t of tables) {
      const ddl = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name = ?").get(t).sql;
      console.log('\nTABLE', t);
      console.log(ddl);
      const fks = db.prepare(`PRAGMA foreign_key_list(${t})`).all();
      if (fks.length === 0) {
        console.log('  no foreign keys');
      } else {
        for (const fk of fks) {
          console.log('  FK', fk);
        }
      }
    }
    console.log('\nFK CHECK:', db.prepare('PRAGMA foreign_key_check').all());
    db.close();
  } catch (err) {
    console.error('ERROR', p, err.message);
  }
}
