/* Documentado por: Miguel Flores */
'use strict'

try { require('dotenv').config(); } catch (_) {}

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

  const listBefore = await membershipsService.listByUser(SMOKE_USER_ID, { requester });
  const found = listBefore.find((m) => m.id === membership.id);
  if (!found) throw new Error(`listByUser no devolvió la membresía creada (#${membership.id}).`);
  if (!found.active) throw new Error(`Membresía debería estar active=true, salió active=${found.active}.`);
  if (found.company && found.company.id !== company.id) {
    throw new Error(`Denormalización de company rota: esperado id=${company.id}, salió id=${found.company.id}.`);
  }
  log(`  listByUser OK: membresía con active=true y company denormalizado.`);

  const secondMembership = await membershipsService.create(
    SMOKE_USER_ID,
    { company_id: companyB.id, role: 'jefe_inmediato', area_key: 'smoke-area' },
    requester,
  );
  log(`  2da membresía creada: id=${secondMembership.id} role=${secondMembership.role} (empresa B)`);

  const after = await membershipsService.softDelete(membership.id, requester);
  if (after.active !== false) {
    throw new Error(`softDelete debería dejar active=false, salió active=${after.active}.`);
  }
  log(`  softDelete OK: membresía original active=false.`);

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
    membershipId: secondMembership.id,
    inactiveMembershipId: membership.id,
  };
}

async function phase3Cleanup(refs) {
  log('Fase 3 — cleanup (soft-delete idempotente)');
  const requester = { id: SMOKE_USER_ID, isPlatformAdmin: true };
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
      try { fs.unlinkSync(p); } catch (_) {}
    }
  }
  log('DB temporal removida.');
}

async function main() {
  for (const ext of ['', '-shm', '-wal', '-journal']) {
    const p = tempDbPath + ext;
    if (fs.existsSync(p)) {
      try { fs.unlinkSync(p); } catch (_) {}
    }
  }

  log(`DB temporal: ${tempDbPath}`);
  log(`Inicializando DataSource (con synchronize para crear tablas)...`);

  const ds = await orm.getDataSource();
  const innerDs = await ds.initialize();

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
    try { await deleteSmokeUser(); } catch (_) {}
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

