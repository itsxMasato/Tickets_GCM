'use strict';
const fs = require('fs');
const path = require('path');
const { getDb, closeDb } = require('./connection');
const seed = require('./seed');

/**
 * Migración idempotente:
 *  1) Aplica ALTERs de columnas faltantes (capturando "duplicate column" como éxito).
 *  2) Aplica schema.sql (CREATE TABLE/INDEX IF NOT EXISTS) — los índices ahora sí encuentran las columnas.
 *  3) Reaplica los CREATE INDEX por si la tabla existía pre-migración.
 */
function safeAlter(db, sql) {
  try {
    db.exec(sql);
  } catch (err) {
    if (!/duplicate column name/i.test(err.message) && !/no such table/i.test(err.message)) throw err;
  }
}

function hasColumn(db, table, column) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  return cols.some((c) => c.name === column);
}

function applyMissingColumns(db) {
  if (!hasColumn(db, 'users', 'email')) safeAlter(db, 'ALTER TABLE users ADD COLUMN email TEXT');
  if (!hasColumn(db, 'users', 'area'))  safeAlter(db, 'ALTER TABLE users ADD COLUMN area TEXT');

  if (!hasColumn(db, 'tickets', 'area'))      safeAlter(db, "ALTER TABLE tickets ADD COLUMN area TEXT");
  if (!hasColumn(db, 'tickets', 'closed_by')) safeAlter(db, 'ALTER TABLE tickets ADD COLUMN closed_by INTEGER REFERENCES users(id)');

  if (!hasColumn(db, 'ticket_comments', 'attachment_id')) {
    safeAlter(db, 'ALTER TABLE ticket_comments ADD COLUMN attachment_id INTEGER REFERENCES attachments(id) ON DELETE CASCADE');
  }
  if (!hasColumn(db, 'attachments', 'comment_id')) {
    safeAlter(db, 'ALTER TABLE attachments ADD COLUMN comment_id INTEGER REFERENCES ticket_comments(id) ON DELETE SET NULL');
  }
}

//vamos a probar esto

function applyIndexes(db) {
  // CREATE INDEX IF NOT EXISTS: si la tabla ya existía y el índice nunca se creó
  // (porque en su momento la columna no estaba), se crea ahora.
  const stmts = [
    'CREATE INDEX IF NOT EXISTS idx_tickets_area        ON tickets(area)',
    'CREATE INDEX IF NOT EXISTS idx_tickets_status      ON tickets(status)',
    'CREATE INDEX IF NOT EXISTS idx_tickets_assigned_to ON tickets(assigned_to)',
    'CREATE INDEX IF NOT EXISTS idx_tickets_created_at  ON tickets(created_at)',
    'CREATE INDEX IF NOT EXISTS idx_tickets_priority    ON tickets(priority)',
    'CREATE INDEX IF NOT EXISTS idx_tickets_category_id ON tickets(category_id)',
    'CREATE INDEX IF NOT EXISTS idx_assignments_ticket  ON ticket_assignments(ticket_id)',
    'CREATE INDEX IF NOT EXISTS idx_comments_ticket     ON ticket_comments(ticket_id)',
    'CREATE INDEX IF NOT EXISTS idx_attachments_ticket  ON attachments(ticket_id)',
    'CREATE INDEX IF NOT EXISTS idx_notifications_user  ON notifications(user_id, read, created_at)',
  ];
  for (const s of stmts) {
    try { db.exec(s); } catch (e) { /* columna faltante pre-migración: ignore */ }
  }
}

async function migrate() {
  const db = getDb();
  // 1) Asegurar columnas nuevas antes de correr el schema (los índices dependen de ellas)
  applyMissingColumns(db);
  // 2) Aplicar schema (CREATE IF NOT EXISTS, idempotente)
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.exec(schema);
  // 3) Reasegurar índices por si la tabla existía con la migración previa
  applyIndexes(db);
  console.log('[migrate] Esquema aplicado.');
  await seed();
}

module.exports = migrate;

if (require.main === module) {
  migrate()
    .then(() => closeDb())
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
