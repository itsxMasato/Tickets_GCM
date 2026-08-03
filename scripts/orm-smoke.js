/* Documentado por: Miguel Flores */
'use strict'

const path = require('path');

try { require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') }); } catch (_) {}

const orm = require('../src/orm');

const ENTITIES = [
  ['users',                    orm.User],
  ['categories',               orm.Category],
  ['tickets',                  orm.Ticket],
  ['ticket_assignments',       orm.TicketAssignment],
  ['ticket_comments',          orm.TicketComment],
  ['attachments',              orm.Attachment],
  ['notifications',            orm.Notification],
  ['audit_log',                orm.AuditLog],
  ['calendar_events',          orm.CalendarEvent],
  ['companies',                orm.Company],
  ['user_company_memberships', orm.UserCompanyMembership],
  ['role_permissions',         orm.RolePermission],
  ['role_labels',              orm.RoleLabel],
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
    const repo = await orm.getRepository(Entity);
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

