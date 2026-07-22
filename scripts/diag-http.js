/* Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. */
// Diagnóstico: probar endpoints /api/users y /api/roles con auth real
require('dotenv').config();
const http = require('http');
const admin = require('../src/firebaseAdmin');
const { hashPassword } = require('../src/utils/password');
const firestoreData = require('../src/firestoreData');
const authService = require('../src/services/auth.service');

admin.init();
const db = admin.getFirestoreInstance();

(async () => {
  // 1) Crear/actualizar un usuario SAC con password conocido
  const username = 'diag_sac';
  const password = 'diag1234';
  const hash = await hashPassword(password);

  // Buscar
  const existing = await firestoreData.findUserByIdentifier?.(username) || await firestoreData.getUserByIdentifier?.(username);
  if (existing) {
    await db.collection('users').doc(String(existing.id)).update({ password_hash: hash, role: 'sac', active: 1 });
    console.log('updated password for user', username, 'id:', existing.id);
  } else {
    const { createUser } = require('../src/services/auth.service');
    const u = await createUser({
      username, password, full_name: 'Diag SAC', role: 'sac', area: null, email: 'diag_sac@test.com',
    });
    console.log('created user', u.id);
  }

  // 2) Login HTTP
  const cookieJar = {};
  async function call(method, path, body) {
    return new Promise((resolve, reject) => {
      const data = body ? JSON.stringify(body) : null;
      const cookies = Object.entries(cookieJar).map(([k, v]) => `${k}=${v}`).join('; ');
      const opts = {
        hostname: 'localhost', port: 3000, path, method,
        headers: {
          'Content-Type': 'application/json',
          ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
          ...(cookies ? { 'Cookie': cookies } : {}),
        },
      };
      const req = http.request(opts, (res) => {
        const setCookie = res.headers['set-cookie'] || [];
        for (const sc of setCookie) {
          const [pair] = sc.split(';');
          const [k, v] = pair.split('=');
          cookieJar[k] = v;
        }
        let chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString();
          let parsed = null;
          try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
          resolve({ status: res.statusCode, body: parsed });
        });
      });
      req.on('error', reject);
      if (data) req.write(data);
      req.end();
    });
  }

  console.log('\n--- Login ---');
  const login = await call('POST', '/api/auth/login', { username, password });
  console.log('Status:', login.status, 'Body keys:', Object.keys(login.body || {}));

  console.log('\n--- /api/auth/me ---');
  const me = await call('GET', '/api/auth/me');
  console.log('Status:', me.status, 'Body:', JSON.stringify(me.body));

  console.log('\n--- /api/users?active=1 ---');
  const users1 = await call('GET', '/api/users?active=1');
  console.log('Status:', users1.status, 'Users count:', (users1.body?.users || []).length);

  console.log('\n--- /api/users?active=true ---');
  const users2 = await call('GET', '/api/users?active=true');
  console.log('Status:', users2.status, 'Users count:', (users2.body?.users || []).length);

  console.log('\n--- /api/users (sin params) ---');
  const users3 = await call('GET', '/api/users');
  console.log('Status:', users3.status, 'Users count:', (users3.body?.users || []).length);

  if (users1.body?.users) {
    const byRole = {};
    for (const u of users1.body.users) byRole[u.role] = (byRole[u.role] || 0) + 1;
    console.log('  byRole con active=1:', byRole);
  }

  console.log('\n--- /api/roles ---');
  const roles = await call('GET', '/api/roles');
  console.log('Status:', roles.status);
  if (roles.body?.roles) {
    for (const [r, p] of Object.entries(roles.body.roles)) {
      const trueCount = Object.values(p).filter(Boolean).length;
      console.log(`  ${r}: ${trueCount}/6 permisos`);
    }
  } else {
    console.log('  Body:', JSON.stringify(roles.body));
  }

  console.log('\n--- PATCH /api/roles/supervisor_campo (apagar manageUsers) ---');
  const current = roles.body?.roles?.supervisor_campo;
  if (current) {
    const next = { ...current, manageUsers: !current.manageUsers };
    const patch = await call('PATCH', '/api/roles/supervisor_campo', next);
    console.log('Status:', patch.status, 'Body keys:', Object.keys(patch.body || {}));
  }

  process.exit(0);
})().catch((e) => { console.error('Err:', e); process.exit(1); });
