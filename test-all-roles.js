/* Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. */
#!/usr/bin/env node
'use strict';

(async () => {
  const ROLES = [
    { user: 'sac', pass: 'sac123', role: 'sac' },
    { user: 'jope', pass: 'jefe123', role: 'jefe_inmediato' },
    { user: 'aope', pass: 'area123', role: 'admin_area' },
    { user: 'sup1', pass: 'sup123', role: 'supervisor_campo' }
  ];
  
  console.log('Testing all 4 user roles...\n');
  
  for (const cred of ROLES) {
    try {
      // LOGIN
      const login = await fetch('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: cred.user, password: cred.pass })
      });
      
      if (login.status !== 200) {
        console.log(`❌ ${cred.user} login failed: ${login.status}`);
        continue;
      }
      
      const loginBody = await login.json();
      const setCookie = login.headers.get('set-cookie');
      if (!setCookie) {
        console.log(`❌ ${cred.user} no session cookie`);
        continue;
      }
      
      const sessionCookie = setCookie.split(';')[0];
      
      // CREATE TICKET
      const create = await fetch('http://localhost:3000/api/tickets', {
        method: 'POST',
        headers: { 
          'content-type': 'application/json',
          'cookie': sessionCookie
        },
        body: JSON.stringify({
          title: `Test ${cred.role}`,
          description: 'Prueba de creación de ticket',
          category_id: 1,
          priority: 'media'
        })
      });
      
      if (create.status !== 201) {
        const errBody = await create.text();
        console.log(`❌ ${cred.user} ticket create failed: ${create.status} - ${errBody}`);
        continue;
      }
      
      const ticket = await create.json();
      
      // GET TICKET LIST
      const list = await fetch('http://localhost:3000/api/tickets', {
        method: 'GET',
        headers: { 
          'accept': 'application/json',
          'cookie': sessionCookie
        }
      });
      
      if (list.status !== 200) {
        console.log(`❌ ${cred.user} ticket list failed: ${list.status}`);
        continue;
      }
      
      const listBody = await list.json();
      
      console.log(`✓ ${cred.user.padEnd(6)} login OK | created ticket ${ticket.ticket.code} | list has ${listBody.tickets?.length || 0} tickets`);
      
    } catch (err) {
      console.log(`❌ ${cred.user} error: ${err.message}`);
    }
  }
  
  console.log('\nDone.');
  process.exit(0);
})().catch(e => {
  console.error(e);
  process.exit(1);
});
