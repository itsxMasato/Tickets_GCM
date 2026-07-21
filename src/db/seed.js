/* Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. */
'use strict';
const { getDb, closeDb } = require('./connection');

const CATEGORIES = [
  'Falla de equipo',
  'Solicitud de mantenimiento',
  'Incidencia en entrega',
  'Solicitud de material',
  'Reporte de novedad',
  'Solicitud de acceso',
  'Otro',
];

async function seed() {
  const db = getDb();
  console.log('[seed] No se crean usuarios por defecto.');

  const catCount = db.prepare('SELECT COUNT(*) AS c FROM categories').get().c;
  if (catCount === 0) {
    const insertCat = db.prepare('INSERT INTO categories (name) VALUES (?)');
    for (const name of CATEGORIES) insertCat.run(name);
    console.log(`[seed] Insertadas ${CATEGORIES.length} categorías.`);
  }
}

module.exports = seed;

if (require.main === module) {
  seed().then(() => closeDb()).catch((err) => { console.error(err); process.exit(1); });
}
