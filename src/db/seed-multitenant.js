/* Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. */
'use strict';

/**
 * src/db/seed-multitenant.js
 *
 * Seed multi-tenant para MSSQL (vía TypeORM). Crea la empresa default,
 * siembra las 5 áreas operativas, migra role/area de users a
 * user_company_memberships, y rellena company_id en las tablas que
 * lo requieren. Termina aplicando los NOT NULL y los índices.
 *
 * Idempotente: si la empresa default ya existe, no hace nada destructivo.
 *
 * Uso (después del cutover de Fase 10):
 *   node src/db/seed-multitenant.js
 *   PLATFORM_ADMIN_USERNAME=miguel pnpm seed:multitenant
 *
 * Pre-requisito: las 13 entidades deben estar creadas en MSSQL.
 *   ORM_SYNCHRONIZE=true pnpm orm:smoke   (solo dev)
 *   o aplicar el T-SQL del DBA en prod.
 */

const orm = require('../orm');
const env = require('../orm/env');
const { defaultCompanySlug, platformAdminUsername } = require('../config');

const DEFAULT_COMPANY = {
  name: 'GCM Central',
  slug: defaultCompanySlug || 'gcm-central',
  isDefault: true,
  active: true,
};

const DEFAULT_AREAS = [
  { key: 'operaciones',    name: 'Operaciones',    active: true },
  { key: 'logistica',      name: 'Logística',      active: true },
  { key: 'mantenimiento',  name: 'Mantenimiento',  active: true },
  { key: 'sistemas',       name: 'Sistemas',       active: true },
  { key: 'otro',           name: 'Otro',           active: true },
];

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

async function ensureAreas(CompanyArea, companyId) {
  const repo = CompanyArea;
  for (const area of DEFAULT_AREAS) {
    const existing = await repo.findOne({ where: { companyId, key: area.key } });
    if (existing) continue;
    await repo.save(repo.create({ ...area, companyId }));
    log(`Área creada: ${area.key}`);
  }
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
      areaKey: u.area,
      active: true,
      isDefault: true,
    }));
    log(`Membresía default creada para user ${u.username} (rol=${u.role}, area=${u.area}).`);
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
  // La conversión a NOT NULL se hace vía T-SQL del DBA. Acá solo validamos
  // que no queden company_id NULL. Si hay NULL, el script falla ruidosamente.
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
    Company, CompanyArea, UserCompanyMembership,
  } = orm.Entities || require('../orm/entities');

  const company = await ensureDefaultCompany(Company);
  await ensureAreas(CompanyArea, company.id);
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

module.exports = { main, ensureDefaultCompany, ensureAreas, migrateUsers };
