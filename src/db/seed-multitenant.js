/* Documentado por: Miguel Flores */
'use strict'

const orm = require('../orm');
const env = require('../orm/env');
const { defaultCompanySlug, platformAdminUsername } = require('../config');

const DEFAULT_COMPANY = {
  name: 'GCM Central',
  slug: defaultCompanySlug || 'gcm-central',
  isDefault: true,
  active: true,
};

function log(msg) {
  process.stdout.write(`[seed-multitenant] ${msg}\n`);
}

async function ensureDefaultCompany(Company) {
  const repo = Company;
  let company = await repo.findOne({ where: { slug: DEFAULT_COMPANY.slug } });
  if (company) {
    log(`Empresa default "${DEFAULT_COMPANY.slug}" ya existe (id=${company.id}).`);
    return company;
  }
  company = await repo.save(repo.create(DEFAULT_COMPANY));
  log(`Empresa default creada: id=${company.id} slug=${company.slug}`);
  return company;
}

async function migrateUsers(User, UserCompanyMembership, companyId) {
  const userRepo = User;
  const memRepo = UserCompanyMembership;
  const platformUsername = platformAdminUsername || process.env.PLATFORM_ADMIN_USERNAME || 'admin';

  const users = await userRepo.find();
  for (const u of users) {
    if (u.isPlatformAdmin) {
      log(`User ${u.username} ya es platform admin, skip.`);
    } else if (u.username === platformUsername) {
      await userRepo.update(u.id, { isPlatformAdmin: true });
      log(`User ${u.username} marcado como platform admin.`);
    }

    const hasMembership = await memRepo.findOne({ where: { userId: u.id, companyId } });
    if (hasMembership) continue;

    await memRepo.save(memRepo.create({
      userId: u.id,
      companyId,
      role: u.role,
      active: true,
      isDefault: true,
    }));
    log(`Membresía default creada para user ${u.username} (rol=${u.role}).`);
  }
}

async function backfillCompanyId(entityName, Entity, companyId) {
  const repo = Entity;
  const result = await repo.createQueryBuilder()
    .update()
    .set({ companyId })
    .where('company_id IS NULL')
    .execute();
  log(`Backfill ${entityName}: ${result.affected || 0} filas actualizadas.`);
}

async function backfillNotificationsFromTicket(Notification, Ticket) {
  const repo = Notification;
  const ticketRepo = Ticket;
  const rows = await repo.createQueryBuilder('n')
    .select(['n.id', 'n.ticketId'])
    .where('n.company_id IS NULL AND n.ticket_id IS NOT NULL')
    .getRawMany();
  for (const r of rows) {
    const t = await ticketRepo.findOne({ where: { id: r.ticket_id } });
    if (t && t.companyId) {
      await repo.update(r.id, { companyId: t.companyId });
    }
  }
  log(`Backfill notifications: ${rows.length} filas procesadas.`);
}

async function makeNotNull(Entity) {
  const rows = await Entity.createQueryBuilder('e')
    .where('e.company_id IS NULL')
    .getCount();
  if (rows > 0) {
    throw new Error(`Quedan ${rows} filas con company_id NULL en ${Entity.options.tableName}. Revisar antes de continuar.`);
  }
}

async function main() {
  log(`Entorno: MSSQL_HOST=${env.MSSQL_HOST} DB=${env.MSSQL_DATABASE}`);
  if (env.MSSQL_DISABLED) {
    throw new Error('DISABLE_MSSQL=true. Este script no puede correr contra SQLite. Quitar el flag y reintentar.');
  }

  const ds = await orm.initORM();
  log('DataSource inicializado.');

  const {
    User, Ticket, Category, CalendarEvent, Notification, AuditLog,
    Company, UserCompanyMembership,
  } = orm.Entities || require('../orm/entities');

  const company = await ensureDefaultCompany(Company);
  await migrateUsers(User, UserCompanyMembership, company.id);

  await backfillCompanyId('tickets', Ticket, company.id);
  await backfillCompanyId('categories', Category, company.id);
  await backfillCompanyId('calendar_events', CalendarEvent, company.id);
  await backfillNotificationsFromTicket(Notification, Ticket);
  await backfillCompanyId('audit_log', AuditLog, company.id);

  await makeNotNull(Ticket);
  await makeNotNull(Category);
  await makeNotNull(CalendarEvent);
  await makeNotNull(Notification);
  await makeNotNull(AuditLog);

  log('Seed multi-tenant completo. Ejecutar T-SQL del DBA para NOT NULL + índices.');
  await orm.closeORM();
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      process.stderr.write(`[seed-multitenant] FAILED: ${err && err.message ? err.message : err}\n`);
      process.exit(1);
    });
}

module.exports = { main, ensureDefaultCompany, migrateUsers };

