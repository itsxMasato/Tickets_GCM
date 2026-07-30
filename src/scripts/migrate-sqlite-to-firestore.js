/* Documentado por: Miguel Flores */
'use strict'

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const firestore = require('../firestore');
const { getFirestore } = firestore;
const firestoreData = require('../firestoreData');
const config = require('../config');

async function ensureFirestore() {
  return getFirestore();
}

function openSqlite() {
  const dbPath = config.dbPath || path.resolve(process.cwd(), 'data', 'tickets.db');
  if (!fs.existsSync(dbPath)) throw new Error(`SQLite DB not found: ${dbPath}`);
  return new Database(dbPath, { readonly: true });
}

function readAll(db, table) {
  const rows = db.prepare(`SELECT * FROM ${table}`).all();
  return rows || [];
}

function listSqliteTables(db) {
  const rows = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  return rows.map((r) => r.name);
}

async function migrateCompanies(db, firestoreDb) {
  const rows = readAll(db, 'companies');
  console.log(`Found ${rows.length} companies in SQLite`);
  for (const r of rows) {
    const id = String(r.id);
    const exists = await firestoreDb.collection('companies').doc(id).get();
    if (exists.exists) { console.log(`company ${id} exists, skipping`); continue; }
    const payload = {
      id,
      name: r.name,
      slug: r.slug,
      location: r.location || null,
      responsible_user_id: r.responsible_user_id != null ? r.responsible_user_id : null,
      active: r.active ? 1 : 0,
      is_default: r.is_default ? 1 : 0,
      created_at: r.created_at || new Date().toISOString().slice(0,19).replace('T',' '),
      updated_at: r.updated_at || r.created_at || new Date().toISOString().slice(0,19).replace('T',' '),
    };
    await firestoreDb.collection('companies').doc(id).set(payload);
    console.log(`company ${id} migrated`);
  }
}

async function migrateMemberships(db, firestoreDb) {
  const rows = readAll(db, 'user_company_memberships');
  console.log(`Found ${rows.length} memberships in SQLite`);
  for (const r of rows) {
    const id = String(r.id);
    const exists = await firestoreDb.collection('user_company_memberships').doc(id).get();
    if (exists.exists) { console.log(`membership ${id} exists, skipping`); continue; }
    const payload = {
      id,
      user_id: String(r.user_id),
      company_id: String(r.company_id),
      role: r.role,
      active: r.active ? 1 : 0,
      is_default: r.is_default ? 1 : 0,
      created_at: r.created_at || new Date().toISOString().slice(0,19).replace('T',' '),
      last_seen_at: r.last_seen_at || null,
    };
    await firestoreDb.collection('user_company_memberships').doc(id).set(payload);
    console.log(`membership ${id} migrated`);
  }
}

async function run() {
  console.log('Starting migration SQLite -> Firestore');
  const db = openSqlite();
  const firestoreDb = await ensureFirestore();
  const tables = listSqliteTables(db);
  console.log('SQLite tables found:', tables.join(', ') || '(none)');

  try {
    if (tables.includes('companies')) await migrateCompanies(db, firestoreDb);
    else console.log('Table `companies` not found in SQLite, skipping companies migration.');

    if (tables.includes('user_company_memberships')) await migrateMemberships(db, firestoreDb);
    else console.log('Table `user_company_memberships` not found in SQLite, skipping memberships migration.');
    console.log('Migration completed successfully.');
  } catch (err) {
    console.error('Migration failed:', err && err.message ? err.message : err);
    process.exitCode = 2;
  } finally {
    db.close();
  }
}

if (require.main === module) run();

module.exports = { run };

