/* Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. */
'use strict';
const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const path = require('path');

const config = require('./config');
const errorHandler = require('./middleware/errorHandler');

function createApp() {
  const app = express();

  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  const sessionMiddleware = session({
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

  // Evita caché agresiva de videos estáticos con el mismo nombre.
  app.use('/videos', express.static(path.join(__dirname, '..', 'public', 'videos'), {
    maxAge: 0,
    setHeaders(res) {
      res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
    },
  }));

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
  app.use('/api/roles', require('./routes/roles.routes'));
  app.use('/api/role-labels', require('./routes/role-labels.routes'));
  app.use('/api/calendar', require('./routes/calendar.routes'));

  // Fase 2 — multi-tenant
  app.use('/api/companies',       require('./routes/companies.routes'));
  app.use('/api/company-areas',   require('./routes/company-areas.routes'));
  const membershipsRoutes = require('./routes/memberships.routes');
  app.use('/api/users',      membershipsRoutes.userMemberships);
  app.use('/api/companies',  membershipsRoutes.companyMemberships);

  // 404 para API
  app.use('/api', (req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Ruta no encontrada.' } });
  });

  // Fallback SPA: cualquier ruta no-API y no-asset devuelve la app cliente
  // (sirve `public/dist/index.html` si existe; si no, `public/index.html`).
  // Evita el "fallo en blanco" en producción cuando se hace deep-link a una ruta interna.
  const fs = require('fs');
  const distIndex = path.join(__dirname, '..', 'public', 'dist', 'index.html');
  const rootIndex = path.join(__dirname, '..', 'public', 'index.html');
  const spaIndex = fs.existsSync(distIndex) ? distIndex : (fs.existsSync(rootIndex) ? rootIndex : null);
  if (spaIndex) {
    app.get(/^\/(?!api|socket\.io|uploads|img|css|js|assets|favicon\.ico).*/, (req, res) => {
      res.sendFile(spaIndex);
    });
  }

  app.use(errorHandler);

  return { app, sessionMiddleware };
}

module.exports = createApp;
