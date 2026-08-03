const test = require('node:test');
const assert = require('node:assert/strict');
const { scopeByCompany, scopeUsersByCompany } = require('../src/utils/scope');
const orm = require('../src/orm');
const membershipsService = require('../src/services/memberships.service');

test('scopeByCompany keeps only legacy (company_id null) rows when there is no active company', () => {
  // Without an active company we must NOT fall back to "show everything" -
  // that leaked every tenant's rows to a user in a null-activeCompanyId
  // state (stale session, deactivated memberships, brand-new user). Only
  // pre-multitenant legacy rows (company_id null) stay visible, same as
  // when an active company IS set.
  const rows = [{ id: 1, company_id: null }, { id: 2, company_id: '7' }];
  assert.deepEqual(scopeByCompany(rows, null), [{ id: 1, company_id: null }]);
});

test('scopeByCompany keeps legacy rows (company_id null) visible for any active company', () => {
  const rows = [{ id: 1, company_id: null }, { id: 2, company_id: '7' }, { id: 3, company_id: '9' }];
  const scoped = scopeByCompany(rows, 7);
  assert.deepEqual(scoped.map((r) => r.id), [1, 2]);
});

test('scopeByCompany matches company_id regardless of string/number mismatch', () => {
  const rows = [{ id: 1, company_id: 7 }, { id: 2, company_id: '7' }, { id: 3, company_id: 8 }];
  const scoped = scopeByCompany(rows, '7');
  assert.deepEqual(scoped.map((r) => r.id), [1, 2]);
});

test('scopeUsersByCompany returns all rows unchanged for sac (cross-company by design)', () => {
  const rows = [{ id: 1 }, { id: 2 }];
  const scoped = scopeUsersByCompany(rows, [], { id: 99, role: 'sac', activeCompanyId: 7 });
  assert.deepEqual(scoped, rows);
});

test('scopeUsersByCompany returns all rows unchanged for platform admin', () => {
  const rows = [{ id: 1 }, { id: 2 }];
  const scoped = scopeUsersByCompany(rows, [], { id: 99, isPlatformAdmin: true, activeCompanyId: 7 });
  assert.deepEqual(scoped, rows);
});

test('scopeUsersByCompany keeps members of the active company, the requester itself, and legacy users without memberships', () => {
  const memberships = [
    { user_id: 1, company_id: 7, active: 1 },   // miembro de la empresa activa
    { user_id: 2, company_id: 8, active: 1 },   // miembro de OTRA empresa
    { user_id: 3, company_id: 7, active: 0 },   // miembro inactivo de la empresa activa
  ];
  const rows = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }];
  // id 4: requester mismo (siempre se ve). id 5: sin ninguna membresía (legacy/global).
  const scoped = scopeUsersByCompany(rows, memberships, { id: 4, role: 'admin_area', activeCompanyId: 7 });
  assert.deepEqual(scoped.map((r) => r.id), [1, 4, 5]);
});

/**
 * Reemplaza orm.getRepository por una versión falsa que devuelve, para cada Entity pedida,
 * el repo mínimo indicado en `repos` (por nombre de entidad: 'User', 'Company',
 * 'UserCompanyMembership'). Devuelve una función para restaurar el original.
 * @param {Object} repos - mapa nombre de entidad -> objeto repo falso
 * @returns {Function} restaura orm.getRepository al original
 */
function stubRepos(repos) {
  const original = orm.getRepository;
  orm.getRepository = async (Entity) => {
    const name = Entity?.options?.name;
    if (repos[name]) return repos[name];
    throw new Error(`No hay stub de repo para la entidad "${name}" en este test`);
  };
  return () => { orm.getRepository = original; };
}

test('resolveDefaultCompanyId picks the is_default membership over the first one', async () => {
  const restore = stubRepos({
    UserCompanyMembership: {
      find: async () => [
        { id: 1, user_id: 4, company_id: 5, active: true, is_default: false },
        { id: 2, user_id: 4, company_id: 9, active: true, is_default: true },
      ],
    },
  });
  try {
    const companyId = await membershipsService.resolveDefaultCompanyId(4);
    assert.equal(companyId, 9);
  } finally {
    restore();
  }
});

test('resolveDefaultCompanyId falls back to the first membership when none is default', async () => {
  const restore = stubRepos({
    UserCompanyMembership: {
      find: async () => [
        { id: 1, user_id: 4, company_id: 5, active: true, is_default: false },
        { id: 2, user_id: 4, company_id: 9, active: true, is_default: false },
      ],
    },
  });
  try {
    const companyId = await membershipsService.resolveDefaultCompanyId(4);
    assert.equal(companyId, 5);
  } finally {
    restore();
  }
});

test('resolveDefaultCompanyId returns null when the user has no memberships', async () => {
  const restore = stubRepos({
    UserCompanyMembership: { find: async () => [] },
  });
  try {
    const companyId = await membershipsService.resolveDefaultCompanyId(999);
    assert.equal(companyId, null);
  } finally {
    restore();
  }
});

test('listByUser allows self-access when the requester id arrives as a string', async () => {
  const restore = stubRepos({
    User: { findOneBy: async ({ id }) => ({ id: Number(id), username: 'ana' }) },
    UserCompanyMembership: {
      find: async () => [{ id: 1, user_id: 21, company_id: 2, active: true, is_default: false, created_at: null, last_seen_at: null }],
    },
    Company: { findBy: async () => [{ id: 2, name: 'Acme', slug: 'acme', color: null, logo_url: null }] },
  });
  try {
    // requireAuth siempre entrega req.user.id ya como Number, pero por las dudas se prueba
    // que listByUser tolera un id llegado como string.
    const memberships = await membershipsService.listByUser('21', { requester: { id: '21' } });
    assert.equal(memberships.length, 1);
  } finally {
    restore();
  }
});
