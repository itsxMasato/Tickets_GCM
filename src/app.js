'use strict';
const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const cookieParser = require('cookie-parser');
const path = require('path');

const config = require('./config');
const errorHandler = require('./middleware/errorHandler');

function createApp() {
  const app = express();

  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  const sessionMiddleware = session({
    store: new SQLiteStore({ db: 'sessions.db', dir: path.resolve(__dirname, '..', 'data') }),
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.env === 'production',
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 días
    },
  });
  app.use(sessionMiddleware);

  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.get('/favicon.ico', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'img', 'Logo.png'));
  });

  // Rutas API
  app.use('/api/auth', require('./routes/auth.routes'));
  app.use('/api/users', require('./routes/users.routes'));
  app.use('/api/categories', require('./routes/categories.routes'));
  app.use('/api/tickets', require('./routes/tickets.routes'));
  app.use('/api/notifications', require('./routes/notifications.routes'));
  app.use('/api/stats', require('./routes/stats.routes'));

  // 404 para API
  app.use('/api', (req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Ruta no encontrada.' } });
  });

  app.use(errorHandler);

  return { app, sessionMiddleware };
}

module.exports = createApp;
