const test = require('node:test');
const assert = require('node:assert/strict');
const firestoreData = require('../src/firestoreData');
const membershipsService = require('../src/services/memberships.service');

test('scopeByCompany keeps only legacy (company_id null) rows when there is no active company', () => {
  // Without an active company we must NOT fall back to "show everything" -
  // that leaked every tenant's rows to a user in a null-activeCompanyId
  // state (stale session, deactivated memberships, brand-new user). Only
  // pre-multitenant legacy rows (company_id null) stay visible, same as
  // when an active company IS set.
  const rows = [{ id: 1, company_id: null }, { id: 2, company_id: '7' }];
  assert.deepEqual(firestoreData.scopeByCompany(rows, null), [{ id: 1, company_id: null }]);
});

test('scopeByCompany keeps legacy rows (company_id null) visible for any active company', () => {
  const rows = [{ id: 1, company_id: null }, { id: 2, company_id: '7' }, { id: 3, company_id: '9' }];
  const scoped = firestoreData.scopeByCompany(rows, 7);
  assert.deepEqual(scoped.map((r) => r.id), [1, 2]);
});

test('scopeByCompany matches company_id regardless of string/number mismatch', () => {
  const rows = [{ id: 1, company_id: 7 }, { id: 2, company_id: '7' }, { id: 3, company_id: 8 }];
  const scoped = firestoreData.scopeByCompany(rows, '7');
  assert.deepEqual(scoped.map((r) => r.id), [1, 2]);
});

test('resolveDefaultCompanyId picks the is_default membership over the first one', async () => {
  const originalQueryCollection = firestoreData.queryCollection;
  firestoreData.queryCollection = async (collection, clauses = []) => {
    if (collection === 'user_company_memberships') {
      return [
        { id: 1, user_id: 4, company_id: 5, active: 1, is_default: 0 },
        { id: 2, user_id: 4, company_id: 9, active: 1, is_default: 1 },
      ];
    }
    return [];
  };
  try {
    const companyId = await membershipsService.resolveDefaultCompanyId(4);
    assert.equal(companyId, 9);
  } finally {
    firestoreData.queryCollection = originalQueryCollection;
  }
});

test('resolveDefaultCompanyId falls back to the first membership when none is default', async () => {
  const originalQueryCollection = firestoreData.queryCollection;
  firestoreData.queryCollection = async (collection) => {
    if (collection === 'user_company_memberships') {
      return [
        { id: 1, user_id: 4, company_id: 5, active: 1, is_default: 0 },
        { id: 2, user_id: 4, company_id: 9, active: 1, is_default: 0 },
      ];
    }
    return [];
  };
  try {
    const companyId = await membershipsService.resolveDefaultCompanyId(4);
    assert.equal(companyId, 5);
  } finally {
    firestoreData.queryCollection = originalQueryCollection;
  }
});

test('listByUser allows self-access when the requester id arrives as a string (raw Firestore doc)', async () => {
  const originalQueryCollection = firestoreData.queryCollection;
  const originalCacheById = firestoreData.cacheById;
  firestoreData.queryCollection = async (collection) => {
    if (collection === 'user_company_memberships') {
      return [{ id: 1, user_id: 21, company_id: 2, active: 1, is_default: 0 }];
    }
    return [];
  };
  firestoreData.cacheById = async () => ({});
  try {
    // login/firebase pasan el user "crudo" de Firestore, donde `id` es
    // string ("21"), no Number(21) como lo entrega requireAuth luego.
    const memberships = await membershipsService.listByUser('21', { requester: { id: '21' } });
    assert.equal(memberships.length, 1);
  } finally {
    firestoreData.queryCollection = originalQueryCollection;
    firestoreData.cacheById = originalCacheById;
  }
});

test('scopeUsersByCompany returns all rows unchanged for sac (cross-company by design)', () => {
  const rows = [{ id: 1 }, { id: 2 }];
  const scoped = firestoreData.scopeUsersByCompany(rows, [], { id: 99, role: 'sac', activeCompanyId: 7 });
  assert.deepEqual(scoped, rows);
});

test('scopeUsersByCompany returns all rows unchanged for platform admin', () => {
  const rows = [{ id: 1 }, { id: 2 }];
  const scoped = firestoreData.scopeUsersByCompany(rows, [], { id: 99, isPlatformAdmin: true, activeCompanyId: 7 });
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
  const scoped = firestoreData.scopeUsersByCompany(rows, memberships, { id: 4, role: 'admin_area', activeCompanyId: 7 });
  assert.deepEqual(scoped.map((r) => r.id), [1, 4, 5]);
});

test('resolveDefaultCompanyId returns null when the user has no memberships', async () => {
  const originalQueryCollection = firestoreData.queryCollection;
  const originalFindOneByFields = firestoreData.findOneByFields;
  firestoreData.queryCollection = async () => [];
  firestoreData.findOneByFields = async () => null;
  try {
    const companyId = await membershipsService.resolveDefaultCompanyId(999);
    assert.equal(companyId, null);
  } finally {
    firestoreData.queryCollection = originalQueryCollection;
    firestoreData.findOneByFields = originalFindOneByFields;
  }
});
