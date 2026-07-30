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

export function avatarColor(seed) {
  return PALETTE[(seed || 0) % PALETTE.length];
}

export function initials(name) {
  const safe = name || '';
  return safe.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?';
}

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

