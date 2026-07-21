/* Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. */
// Utilidades compartidas para avatares de usuario.
// El topbar y el sidebar del shell usan la misma paleta determinística
// (mismo seed → mismo color) para que un usuario sea identificable
// en cualquier parte de la UI. Antes cada componente tenía su propia
// copia de `avatarColor` y `initials`; centralizado aquí.

// Paleta de avatares — colores saturados con buen contraste contra
// brand-navy (#071D4C) y ring-white, y con texto blanco. 10 entradas
// para tener repetición poco frecuente sin necesidad de hash.
const PALETTE = [
  '#071D4C', // brand-navy
  '#44497B', // brand-deep
  '#16ACE4', // brand-ocean
  '#CF301D', // accent
  '#8b5cf6', // violet
  '#0ea5e9', // sky
  '#14b8a6', // teal
  '#7c3aed', // purple
  '#f97316', // orange
  '#243447', // brand-ink
];

export function avatarColor(seed) {
  return PALETTE[(seed || 0) % PALETTE.length];
}

export function initials(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?';
}
