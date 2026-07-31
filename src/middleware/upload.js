/* Documentado por: Miguel Flores */
'use strict'
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { v4: uuid } = require('uuid');
const config = require('../config');

if (!fs.existsSync(config.uploadDir)) {
  fs.mkdirSync(config.uploadDir, { recursive: true });
}

const ALLOWED_MIMES = new Set([
  'image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp', 'image/svg+xml', 'image/bmp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain', 'text/csv', 'text/markdown',
  'application/zip', 'application/x-zip-compressed',
  'application/json',
]);

const storage = multer.diskStorage({
  /**
   * Define el directorio destino de los adjuntos de tickets subidos (config.uploadDir).
   * @param {Request} req
   * @param {Object} file - metadata del archivo subido (multer)
   * @param {Function} cb - callback(err, destinationPath)
   */
  destination(req, file, cb) { cb(null, config.uploadDir); },
  /**
   * Genera un nombre de archivo único (uuid) preservando la extensión original saneada.
   * @param {Request} req
   * @param {Object} file - metadata del archivo subido (multer)
   * @param {Function} cb - callback(err, filename)
   */
  filename(req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase().replace(/[^a-z0-9.]/g, '');
    cb(null, `${uuid()}${ext}`);
  },
});

/**
 * Filtro de multer para adjuntos de tickets: acepta solo mimetypes en ALLOWED_MIMES,
 * rechazando con error 400/UNSUPPORTED_MEDIA en caso contrario.
 * @param {Request} req
 * @param {Object} file - metadata del archivo subido (multer)
 * @param {Function} cb - callback(err, acceptBoolean)
 * @returns {void}
 */
function fileFilter(req, file, cb) {
  if (ALLOWED_MIMES.has(file.mimetype)) return cb(null, true);
  const err = new Error(`Tipo de archivo no permitido: ${file.mimetype}`);
  err.statusCode = 400;
  err.code = 'UNSUPPORTED_MEDIA';
  cb(err);
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: config.maxUploadMb * 1024 * 1024 },
});

const avatarDir = path.join(config.uploadDir, 'avatars');
if (!fs.existsSync(avatarDir)) {
  fs.mkdirSync(avatarDir, { recursive: true });
}

const AVATAR_MIMES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp']);

const avatarStorage = multer.diskStorage({
  /**
   * Define el directorio destino de las fotos de perfil subidas (avatarDir).
   * @param {Request} req
   * @param {Object} file - metadata del archivo subido (multer)
   * @param {Function} cb - callback(err, destinationPath)
   */
  destination(req, file, cb) { cb(null, avatarDir); },
  /**
   * Genera un nombre de archivo único (uuid) para el avatar, preservando la extensión
   * original saneada (o .jpg por defecto si no se puede determinar).
   * @param {Request} req
   * @param {Object} file - metadata del archivo subido (multer)
   * @param {Function} cb - callback(err, filename)
   */
  filename(req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase().replace(/[^a-z0-9.]/g, '') || '.jpg';
    cb(null, `${uuid()}${ext}`);
  },
});

/**
 * Filtro de multer para avatares: acepta solo imágenes en AVATAR_MIMES,
 * rechazando con error 400/UNSUPPORTED_MEDIA en caso contrario.
 * @param {Request} req
 * @param {Object} file - metadata del archivo subido (multer)
 * @param {Function} cb - callback(err, acceptBoolean)
 * @returns {void}
 */
function avatarFileFilter(req, file, cb) {
  if (AVATAR_MIMES.has(file.mimetype)) return cb(null, true);
  const err = new Error('La foto de perfil debe ser una imagen (PNG, JPG, GIF o WEBP).');
  err.statusCode = 400;
  err.code = 'UNSUPPORTED_MEDIA';
  cb(err);
}

const avatarUpload = multer({
  storage: avatarStorage,
  fileFilter: avatarFileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});

module.exports = { upload, ALLOWED_MIMES, avatarUpload, avatarDir };

