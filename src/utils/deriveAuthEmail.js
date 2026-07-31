/* Documentado por: Miguel Flores */
'use strict'

const DOMAIN = 'gcm.com';

/**
 * Deriva el email a usar para autenticar a un usuario contra Firebase Auth: si el usuario
 * tiene un email real cargado lo usa tal cual; si no, genera un email sintético
 * `<username>@gcm.com` a partir del username saneado.
 * @param {Object} user - registro de usuario (con email y/o username)
 * @returns {string|null} email derivado, o null si no se pudo determinar
 */
function deriveAuthEmail(user) {
  if (!user || typeof user !== 'object') return null;

  const realEmail = (user.email || '').trim().toLowerCase();
  if (realEmail && realEmail.includes('@')) return realEmail;

  const username = (user.username || '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
  if (!username) return null;
  return `${username}@${DOMAIN}`;
}

module.exports = { deriveAuthEmail, DOMAIN };

