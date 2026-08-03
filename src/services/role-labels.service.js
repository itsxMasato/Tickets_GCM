/* Documentado por: Miguel Flores */
'use strict'
const orm = require('../orm');
const validators = require('../utils/validators');
const auditService = require('./audit.service');

const LABEL_MAX = 80;

/**
 * Devuelve las etiquetas personalizadas (o por defecto) de todos los roles del sistema.
 * @returns {Promise<Object>} mapa de rol a etiqueta
 */
async function list() {
  const repo = await orm.getRepository(orm.RoleLabel);
  const roles = validators.ROLES;
  const out = {};
  for (const r of roles) {
    const row = await repo.findOneBy({ role: r });
    out[r] = (row && row.label && row.label.trim().length > 0) ? row.label.trim() : (validators.ROLE_LABEL[r] || r);
  }
  return out;
}

/**
 * Obtiene la etiqueta personalizada de un rol, o la etiqueta por defecto si no fue personalizada o el rol no es válido.
 * @param {String} role - código del rol
 * @returns {Promise<String>} etiqueta del rol
 */
async function get(role) {
  if (!validators.ROLES.includes(role)) {
    return validators.ROLE_LABEL[role] || role;
  }
  const repo = await orm.getRepository(orm.RoleLabel);
  const row = await repo.findOneBy({ role });
  if (row && row.label && row.label.trim().length > 0) {
    return row.label.trim();
  }
  return validators.ROLE_LABEL[role] || role;
}

/**
 * Actualiza la etiqueta visible de un rol, valida el texto recibido, registra auditoría y notifica el cambio por socket si hubo diferencia real.
 * @param {String} role - código del rol a renombrar
 * @param {Object} body - cuerpo de la solicitud con el nuevo label
 * @param {String} body.label - nueva etiqueta del rol
 * @param {Object} user - usuario que realiza el cambio
 * @returns {Promise<String>} etiqueta final guardada
 */
async function update(role, body, user) {
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

  const repo = await orm.getRepository(orm.RoleLabel);
  const existing = await repo.findOneBy({ role });
  if (existing) {
    await repo.update({ role }, { label: trimmed, updated_at: new Date(), updated_by: user?.id || null });
  } else {
    await repo.save({ role, label: trimmed, updated_by: user?.id || null });
  }

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
