/* Documentado por: Miguel Flores */
'use strict'
const express = require('express');
const router = express.Router();
const rolesService = require('../services/roles.service');
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');

/**
 * GET / - Lista todos los roles del sistema junto con sus permisos. Requiere rol 'sac'.
 * @returns {Promise<void>} responde con el resultado de rolesService.list()
 */
router.get('/', requireAuth, requireRole('sac'), async (req, res, next) => {
  try {
    const result = await rolesService.list();
    res.json(result);
  } catch (err) { next(err); }
});

/**
 * GET /:role - Obtiene los permisos de un rol específico. Requiere rol 'sac'.
 * @returns {Promise<void>} responde con { role, permissions }
 */
router.get('/:role', requireAuth, requireRole('sac'), async (req, res, next) => {
  try {
    const role = req.params.role;
    const perms = await rolesService.get(role);
    res.json({ role, permissions: perms });
  } catch (err) { next(err); }
});

/**
 * PATCH /:role - Actualiza los permisos de un rol. Requiere rol 'sac'.
 * @returns {Promise<void>} responde con { role, permissions } actualizados
 */
router.patch('/:role', requireAuth, requireRole('sac'), async (req, res, next) => {
  try {
    const role = req.params.role;
    const perms = await rolesService.update(role, req.body || {}, req.user);
    res.json({ role, permissions: perms });
  } catch (err) { next(err); }
});

/**
 * DELETE /:role - Elimina un rol (no base) del sistema. Requiere rol 'sac'.
 * @returns {Promise<void>} responde 204 sin contenido
 */
router.delete('/:role', requireAuth, requireRole('sac'), async (req, res, next) => {
  try {
    await rolesService.deleteRole(req.params.role, req.body || {}, req.user);
    res.status(204).send();
  } catch (err) { next(err); }
});

/**
 * DELETE /permissions/:key - Elimina un permiso específico (por su clave) de todos los roles. Requiere rol 'sac'.
 * @returns {Promise<void>} responde 204 sin contenido
 */
router.delete('/permissions/:key', requireAuth, requireRole('sac'), async (req, res, next) => {
  try {
    await rolesService.deletePermission(req.params.key, req.body || {}, req.user);
    res.status(204).send();
  } catch (err) { next(err); }
});

module.exports = router;

