/* Documentado por: Miguel Flores */
'use strict'
const express = require('express');
const router = express.Router();
const authService = require('../services/auth.service');
const firestoreData = require('../firestoreData');
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');

/**
 * GET / - Lista usuarios del sistema. Requiere usuario autenticado.
 * Acepta filtros por query string: ?role=, ?active=(1|true), ?area=.
 * @returns {Promise<void>} responde con { users }
 */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { role, active, area } = req.query;
    const list = await authService.listUsers({
      role,
      active: active === undefined ? undefined : /^(1|true)$/i.test(String(active)),
      area,
    }, req.user);
    res.json({ users: list });
  } catch (err) { next(err); }
});

/**
 * POST / - Crea un nuevo usuario. Requiere rol 'sac'.
 * Tras crear, verifica que el usuario autenticado que hizo la petición todavía exista
 * en Firestore; si no, destruye su sesión (protección ante borrado/renombrado concurrente).
 * @returns {Promise<void>} responde 201 con { user }
 */
router.post('/', requireAuth, requireRole('sac'), async (req, res, next) => {
  try {
    const user = await authService.createUser(req.body || {}, req.user);
    const stillExists = await firestoreData.getUserById(req.user.id);
    if (!stillExists && req.session) {
      req.session.destroy(() => {});
    }
    res.status(201).json({ user });
  } catch (err) { next(err); }
});

/**
 * GET /:id - Obtiene un usuario por id. Requiere rol 'sac'.
 * @returns {Promise<void>} responde con { user }
 */
router.get('/:id', requireAuth, requireRole('sac'), async (req, res, next) => {
  try {
    const user = await authService.getById(parseInt(req.params.id, 10));
    res.json({ user });
  } catch (err) { next(err); }
});

/**
 * PATCH /:id - Actualiza datos de un usuario existente por id. Requiere rol 'sac'.
 * @returns {Promise<void>} responde con { user } actualizado
 */
router.patch('/:id', requireAuth, requireRole('sac'), async (req, res, next) => {
  try {
    const user = await authService.updateUser(
      parseInt(req.params.id, 10),
      req.body || {},
      req.user,
    );
    res.json({ user });
  } catch (err) { next(err); }
});

module.exports = router;

