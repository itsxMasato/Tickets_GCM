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

/**
 * Escribe un mensaje de log a stdout con el prefijo del script.
 * @param {string} msg - mensaje a loguear
 * @returns {void}
 */
function log(msg) {
  process.stdout.write(`[seed-multitenant] ${msg}\n`);
}

/**
 * Garantiza que exista la empresa por defecto (DEFAULT_COMPANY) en la base MSSQL: si ya
 * existe (por slug) la devuelve, si no la crea.
 * @param {Repository} Company - repositorio TypeORM de la entidad Company
 * @returns {Promise<Object>} registro de la empresa por defecto (existente o recién creada)
 */
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

/**
 * Migra los usuarios existentes al esquema multitenant: marca como platform admin al
 * usuario configurado (PLATFORM_ADMIN_USERNAME) si aún no lo es, y crea para cada usuario
 * una membresía por defecto en la empresa dada si todavía no la tiene.
 * @param {Repository} User - repositorio TypeORM de la entidad User
 * @param {Repository} UserCompanyMembership - repositorio TypeORM de membresías
 * @param {number} companyId - id de la empresa por defecto
 * @returns {Promise<void>}
 */
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

/**
 * Actualiza masivamente (backfill) todas las filas con company_id NULL de una entidad,
 * asignándoles el companyId dado.
 * @param {string} entityName - nombre descriptivo de la entidad (solo para el log)
 * @param {Repository} Entity - repositorio TypeORM de la entidad a actualizar
 * @param {number} companyId - id de empresa a asignar
 * @returns {Promise<void>}
 */
async function backfillCompanyId(entityName, Entity, companyId) {
  const repo = Entity;
  const result = await repo.createQueryBuilder()
    .update()
    .set({ companyId })
    .where('company_id IS NULL')
    .execute();
  log(`Backfill ${entityName}: ${result.affected || 0} filas actualizadas.`);
}

/**
 * Backfill especial para notificaciones sin company_id: para cada notificación ligada a
 * un ticket, toma el company_id del ticket asociado y lo copia a la notificación.
 * @param {Repository} Notification - repositorio TypeORM de notificaciones
 * @param {Repository} Ticket - repositorio TypeORM de tickets
 * @returns {Promise<void>}
 */
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

/**
 * Verifica que una entidad ya no tenga filas con company_id NULL, como paso previo a que
 * el DBA aplique la restricción NOT NULL vía T-SQL. Lanza error si aún quedan filas pendientes.
 * @param {Repository} Entity - repositorio TypeORM de la entidad a verificar
 * @returns {Promise<void>}
 */
async function makeNotNull(Entity) {
  const rows = await Entity.createQueryBuilder('e')
    .where('e.company_id IS NULL')
    .getCount();
  if (rows > 0) {
    throw new Error(`Quedan ${rows} filas con company_id NULL en ${Entity.options.tableName}. Revisar antes de continuar.`);
  }
}

/**
 * Punto de entrada del script de seed multitenant: inicializa el ORM contra SQL Server
 * (falla si DISABLE_MSSQL=true), asegura la empresa por defecto, migra usuarios y hace
 * backfill de company_id en tickets/categorías/eventos de calendario/notificaciones/auditoría,
 * y finalmente valida que no queden filas con company_id NULL antes de cerrar la conexión.
 * @returns {Promise<void>}
 */
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

