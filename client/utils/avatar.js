/* Documentado por: Miguel Flores */
import { h } from './dom.js';
import { assetUrl } from '../api.js';

const PALETTE = [
  "#071D4C",
  "#44497B",
  "#16ACE4",
  "#CF301D",
  "#8b5cf6",
  "#0ea5e9",
  "#14b8a6",
  "#7c3aed",
  "#f97316",
  "#243447",
];

/**
 * Devuelve un color determinístico de la paleta de avatares a partir de un seed (típicamente el id de usuario).
 * @param {number} seed - valor numérico usado para elegir el color (ej. user.id)
 * @returns {string} color hexadecimal de la paleta
 */
export function avatarColor(seed) {
  return PALETTE[(seed || 0) % PALETTE.length];
}

/**
 * Calcula las iniciales (hasta 2 letras) a partir de un nombre completo.
 * @param {string} name - nombre completo de la persona
 * @returns {string} iniciales en mayúscula, o '?' si no hay nombre
 */
export function initials(name) {
  const safe = name || '';
  return safe.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?';
}

/**
 * Renderiza el avatar de un usuario: la imagen subida si existe, o un círculo con sus iniciales y color determinístico.
 * @param {Object} user - usuario a representar (usa avatar_url, id y full_name)
 * @param {Object} [options] - opciones de render
 * @param {string} [options.className] - clases CSS a aplicar al elemento del avatar
 * @returns {HTMLElement} elemento DOM del avatar (img o span)
 */
export function renderAvatar(user, { className = 'avatar' } = {}) {
  const classSelector = className.trim().split(/\s+/).join('.');
  if (user?.avatar_url) {
    return h(`img.${classSelector}.object-cover`, {
      src: assetUrl(user.avatar_url),
      alt: '',
    });
  }
  return h(`span.${classSelector}`, {
    style: { backgroundColor: avatarColor(user?.id) },
  }, initials(user?.full_name));
}

