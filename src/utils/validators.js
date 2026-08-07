/* Documentado por: Miguel Flores */
'use strict'

const ROLES = ['supervisor_campo', 'sac', 'admin_area', 'jefe_inmediato'];

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

const LOCATION_TYPES = ['taller', 'proveedor'];
const LOCATION_TYPE_LABEL = { taller: 'En el taller', proveedor: 'En proveedor externo' };

const LOCATION_REASONS = ['garantia', 'reparacion_externa', 'compra_repuesto', 'otro'];
const LOCATION_REASON_LABEL = {
  garantia:           'Garantía',
  reparacion_externa: 'Reparación externa',
  compra_repuesto:    'Compra de repuesto',
  otro:                'Otro',
};

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

/**
 * Verifica si un valor pertenece a una lista de valores permitidos.
 * @param {*} value - valor a verificar
 * @param {Array} list - lista de valores permitidos
 * @returns {boolean} true si el valor está en la lista
 */
function isOneOf(value, list) {
  return list.includes(value);
}

/**
 * Valida que un valor sea un string no vacío (tras trim) y dentro del largo máximo permitido.
 * Lanza un error de validación (400) si no cumple.
 * @param {*} value - valor a validar
 * @param {string} field - nombre del campo (para el mensaje de error)
 * @param {number} [max=500] - largo máximo permitido
 * @returns {string} valor recortado (trim)
 */
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

/**
 * Valida un string opcional: si es null/undefined/vacío devuelve null; si viene con valor,
 * exige que sea string y respete el largo máximo. Lanza error de validación (400) si no cumple.
 * @param {*} value - valor a validar
 * @param {string} field - nombre del campo (para el mensaje de error)
 * @param {number} [max=500] - largo máximo permitido
 * @returns {string|null} valor recortado (trim), o null
 */
function optionalString(value, field, max = 500) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') throw validationError(`El campo "${field}" debe ser texto.`);
  const trimmed = value.trim();
  if (trimmed.length > max) {
    throw validationError(`El campo "${field}" no puede superar los ${max} caracteres.`);
  }
  return trimmed || null;
}

/**
 * Valida un valor enum opcional: si es null/undefined/vacío devuelve null; si viene con valor,
 * exige que pertenezca a la lista dada. Lanza error de validación (400) si no cumple.
 * @param {*} value - valor a validar
 * @param {string} field - nombre del campo (para el mensaje de error)
 * @param {Array} list - lista de valores permitidos
 * @returns {*} el valor si es válido, o null
 */
function optionalEnum(value, field, list) {
  if (value === null || value === undefined || value === '') return null;
  if (!isOneOf(value, list)) {
    throw validationError(`El campo "${field}" no es válido.`);
  }
  return value;
}

/**
 * Construye un Error de validación (400/VALIDATION_ERROR) con el mensaje dado.
 * @param {string} message - mensaje descriptivo del error
 * @returns {Error} error listo para lanzar
 */
function validationError(message) {
  const err = new Error(message);
  err.statusCode = 400;
  err.code = 'VALIDATION_ERROR';
  return err;
}

/**
 * Construye un Error de permisos insuficientes (403/FORBIDDEN).
 * @param {string} [message] - mensaje descriptivo del error
 * @returns {Error} error listo para lanzar
 */
function forbiddenError(message = 'No tiene permisos para realizar esta acción.') {
  const err = new Error(message);
  err.statusCode = 403;
  err.code = 'FORBIDDEN';
  return err;
}

/**
 * Construye un Error de recurso no encontrado (404/NOT_FOUND).
 * @param {string} [message] - mensaje descriptivo del error
 * @returns {Error} error listo para lanzar
 */
function notFoundError(message = 'Recurso no encontrado.') {
  const err = new Error(message);
  err.statusCode = 404;
  err.code = 'NOT_FOUND';
  return err;
}

/**
 * Construye un Error de conflicto (409/CONFLICT), usado por ejemplo ante duplicados.
 * @param {string} message - mensaje descriptivo del error
 * @returns {Error} error listo para lanzar
 */
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
  LOCATION_TYPES,
  LOCATION_TYPE_LABEL,
  LOCATION_REASONS,
  LOCATION_REASON_LABEL,
  isOneOf,
  requireString,
  optionalString,
  optionalEnum,
  validationError,
  forbiddenError,
  notFoundError,
  conflictError,
};

