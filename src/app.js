/* Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. */
'use strict';
const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const config = require('./config');
const errorHandler = require('./middleware/errorHandler');

// Store de sesión persistente. En producción (Render) no podemos usar
// MemoryStore porque se pierde al reiniciar el servicio — todos los
// usuarios quedarían deslogueados. Usamos SQLite para que las sesiones
// sobrevivan redeploys.
//
// Importante: el directorio debe existir antes de instanciar SQLiteStore,
// sino falla con SQLITE_CANTOPEN. En Render el filesystem es efímero y
// `data/` no se commitea (está en .gitignore), así que lo creamos al
// arranque. En dev local ya existe.
const sessionDir = config.env === 'production'
  ? '/tmp/sessions'  // Render: /tmp siempre existe y es escribible
  : path.resolve(__dirname, '..', 'data');
try {
  fs.mkdirSync(sessionDir, { recursive: true });
} catch (e) {
  console.error('[session] No se pudo crear directorio de sesiones:', sessionDir, e.message);
}

const SQLiteStore = require('connect-sqlite3')(session);
const sessionStore = new SQLiteStore({
  db: 'sessions.db',
  dir: sessionDir,
  table: 'sessions',
});

// Origen permitido para CORS. En producción el frontend vive en Netlify
// y el backend en Render; la cookie de sesión cruza dominios, así que
// necesitamos CORS con credentials: true y sameSite: 'none' en la cookie
// (ver sessionMiddleware abajo).
const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:3000',
  'https://ticketsgcm.netlify.app',
  'https://tickets-gcm.netlify.app',
  'https://www.ticketsgcm.netlify.app',
  'https://www.tickets-gcm.netlify.app',
];
const ALLOWED_ORIGINS = Array.from(new Set([
  process.env.ALLOWED_ORIGIN,
  ...(config.env === 'production' ? [] : []),
  ...DEFAULT_ALLOWED_ORIGINS,
].filter(Boolean)));

function createApp() {
  const app = express();

  // CORS debe ir ANTES de sessionMiddleware para que las respuestas a
  // preflight OPTIONS (POST con credentials) incluyan los headers correctos.
  //
  // Logging defensivo: si un origen es rechazado, lo dejamos en consola para
  // diagnosticar deploys desactualizados (Render free tier a veces sirve una
  // versión vieja tras un sleep). El fix de código solo aplica tras redeploy.
  app.use(cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const isAllowed =
        ALLOWED_ORIGINS.includes(origin) ||
        /\.netlify\.app$/i.test(origin) ||
        /\.onrender\.com$/i.test(origin);
      if (isAllowed) {
        return callback(null, origin);
      }
      console.warn('[cors] Origen rechazado:', origin, '— no coincide con ALLOWED_ORIGINS ni con *.netlify.app / *.onrender.com');
      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    maxAge: 86400, // cache preflight 24h
  }));

  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  const sessionMiddleware = session({
    store: sessionStore,
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

  app.get('/api/health', (req, res) => {
    res.json({ ok: true, service: 'tickets-gcm', env: config.env });
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
