/* Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. */
'use strict';

// Roles del negocio GCM
const ROLES = ['supervisor_campo', 'sac', 'admin_area', 'jefe_inmediato'];

// Estados del flujo GCM
const TICKET_STATUS = ['recibido', 'asignado', 'en_proceso', 'solucionado', 'cerrado', 'reabierto'];

const PRIORITIES = ['baja', 'media', 'alta', 'urgente'];

const STATUS_LABEL = {
  recibido:    'Recibido',
  asignado:    'Asignado',
  en_proceso:  'En proceso de solución',
  solucionado: 'Solucionado',
  cerrado:     'Cerrado',
  reabierto:   'Reabierto',
};

const PRIORITY_LABEL = { baja: 'Baja', media: 'Media', alta: 'Alta', urgente: 'Urgente' };

const ROLE_LABEL = {
  supervisor_campo: 'Supervisor de campo',
  sac:              'Servicio al cliente (SAC)',
  admin_area:       'Administrador de área',
  jefe_inmediato:   'Jefe inmediato',
};

const AREAS = ['operaciones', 'logistica', 'mantenimiento', 'sistemas', 'otro'];
const AREA_LABEL = {
  operaciones:   'Operaciones',
  logistica:     'Logística',
  mantenimiento: 'Mantenimiento',
  sistemas:      'Sistemas',
  otro:          'Otro',
};

function isOneOf(value, list) {
  return list.includes(value);
}

function requireString(value, field, max = 500) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw validationError(`El campo "${field}" es obligatorio.`);
  }
  const trimmed = value.trim();
  if (trimmed.length > max) {
    throw validationError(`El campo "${field}" no puede superar los ${max} caracteres.`);
  }
  return trimmed;
}

function optionalString(value, field, max = 500) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') throw validationError(`El campo "${field}" debe ser texto.`);
  const trimmed = value.trim();
  if (trimmed.length > max) {
    throw validationError(`El campo "${field}" no puede superar los ${max} caracteres.`);
  }
  return trimmed || null;
}

function optionalEnum(value, field, list) {
  if (value === null || value === undefined || value === '') return null;
  if (!isOneOf(value, list)) {
    throw validationError(`El campo "${field}" no es válido.`);
  }
  return value;
}

function validationError(message) {
  const err = new Error(message);
  err.statusCode = 400;
  err.code = 'VALIDATION_ERROR';
  return err;
}

function forbiddenError(message = 'No tiene permisos para realizar esta acción.') {
  const err = new Error(message);
  err.statusCode = 403;
  err.code = 'FORBIDDEN';
  return err;
}

function notFoundError(message = 'Recurso no encontrado.') {
  const err = new Error(message);
  err.statusCode = 404;
  err.code = 'NOT_FOUND';
  return err;
}

function conflictError(message) {
  const err = new Error(message);
  err.statusCode = 409;
  err.code = 'CONFLICT';
  return err;
}

module.exports = {
  ROLES,
  TICKET_STATUS,
  PRIORITIES,
  STATUS_LABEL,
  PRIORITY_LABEL,
  ROLE_LABEL,
  AREAS,
  AREA_LABEL,
  isOneOf,
  requireString,
  optionalString,
  optionalEnum,
  validationError,
  forbiddenError,
  notFoundError,
  conflictError,
};
