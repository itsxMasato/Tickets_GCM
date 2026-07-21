/* Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. */
'use strict';

/**
 * scripts/smoke-multitenant.js
 *
 * Smoke test de la capa multi-tenant (Fase 2). Valida que los 3 services
 * (companies, company-areas, memberships) funcionan end-to-end con el
 * ORM y la auditoría.
 *
 * Comportamiento:
 *   - Crea una base SQLite TEMPORAL (data/smoke-multitenant.db) para no
 *     contaminar la DB de desarrollo (data/tickets.db).
 *   - Corre `synchronize(true)` en el datasource para crear las 4
 *     entidades nuevas.
 *   - Fase 1: row counts de las 4 entidades nuevas (subset de orm-smoke).
 *   - Fase 2: funcional sin HTTP — crea empresa, área, membresía, lista,
 *     soft-delete, lista de nuevo. Mockea `requester` con `isPlatformAdmin=true`.
 *   - Fase 3: cleanup. Soft-delete idempotente de los recursos creados.
 *   - Borra la DB temporal al final.
 *
 * Uso:
 *   pnpm run smoke:multitenant
 *   DB_PATH=/tmp/custom.db pnpm run smoke:multitenant
 *
 * Pre-requisito: DISABLE_MSSQL=true (ya está en .env). Si MSSQL está activo,
 * el script NO toca MSSQL (cae automáticamente a SQLite vía datasource.js).
 *
 * Salida:
 *   - exit 0 si las 3 fases pasan.
 *   - exit 1 con mensaje claro si algo falla.
 */

// Resolver .env desde la raíz del proyecto (CommonJS, no next).
try { require('dotenv').config(); } catch (_) { /* dotenv opcional */ }

// Override DB_PATH ANTES de require('../src/orm') para que config.dbPath
// apunte a la DB temporal. config.js se carga dentro del orm.
const path = require('path');
const fs = require('fs');
const root = path.resolve(__dirname, '..');
const tempDbPath = path.join(root, 'data', 'smoke-multitenant.db');
process.env.DB_PATH = tempDbPath;

const orm = require('../src/orm');
const companiesService = require('../src/services/companies.service');
const companyAreasService = require('../src/services/company-areas.service');
const membershipsService = require('../src/services/memberships.service');
const bcrypt = require('bcrypt');

const ENTITIES = [
  ['companies',                orm.Company],
  ['company_areas',            orm.CompanyArea],
  ['user_company_memberships', orm.UserCompanyMembership],
  ['role_permissions',         orm.RolePermission],
];

const SMOKE_USER_ID = 999999;
const SMOKE_USER_NAME = `smoke-${Date.now()}`;

function log(msg) {
  process.stdout.write(`[smoke-multitenant] ${msg}\n`);
}

function fail(msg, err) {
  process.stderr.write(`[smoke-multitenant] FAILED: ${msg}\n`);
  if (err) {
    process.stderr.write(`  ${err.stack || err.message || err}\n`);
    if (err.code) process.stderr.write(`  code: ${err.code}\n`);
  }
}

async function phase1RowCounts() {
  log('Fase 1 — row counts de las 4 entidades nuevas');
  for (const [label, Entity] of ENTITIES) {
    const repo = await orm.getRepository(Entity);
    const count = await repo.count();
    process.stdout.write(`  ${label.padEnd(26)} ${count}\n`);
  }
}

async function createSmokeUser() {
  const repo = await orm.getRepository(orm.User);
  // Idempotente: si ya existe (re-run), actualizamos.
  const existing = await repo.findOne({ where: { id: SMOKE_USER_ID } });
  if (existing) {
    log(`User de smoke ya existe (id=${SMOKE_USER_ID}).`);
    return existing;
  }
  const passwordHash = await bcrypt.hash('smoke-password-not-used', 4);
  const user = await repo.save(repo.create({
    id: SMOKE_USER_ID,
    username: SMOKE_USER_NAME,
    password_hash: passwordHash,
    full_name: 'Smoke Test User',
    email: `${SMOKE_USER_NAME}@smoke.local`,
    is_platform_admin: 0,
    active: 1,
  }));
  log(`User de smoke creado (id=${user.id}).`);
  return user;
}

async function deleteSmokeUser() {
  const repo = await orm.getRepository(orm.User);
  const existing = await repo.findOne({ where: { id: SMOKE_USER_ID } });
  if (existing) {
    await repo.delete({ id: SMOKE_USER_ID });
    log('User de smoke eliminado.');
  }
}

async function phase2Functional() {
  log('Fase 2 — funcional: crear empresa, área, membresía, listar, soft-delete');

  const requester = {
    id: SMOKE_USER_ID,
    isPlatformAdmin: true,
    username: SMOKE_USER_NAME,
    full_name: 'Smoke Test User',
    role: 'sac',
  };

  const ts = Date.now();
  const slug = `smoke-${ts}`;
  const company = await companiesService.create(
    { name: `Smoke Co ${ts}`, slug, color: '#888888' },
    requester,
  );
  log(`  empresa creada: id=${company.id} slug=${company.slug}`);

  // Segunda empresa — necesaria porque UNIQUE (user_id, company_id)
  // impide tener 2 membresías del mismo user en la misma empresa, y
  // softDelete rechaza la ÚLTIMA membresía activa del user. Para
  // ejercitar el caso multi-membresía (mismo user, N empresas) creamos
  // una segunda empresa y soft-deleamos la membresía original de la
  // primera mientras la segunda sigue activa.
  const companyB = await companiesService.create(
    { name: `Smoke Co B ${ts}`, slug: `smokeb-${ts}`, color: '#444444' },
    requester,
  );
  log(`  2da empresa creada: id=${companyB.id} slug=${companyB.slug}`);

  const area = await companyAreasService.create(
    company.id,
    { key: 'smoke-area', label: 'Smoke Area', sort_order: 0 },
    requester,
  );
  log(`  área creada: id=${area.id} key=${area.key}`);

  const areaB = await companyAreasService.create(
    companyB.id,
    { key: 'smoke-area', label: 'Smoke Area B', sort_order: 0 },
    requester,
  );
  log(`  2da área creada: id=${areaB.id} key=${areaB.key} (empresa B)`);

  const membership = await membershipsService.create(
    SMOKE_USER_ID,
    { company_id: company.id, role: 'sac', area_key: 'smoke-area' },
    requester,
  );
  log(`  membresía creada: id=${membership.id} role=${membership.role} active=${membership.active}`);

  // Verificar que listByUser la ve como active=true.
  const listBefore = await membershipsService.listByUser(SMOKE_USER_ID, { requester });
  const found = listBefore.find((m) => m.id === membership.id);
  if (!found) throw new Error(`listByUser no devolvió la membresía creada (#${membership.id}).`);
  if (!found.active) throw new Error(`Membresía debería estar active=true, salió active=${found.active}.`);
  if (found.company && found.company.id !== company.id) {
    throw new Error(`Denormalización de company rota: esperado id=${company.id}, salió id=${found.company.id}.`);
  }
  log(`  listByUser OK: membresía con active=true y company denormalizado.`);

  // Segunda membresía en la empresa B — necesaria para poder soft-delear
  // la primera sin violar la regla "última activa" (memberships.service.js:274).
  const secondMembership = await membershipsService.create(
    SMOKE_USER_ID,
    { company_id: companyB.id, role: 'jefe_inmediato', area_key: 'smoke-area' },
    requester,
  );
  log(`  2da membresía creada: id=${secondMembership.id} role=${secondMembership.role} (empresa B)`);

  // Soft-delete la membresía de la empresa A (ya no es la única activa).
  const after = await membershipsService.softDelete(membership.id, requester);
  if (after.active !== false) {
    throw new Error(`softDelete debería dejar active=false, salió active=${after.active}.`);
  }
  log(`  softDelete OK: membresía original active=false.`);

  // Verificar que listByUser (sin activeOnly) la sigue viendo.
  const listAfter = await membershipsService.listByUser(SMOKE_USER_ID, { requester });
  const stillThere = listAfter.find((m) => m.id === membership.id);
  if (!stillThere) throw new Error(`listByUser (sin activeOnly) debería incluir la membresía inactiva.`);
  if (stillThere.active !== false) throw new Error(`listByUser debería verla con active=false.`);
  log(`  listByUser post-delete OK: membresía con active=false.`);

  return {
    companyId: company.id,
    companyBId: companyB.id,
    areaId: area.id,
    areaBId: areaB.id,
    membershipId: secondMembership.id,    // activa, queda para Fase 3 cleanup
    inactiveMembershipId: membership.id,  // ya inactive desde esta fase
  };
}

async function phase3Cleanup(refs) {
  log('Fase 3 — cleanup (soft-delete idempotente)');
  const requester = { id: SMOKE_USER_ID, isPlatformAdmin: true };
  // Las reglas de negocio del service prohíben desactivar el ÚLTIMO
  // recurso activo:
  //   - memberships.service.js:274: "última membresía activa del user"
  //   - companies.service.js:237:   "última empresa activa del sistema"
  //   - company-areas.service.js:    "área con tickets/membresías activas"
  //
  // La DB es temporal y se destruye al final, así que el smoke hace:
  //   1. softDelete idempotente de los resources YA inactivos (prueba
  //      que la rama de early-return funciona — el bug BIT↔boolean la
  //      rompía antes).
  //   2. hardDelete directo de los resources activos restantes. Esto
  //      es OK porque la DB es temp: si el código crashea acá, igual
  //      se borra en el finally de removeTempDb().
  //
  // Para empresas: desactivo la primera (B queda activa), hardDelete B.
  // Para áreas: hardDelete directo (no hay regla análoga, pero ya
  // tampoco son necesarias). Para memberships: ver arriba.
  await membershipsService.softDelete(refs.inactiveMembershipId, requester);
  log('  membresía inactiva: softDelete idempotente OK.');

  const memberRepo = await orm.getRepository(orm.UserCompanyMembership);
  await memberRepo.delete({ id: refs.membershipId });
  log('  membresía activa: hardDelete directo (DB temporal).');

  await companiesService.softDelete(refs.companyId, requester);
  log('  empresa A inactiva: softDelete idempotente OK.');

  const companyRepo = await orm.getRepository(orm.Company);
  await companyRepo.delete({ id: refs.companyBId });
  log('  empresa B activa: hardDelete directo (DB temporal).');

  const areaRepo = await orm.getRepository(orm.CompanyArea);
  await areaRepo.delete({ id: refs.areaId });
  await areaRepo.delete({ id: refs.areaBId });
  log('  áreas: hardDelete directo (DB temporal).');
}

async function removeTempDb() {
  await orm.closeORM();
  for (const ext of ['', '-shm', '-wal', '-journal']) {
    const p = tempDbPath + ext;
    if (fs.existsSync(p)) {
      try { fs.unlinkSync(p); } catch (_) { /* best effort */ }
    }
  }
  log('DB temporal removida.');
}

async function main() {
  // Si por algún motivo la DB temporal quedó de un run fallido, la borramos.
  for (const ext of ['', '-shm', '-wal', '-journal']) {
    const p = tempDbPath + ext;
    if (fs.existsSync(p)) {
      try { fs.unlinkSync(p); } catch (_) { /* best effort */ }
    }
  }

  log(`DB temporal: ${tempDbPath}`);
  log(`Inicializando DataSource (con synchronize para crear tablas)...`);

  // Inicializar el DataSource (cae a SQLite por DISABLE_MSSQL=true).
  // initORM() devuelve el wrapper de datasource.js que NO expone synchronize().
  // Llamamos a getDataSource() directo: en modo disabled, su método
  // initialize() devuelve el sqliteDataSource subyacente (datasource.js:69),
  // que sí tiene synchronize(true).
  const ds = await orm.getDataSource();
  const innerDs = await ds.initialize();

  // Forzar DDL: las 4 entidades nuevas NO existen en data/tickets.db,
  // y para Fase 2 no hay T-SQL aplicada aún. synchronize(true) crea
  // las tablas desde las EntitySchemas. En prod lo maneja el DBA; acá
  // es solo dev/test.
  if (typeof innerDs.synchronize === 'function') {
    await innerDs.synchronize(true);
    log('DDL aplicado (synchronize).');
  } else {
    log('Datasource sin synchronize() (¿MSSQL?); continuando sin DDL.');
  }

  let refs = null;
  try {
    await phase1RowCounts();
    await createSmokeUser();
    refs = await phase2Functional();
    await phase3Cleanup(refs);
    await deleteSmokeUser();
    log('OK — smoke multi-tenant completo.');
  } catch (err) {
    fail('Excepción durante las fases del smoke', err);
    // Cleanup best-effort: borrar user temporal.
    try { await deleteSmokeUser(); } catch (_) { /* ignore */ }
    await removeTempDb();
    process.exit(1);
  }

  await removeTempDb();
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    fail('Unhandled error en main()', err);
    process.exit(1);
  });
