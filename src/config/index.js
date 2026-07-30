/* Documentado por: Miguel Flores */
'use strict'
require('dotenv').config();
const path = require('path');

const root = path.resolve(__dirname, '..', '..');

module.exports = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  sessionSecret: process.env.SESSION_SECRET || 'cambiar-en-produccion',
  dbPath: path.resolve(root, process.env.DB_PATH || './data/tickets.db'),
  uploadDir: path.resolve(root, process.env.UPLOAD_DIR || './uploads'),
  maxUploadMb: parseInt(process.env.MAX_UPLOAD_MB || '10', 10),
  sessionDbPath: path.resolve(root, './data/sessions.db'),
};

