/* Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores.
 *
 * deriveAuthEmail — calcula el email canónico con el que un usuario existe
 * (o debería existir) en Firebase Auth, a partir de su doc de Firestore.
 *
 * Preferencia:
 *   1. El `email` real del doc, si está presente y es válido.
 *   2. El sintético `${username_lower}@ticketsgcm.local` derivado del username.
 *
 * Esta función es PURA: no toca Firebase Auth, no hace I/O, no tiene
 * side-effects. La usan tanto el endpoint HTTP (`/api/auth/resolve-login`)
 * como el script de bootstrap (`scripts/bootstrap-firebase-auth.js`), para
 * garantizar que ambos coincidan en el email final.
 *
 * Devuelve `null` si el doc no tiene ni `email` válido ni `username`
 * derivable — el caller debe tratarlo como "usuario no provisionable".
 */
'use strict';

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
