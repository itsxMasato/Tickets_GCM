#!/usr/bin/env node
/* Documentado por: Miguel Flores */
'use strict'
const firebaseAdmin = require('../src/firebaseAdmin');
const { hashPassword } = require('../src/utils/password');

function toSqlDate(date) {
  return date.toISOString().replace('T', ' ').slice(0, 19);
}

async function findExistingByField(db, collectionName, field, value) {
  const snap = await db.collection(collectionName).where(field, '==', value).limit(1).get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { id: doc.id, ...doc.data() };
}

async function getCounter(db, collectionName) {
  const countersRef = db.collection('metadata').doc('counters');
  const snap = await countersRef.get();
  const data = snap.exists ? snap.data() : {};
  return Number(data[collectionName]) || 0;
}

async function incrementCounter(db, collectionName) {
  const countersRef = db.collection('metadata').doc('counters');
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(countersRef);
    const data = snap.exists ? snap.data() : {};
    const current = Number(data[collectionName]) || 0;
    const next = current + 1;
    tx.set(countersRef, { [collectionName]: next }, { merge: true });
    return next;
  });
}

async function ensureCategories(db) {
  const existing = [];
  const snap = await db.collection('categories').get();
  snap.forEach((doc) => existing.push({ id: doc.id, ...doc.data() }));

  const defs = [
    { name: 'Producción', area: 'produccion' },
    { name: 'Mantenimiento', area: 'mantenimiento' },
    { name: 'Calidad', area: 'calidad' },
    { name: 'Logística', area: 'logistica' },
    { name: 'Seguridad', area: 'seguridad' },
  ];

  const byName = new Map(existing.map((item) => [String(item.name).toLowerCase(), item]));
  for (const def of defs) {
    if (!byName.has(def.name.toLowerCase())) {
      const id = String(await incrementCounter(db, 'categories'));
      await db.collection('categories').doc(id).set({
        id,
        name: def.name,
        name_lower: def.name.toLowerCase(),
        active: 1,
        created_at: toSqlDate(new Date()),
        area: def.area,
      });
      existing.push({ id, name: def.name, area: def.area });
    }
  }

  return existing;
}

async function ensureUsers(db) {
  const passwordHash = await hashPassword('Camaronera2026!');
  const now = new Date();
  const definitions = [
    { username: 'sac', email: 'sac@camaronera.local', full_name: 'SAC Central', role: 'sac', area: null },
    { username: 'jefe-produccion', email: 'jefe.produccion@camaronera.local', full_name: 'Jefe Producción', role: 'jefe_inmediato', area: 'produccion' },
    { username: 'jefe-calidad', email: 'jefe.calidad@camaronera.local', full_name: 'Jefe Calidad', role: 'jefe_inmediato', area: 'calidad' },
    { username: 'jefe-logistica', email: 'jefe.logistica@camaronera.local', full_name: 'Jefe Logística', role: 'jefe_inmediato', area: 'logistica' },
    { username: 'admin-produccion', email: 'admin.produccion@camaronera.local', full_name: 'Admin Producción', role: 'admin_area', area: 'produccion' },
    { username: 'admin-calidad', email: 'admin.calidad@camaronera.local', full_name: 'Admin Calidad', role: 'admin_area', area: 'calidad' },
    { username: 'supervisor-campo-1', email: 'supervisor1@camaronera.local', full_name: 'Supervisor Campo 1', role: 'supervisor_campo', area: null },
    { username: 'supervisor-campo-2', email: 'supervisor2@camaronera.local', full_name: 'Supervisor Campo 2', role: 'supervisor_campo', area: null },
  ];

  const created = [];
  for (const def of definitions) {
    const existing = await findExistingByField(db, 'users', 'email_lower', def.email.toLowerCase());
    if (existing) {
      created.push(existing);
      continue;
    }
    const id = String(await incrementCounter(db, 'users'));
    const payload = {
      id,
      username: def.username,
      username_lower: def.username.toLowerCase(),
      password_hash: passwordHash,
      full_name: def.full_name,
      role: def.role,
      area: def.area,
      active: 1,
      created_at: toSqlDate(now),
      email: def.email,
      email_lower: def.email.toLowerCase(),
    };
    await db.collection('users').doc(id).set(payload);
    created.push({ id, ...payload });
  }
  return created;
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function buildTicketPayload(index, categories, users) {
  const category = pickRandom(categories);
  const creator = pickRandom(users.filter((u) => ['sac', 'supervisor_campo'].includes(u.role)));
  const assignee = pickRandom(users.filter((u) => ['admin_area', 'jefe_inmediato'].includes(u.role)));
  const statuses = ['recibido', 'asignado', 'en_proceso', 'solucionado', 'cerrado', 'reabierto'];
  const priorityOptions = ['baja', 'media', 'alta', 'critica'];
  const areaOptions = ['produccion', 'calidad', 'mantenimiento', 'logistica', 'seguridad'];

  const templates = [
    { title: 'Bajo oxígeno en estanques de engorde', description: 'Se detectó una caída sostenida del oxígeno disuelto en los estanques 3 y 4 durante la madrugada. Se requiere revisar el sistema de aireación y registrar la condición en el libro de turno.' },
    { title: 'Motor del congelador presentó falla intermitente', description: 'El motor principal del congelador de la línea 2 se apagó de forma intermitente. El equipo está operando con respaldo temporal, pero debe revisarse el cableado y la temperatura del producto.' },
    { title: 'Variación de talla fuera del rango operativo', description: 'Se observó una diferencia mayor a la esperada en el peso promedio del camarón procesado. Se deben revisar los lotes y ajustar el criterio de clasificación.' },
    { title: 'Temperatura de cámara de almacenamiento fuera de límite', description: 'La cámara de frío registró picos de temperatura durante 20 minutos. Se notificó a calidad y se debe validar el historial de la unidad.' },
    { title: 'Obstrucción en la línea de empaquetado', description: 'La banda transportadora de empaquetado presentó una acumulación de producto y generó una parada breve. Se requiere limpieza y revisión del sensor de flujo.' },
    { title: 'Desviación de agua salobre en proceso', description: 'Se detectó una mezcla no autorizada de agua salobre en la línea de pre-cocción. Se debe verificar la fuente y registrar el hallazgo de calidad.' },
    { title: 'Fuga en la bomba de recirculación', description: 'Se reporta fuga leve en la bomba de recirculación del sistema de agua de proceso. Puede afectar el rendimiento del sistema si no se corrige.' },
    { title: 'Falla de lector de códigos en balanza', description: 'La balanza automática no está leyendo correctamente los códigos de lote. Se necesita inspección del lector y calibración.' },
    { title: 'Ruptura de manguera en la línea de hielo', description: 'Una manguera de la línea de hielo presentó una rotura menor y generó pérdida de presión. Se requiere cambio inmediato y revisión posterior.' },
    { title: 'Incidencia de higiene en zona de descarga', description: 'Se encontró material de embalaje en una zona de descarga que no estaba acorde a la limpieza del turno. Se debe reordenar la zona y documentar la acción.' },
  ];

  const template = templates[index % templates.length];
  const now = new Date();
  const createdAt = new Date(now.getTime() - (index % 60) * 24 * 60 * 60 * 1000 - (index % 12) * 3 * 60 * 60 * 1000);
  const status = statuses[index % statuses.length];
  const priority = priorityOptions[index % priorityOptions.length];
  const area = areaOptions[index % areaOptions.length];
  const title = `${template.title}`;
  const description = `${template.description}\n\nRegistro generado automáticamente para prueba del sistema de seguimiento de operaciones.`;

  const payload = {
    title,
    description,
    category_id: Number(category.id),
    category_name: category.name,
    area,
    status,
    priority,
    created_by: Number(creator.id),
    created_by_name: creator.full_name,
    created_by_area: creator.area || null,
    created_by_role: creator.role,
    assigned_to: status === 'recibido' ? null : Number(assignee.id),
    assigned_to_name: status === 'recibido' ? null : assignee.full_name,
    assigned_to_area: status === 'recibido' ? null : assignee.area || null,
    assigned_to_role: status === 'recibido' ? null : assignee.role,
    closed_by: status === 'cerrado' ? Number(assignee.id) : null,
    created_at: toSqlDate(createdAt),
    updated_at: toSqlDate(new Date(createdAt.getTime() + (index % 5) * 60 * 60 * 1000)),
    closed_at: status === 'cerrado' ? toSqlDate(new Date(createdAt.getTime() + 2 * 24 * 60 * 60 * 1000)) : null,
  };

  return payload;
}

async function main() {
  try {
    firebaseAdmin.init();
    if (!firebaseAdmin.isInitialized()) {
      console.error('[seed-camaronera] Firebase Admin no inicializado');
      process.exit(2);
    }

    const db = firebaseAdmin.getFirestoreInstance();
    const categories = await ensureCategories(db);
    const users = await ensureUsers(db);

    const total = 100;
    const ticketsRef = db.collection('tickets');
    const existingCount = await getCounter(db, 'tickets');

    console.log(`[seed-camaronera] Creando ${total} tickets reales de operación camaronera...`);
    for (let i = 0; i < total; i += 1) {
      const id = String(await incrementCounter(db, 'tickets'));
      const payload = buildTicketPayload(i + existingCount + 1, categories, users);
      const code = `CMP-${String(i + existingCount + 1).padStart(4, '0')}`;
      const doc = {
        id,
        code,
        ...payload,
      };
      await ticketsRef.doc(id).set(doc);
    }

    console.log(`[seed-camaronera] Se crearon ${total} tickets y ${users.length} usuarios base.`);
    process.exit(0);
  } catch (err) {
    console.error('[seed-camaronera] Error:', err && err.stack ? err.stack : err);
    process.exit(1);
  }
}

main();

