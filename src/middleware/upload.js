/* Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. */
'use strict';
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
  destination(req, file, cb) { cb(null, config.uploadDir); },
  filename(req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase().replace(/[^a-z0-9.]/g, '');
    cb(null, `${uuid()}${ext}`);
  },
});

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

module.exports = { upload, ALLOWED_MIMES };
