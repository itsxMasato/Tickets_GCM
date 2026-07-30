/* Documentado por: Miguel Flores */
'use strict'
const firebaseAdmin = require('../firebaseAdmin');
const validators = require('../utils/validators');
const auditService = require('./audit.service');

const COLLECTION = 'role_labels';
const LABEL_MAX = 80;

async function list() {
  firebaseAdmin.init();
  const db = firebaseAdmin.getFirestoreInstance();
  const roles = validators.ROLES;
  const out = {};
  for (const r of roles) {
    const snap = await db.collection(COLLECTION).doc(r).get();
    if (snap.exists) {
      const data = snap.data() || {};
      out[r] = (typeof data.label === 'string' && data.label.trim().length > 0)
        ? data.label.trim()
        : (validators.ROLE_LABEL[r] || r);
    } else {
      out[r] = validators.ROLE_LABEL[r] || r;
    }
  }
  return out;
}

async function get(role) {
  firebaseAdmin.init();
  const db = firebaseAdmin.getFirestoreInstance();
  if (!validators.ROLES.includes(role)) {
    return validators.ROLE_LABEL[role] || role;
  }
  const snap = await db.collection(COLLECTION).doc(role).get();
  if (snap.exists) {
    const data = snap.data() || {};
    if (typeof data.label === 'string' && data.label.trim().length > 0) {
      return data.label.trim();
    }
  }
  return validators.ROLE_LABEL[role] || role;
}

async function update(role, body, user) {
  firebaseAdmin.init();
  const db = firebaseAdmin.getFirestoreInstance();

  if (!validators.ROLES.includes(role)) {
    const err = new Error('Rol no válido');
    err.statusCode = 400;
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  const raw = body && body.label;
  if (typeof raw !== 'string') {
    const err = new Error('El campo "label" es obligatorio y debe ser texto.');
    err.statusCode = 400;
    err.code = 'VALIDATION_ERROR';
    throw err;
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    const err = new Error('El label del rol no puede estar vacío.');
    err.statusCode = 400;
    err.code = 'VALIDATION_ERROR';
    throw err;
  }
  if (trimmed.length > LABEL_MAX) {
    const err = new Error(`El label del rol no puede superar los ${LABEL_MAX} caracteres.`);
    err.statusCode = 400;
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  const previous = await get(role);

  await db.collection(COLLECTION).doc(role).set({
    label: trimmed,
    updated_at: new Date().toISOString(),
    updated_by: user?.id || null,
  }, { merge: true });

  if (previous !== trimmed) {
    await auditService.logAsync({
      user_id: user?.id || null,
      action_type: 'role_label_updated',
      target_type: 'role',
      target_code: role,
      description: `Renombró el rol "${previous}" a "${trimmed}".`,
      old_value: previous,
      new_value: trimmed,
    });

    const { emit } = require('../sockets');
    emit('role:label_updated', {
      role,
      label: trimmed,
      previous,
      updatedBy: user ? { id: user.id, full_name: user.full_name || null, role: user.role || null } : null,
      at: new Date().toISOString(),
    }, { broadcast: true });
  }

  return trimmed;
}

module.exports = { list, get, update, LABEL_MAX };

