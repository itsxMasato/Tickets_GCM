/* Documentado por: Miguel Flores */
'use strict'
const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const config = require('./config');
const errorHandler = require('./middleware/errorHandler');

const sessionDir = process.env.SESSION_DIR
  ? process.env.SESSION_DIR
  : config.env === 'production'
    ? "/tmp/sessions"
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

  if (config.env === 'production') {
    app.set('trust proxy', 1);
  }

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
    maxAge: 86400,
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
      sameSite: config.env === 'production' ? 'none' : 'lax',
      secure: config.env === 'production',
      partitioned: config.env === 'production',
      maxAge: 1000 * 60 * 60 * 24 * 7,
    },
  });
  app.use(sessionMiddleware);

  app.use('/videos', express.static(path.join(__dirname, '..', 'public', 'videos'), {
    maxAge: 0,
    setHeaders(res) {
      res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
    },
  }));

  app.use('/uploads/avatars', express.static(require('./middleware/upload').avatarDir, {
    maxAge: '7d',
  }));

  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.get('/favicon.ico', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'img', 'Logo.png'));
  });

  app.get('/api/health', (req, res) => {
    res.json({ ok: true, service: 'tickets-gcm', env: config.env });
  });

  app.use('/api/auth', require('./routes/auth.routes'));
  app.use('/api/users', require('./routes/users.routes'));
  app.use('/api/categories', require('./routes/categories.routes'));
  app.use('/api/tickets', require('./routes/tickets.routes'));
  app.use('/api/notifications', require('./routes/notifications.routes'));
  app.use('/api/stats', require('./routes/stats.routes'));
  app.use('/api/roles', require('./routes/roles.routes'));
  app.use('/api/role-labels', require('./routes/role-labels.routes'));
  app.use('/api/calendar', require('./routes/calendar.routes'));

  app.use('/api/companies',       require('./routes/companies.routes'));
  const membershipsRoutes = require('./routes/memberships.routes');
  app.use('/api/users',      membershipsRoutes.userMemberships);
  app.use('/api/companies',  membershipsRoutes.companyMemberships);

  app.use('/api', (req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Ruta no encontrada.' } });
  });

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

