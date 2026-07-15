'use strict';

/**
 * scripts/orm-smoke.js
 *
 * Verifica la conexión TypeORM contra SQL Server y reporta el conteo de filas
 * de cada una de las 8 entidades.
 *
 * Comportamiento:
 *   - Si SQL Server está alcanzable: imprime la tabla con las 8 cuentas y
 *     sale con exit 0.
 *   - Si NO está alcanzable: imprime un mensaje claro y sale con exit 1.
 *   - Si ORM_SYNCHRONIZE=true y el server está vacío, intenta crear las
 *     tablas desde las entidades. (Solo dev, no usar en prod.)
 *
 * Uso:
 *   pnpm orm:smoke
 *   ORM_SYNCHRONIZE=true pnpm orm:smoke
 */

const path = require('path');

// Resolver .env desde la raíz del proyecto (CommonJS, no next)
try { require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') }); } catch (_) { /* dotenv opcional */ }

const orm = require('../src/orm');

const ENTITIES = [
  ['users',              orm.User],
  ['categories',         orm.Category],
  ['tickets',            orm.Ticket],
  ['ticket_assignments', orm.TicketAssignment],
  ['ticket_comments',    orm.TicketComment],
  ['attachments',        orm.Attachment],
  ['notifications',      orm.Notification],
  ['audit_log',          orm.AuditLog],
];

async function main() {
  process.stdout.write('[smoke] Inicializando DataSource...\n');
  const ds = await orm.initORM();
  process.stdout.write('[smoke] DataSource inicializado.\n');

  if (process.env.ORM_SYNCHRONIZE === 'true') {
    process.stdout.write('[smoke] ORM_SYNCHRONIZE=true — emitiendo DDL...\n');
    await ds.synchronize();
    process.stdout.write('[smoke] DDL aplicado.\n');
  }

  for (const [label, Entity] of ENTITIES) {
    const repo = ds.getRepository(Entity);
    const count = await repo.count();
    process.stdout.write(`  ${label.padEnd(20)} ${count}\n`);
  }
}

main()
  .then(() => orm.closeORM())
  .then(() => process.exit(0))
  .catch((err) => {
    process.stderr.write(`[smoke] FAILED: ${err && err.message ? err.message : err}\n`);
    if (err && err.code) process.stderr.write(`[smoke] code: ${err.code}\n`);
    return orm.closeORM()
      .catch(() => {})
      .finally(() => process.exit(1));
  });
