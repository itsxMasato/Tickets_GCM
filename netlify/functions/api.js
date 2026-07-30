/* Documentado por: Miguel Flores */
const express = require('express');
const serverless = require('@netlify/functions');
const path = require('path');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, message: 'Netlify API ready' });
});

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Faltan credenciales' } });
  }

  return res.status(200).json({
    user: {
      id: 'demo-user',
      username,
      email: `${username}@example.com`,
      role: 'sac',
      name: username,
    },
  });
});

app.post('/api/auth/logout', (req, res) => {
  res.json({ ok: true });
});

app.get('/api/auth/me', (req, res) => {
  res.json({
    user: {
      id: 'demo-user',
      username: 'demo',
      email: 'demo@example.com',
      role: 'sac',
      name: 'Demo User',
    },
  });
});

app.get('/api/users', (req, res) => {
  res.json({ users: [] });
});

app.get('/api/tickets', (req, res) => {
  res.json({ tickets: [] });
});

app.get('/api/notifications/unread-count', (req, res) => {
  res.json({ count: 0 });
});

app.get('/api/notifications', (req, res) => {
  res.json({ notifications: [] });
});

app.get('/api/stats/dashboard', (req, res) => {
  res.json({ stats: {} });
});

app.get('/api/roles', (req, res) => {
  res.json({ roles: {} });
});

app.get('/api/role-labels', (req, res) => {
  res.json({ labels: {} });
});

app.use('/api', (req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Ruta no encontrada.' } });
});

exports.handler = serverless.handler(app);

