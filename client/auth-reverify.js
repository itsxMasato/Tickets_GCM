/* Documentado por: Miguel Flores */
import { api } from './api.js';

/**
 * Verifica que la contraseña dada corresponda al usuario actualmente logueado, contra el
 * backend (bcrypt). Lanza un error con status 401 si no coincide.
 * @param {string} password - contraseña a verificar
 * @returns {Promise<boolean>} true si la contraseña es correcta
 */
export async function verifyCurrentPassword(password) {
  await api.auth.verifyPassword({ password });
  return true;
}
