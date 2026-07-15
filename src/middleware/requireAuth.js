'use strict';

const { toId } = require('../firestoreData');

function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Debe iniciar sesión.' } });
  }
  req.user = {
    // toId normaliza ids numéricos a Number. Sin esto, `req.user.id` llega como
    // string desde la sesión (snap.id de Firestore), pero los tickets se leen
    // con toId() → Number. Comparaciones estrictas como
    // `ticket.assigned_to === user.id` fallarían (7 === "7" → false) y un
    // admin_area asignado legítimamente no podría ver su propio ticket.
    id: toId(req.session.userId),
    username: req.session.username,
    full_name: req.session.full_name,
    role: req.session.role,
    area: req.session.area || null,
  };
  next();
}

module.exports = requireAuth;
