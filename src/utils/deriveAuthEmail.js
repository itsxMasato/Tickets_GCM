/* Documentado por: Miguel Flores */
'use strict'

const DOMAIN = 'gcm.com';

function deriveAuthEmail(user) {
  if (!user || typeof user !== 'object') return null;

  const realEmail = (user.email || '').trim().toLowerCase();
  if (realEmail && realEmail.includes('@')) return realEmail;

  const username = (user.username || '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
  if (!username) return null;
  return `${username}@${DOMAIN}`;
}

module.exports = { deriveAuthEmail, DOMAIN };

