const test = require('node:test');
const assert = require('node:assert/strict');
const orm = require('../src/orm');
const membershipsService = require('../src/services/memberships.service');

/**
 * Reemplaza orm.getRepository por una versión falsa que devuelve, para cada Entity pedida,
 * el repo mínimo indicado en `repos` (por nombre de entidad). Devuelve una función para
 * restaurar el original.
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

test('listByCompany accepts memberships stored with string company ids', async () => {
  const restore = stubRepos({
    Company: { findOneBy: async () => ({ id: 7, name: 'Acme', slug: 'acme', active: true }) },
    UserCompanyMembership: {
      // getMembershipRowsForUser (chequeo de acceso del requester) y el listado
      // principal de la empresa comparten el mismo repo — ambos se resuelven con find().
      find: async (opts) => {
        if (opts?.where?.company_id === 7) {
          return [{ id: 11, user_id: 4, company_id: 7, active: true, is_default: false, created_at: null, last_seen_at: null }];
        }
        return [{ id: 11, user_id: 4, company_id: 7, active: true, is_default: false, created_at: null, last_seen_at: null }];
      },
    },
    User: { findBy: async () => [{ id: 4, username: 'ana', full_name: 'Ana Pérez' }] },
  });

  try {
    const memberships = await membershipsService.listByCompany(7, {
      requester: { id: 4, isPlatformAdmin: false },
    });

    assert.equal(memberships.length, 1);
    assert.equal(memberships[0].user.id, 4);
  } finally {
    restore();
  }
});
