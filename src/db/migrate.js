/* Documentado por: Miguel Flores */
'use strict'
const fs = require('fs');
const path = require('path');
const { getDb, closeDb } = require('./connection');
const seed = require('./seed');

/**
 * Ejecuta una sentencia SQL de alteración de esquema (ALTER TABLE) ignorando errores
 * esperables de migraciones repetidas (columna duplicada o tabla inexistente); cualquier
 * otro error se relanza.
 * @param {Database} db - conexión SQLite
 * @param {string} sql - sentencia SQL a ejecutar
 * @returns {void}
 */
function safeAlter(db, sql) {
  try {
    db.exec(sql);
  } catch (err) {
    if (!/duplicate column name/i.test(err.message) && !/no such table/i.test(err.message)) throw err;
  }
}

/**
 * Verifica si una tabla SQLite tiene una columna determinada.
 * @param {Database} db - conexión SQLite
 * @param {string} table - nombre de la tabla
 * @param {string} column - nombre de la columna a buscar
 * @returns {boolean} true si la columna existe
 */
function hasColumn(db, table, column) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  return cols.some((c) => c.name === column);
}

/**
 * Agrega columnas faltantes a tablas existentes (migraciones incrementales legacy):
 * users.email/area, tickets.area/closed_by, ticket_comments.attachment_id,
 * attachments.comment_id.
 * @param {Database} db - conexión SQLite
 * @returns {void}
 */
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

/**
 * Crea (si no existen) los índices de rendimiento sobre las tablas principales
 * (tickets, ticket_assignments, ticket_comments, attachments, notifications).
 * @param {Database} db - conexión SQLite
 * @returns {void}
 */
function applyIndexes(db) {
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
    try { db.exec(s); } catch (e) {}
  }
}

/**
 * Obtiene el SQL de definición (CREATE TABLE) de una tabla desde sqlite_master.
 * @param {Database} db - conexión SQLite
 * @param {string} table - nombre de la tabla
 * @returns {string|null} SQL de creación de la tabla, o null si no existe
 */
function getTableSql(db, table) {
  const row = db.prepare('SELECT sql FROM sqlite_master WHERE type = ? AND name = ?').get('table', table);
  return row ? row.sql : null;
}

/**
 * Devuelve los nombres de columnas de una tabla SQLite.
 * @param {Database} db - conexión SQLite
 * @param {string} table - nombre de la tabla
 * @returns {string[]} nombres de columnas
 */
function getColumnNames(db, table) {
  return db.prepare(`PRAGMA table_info(${table})`).all().map((col) => col.name);
}

/**
 * Repara la tabla `tickets` cuando quedó con el constraint CHECK legacy de status
 * (que incluía 'resuelto' en vez del enum actual): renombra la tabla vieja, recrea el
 * esquema desde schema.sql, copia los datos de las columnas comunes y borra la tabla vieja.
 * No hace nada si la tabla ya tiene el constraint actualizado.
 * @param {Database} db - conexión SQLite
 * @returns {void}
 */
function repairTicketsStatusConstraint(db) {
  const sql = getTableSql(db, 'tickets');
  if (!sql) return;
  const hasLegacyStatus = sql.includes("('recibido','asignado','en_proceso','resuelto','cerrado','reabierto')");
  if (!hasLegacyStatus) return;

  console.log('[migrate] Reparando constraint legacy de tickets.status...');
  db.exec('ALTER TABLE tickets RENAME TO tickets_old');
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.exec(schema);

  const oldCols = getColumnNames(db, 'tickets_old');
  const newCols = getColumnNames(db, 'tickets');
  const commonCols = oldCols.filter((name) => newCols.includes(name));
  if (commonCols.length > 0) {
    const cols = commonCols.join(', ');
    db.prepare(`INSERT INTO tickets (${cols}) SELECT ${cols} FROM tickets_old`).run();
  }
  db.exec('DROP TABLE tickets_old');
}

/**
 * Ejecuta la migración completa de la base SQLite legacy: agrega columnas faltantes,
 * aplica el esquema (schema.sql), repara el constraint legacy de tickets.status, crea
 * índices de rendimiento, y finalmente corre el seed de datos iniciales.
 * @returns {Promise<void>}
 */
async function migrate() {
  const db = getDb();
  applyMissingColumns(db);
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.exec(schema);
  repairTicketsStatusConstraint(db);
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

