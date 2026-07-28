/* Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. */
'use strict';
const express = require('express');
const router = express.Router();
const authService = require('../services/auth.service');
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');

// Cualquier usuario autenticado puede obtener listados de usuarios activos
// para filtros y selección de responsables en el frontend.
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { role, active, area } = req.query;
    // Acepta varios formatos de query string: el cliente manda `active: 1`
    // (URLSearchParams lo serializa como "active=1"), pero también es válido
    // "active=true". Cualquier otro valor truthy se trata como true. Esto
    // era el bug que rompía el módulo /roles: el filtro nunca aplicaba y
    // siempre mostraba 0 usuarios por rol.
    const list = await authService.listUsers({
      role,
      active: active === undefined ? undefined : /^(1|true)$/i.test(String(active)),
      area,
    }, req.user);
    res.json({ users: list });
  } catch (err) { next(err); }
});

router.post('/', requireAuth, requireRole('sac'), async (req, res, next) => {
  try {
    // Pasamos `req.user` para que el service pueda crear la membresía
    // asociada a la empresa durante la creación del usuario cuando el
    // payload incluye `company_id`.
    const user = await authService.createUser(req.body || {}, req.user);
    res.status(201).json({ user });
  } catch (err) { next(err); }
});

// Obtener usuario por id
router.get('/:id', requireAuth, requireRole('sac'), async (req, res, next) => {
  try {
    const user = await authService.getById(parseInt(req.params.id, 10));
    res.json({ user });
  } catch (err) { next(err); }
});

router.patch('/:id', requireAuth, requireRole('sac'), async (req, res, next) => {
  try {
    // Pasamos req.user al service para que updateUser aplique anti-self-demote
    // (un SAC no puede desactivarse ni cambiar su propio rol).
    const user = await authService.updateUser(
      parseInt(req.params.id, 10),
      req.body || {},
      req.user,
    );
    res.json({ user });
  } catch (err) { next(err); }
});

module.exports = router;
