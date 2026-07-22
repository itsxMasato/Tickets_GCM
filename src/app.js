/* Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. */
'use strict';
const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const path = require('path');

const config = require('./config');
const errorHandler = require('./middleware/errorHandler');

// Origen permitido para CORS. En producción el frontend vive en Netlify
// (https://ticketsgcm.netlify.app) y el backend en Render; la cookie de
// sesión cruza dominios, así que necesitamos CORS con credentials: true y
// sameSite: 'none' en la cookie (ver sessionMiddleware abajo).
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || (
  config.env === 'production'
    ? 'https://ticketsgcm.netlify.app'
    : 'http://localhost:5173'
);

function createApp() {
  const app = express();

  // CORS debe ir ANTES de sessionMiddleware para que las respuestas a
  // preflight OPTIONS (POST con credentials) incluyan los headers correctos.
  app.use(cors({
    origin: ALLOWED_ORIGIN,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    maxAge: 86400, // cache preflight 24h
  }));

  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  const sessionMiddleware = session({
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      // 'none' permite que la cookie viaje cross-site (Netlify → Render).
      // Requiere secure: true — los browsers rechazan 'none' sin HTTPS.
      // En dev local (config.env !== 'production') mantenemos 'lax' porque
      // secure: true sobre HTTP hace que el browser descarte la cookie.
      sameSite: config.env === 'production' ? 'none' : 'lax',
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
