const test = require('node:test');
const assert = require('node:assert/strict');
const firestoreData = require('../src/firestoreData');
const membershipsService = require('../src/services/memberships.service');

test('listByCompany accepts memberships stored with string company ids', async () => {
  const originalFindOneByFields = firestoreData.findOneByFields;
  const originalGetCompanyById = firestoreData.getCompanyById;
  const originalCacheById = firestoreData.cacheById;
  const originalQueryCollection = firestoreData.queryCollection;

  firestoreData.findOneByFields = async () => null;
  firestoreData.getCompanyById = async () => ({ id: 7, name: 'Acme', slug: 'acme', active: 1 });
  firestoreData.cacheById = async () => ({ 4: { id: 4, username: 'ana', full_name: 'Ana Pérez' } });
  firestoreData.queryCollection = async (collection, clauses = []) => {
    if (collection === 'user_company_memberships' && (!clauses || clauses.length === 0)) {
      return [{ id: 11, user_id: 4, company_id: '7', active: 1 }];
    }
    return [];
  };

  try {
    const memberships = await membershipsService.listByCompany(7, {
      requester: { id: 4, isPlatformAdmin: false },
    });

    assert.equal(memberships.length, 1);
    assert.equal(memberships[0].user.id, 4);
  } finally {
    firestoreData.findOneByFields = originalFindOneByFields;
    firestoreData.getCompanyById = originalGetCompanyById;
    firestoreData.cacheById = originalCacheById;
    firestoreData.queryCollection = originalQueryCollection;
  }
});
