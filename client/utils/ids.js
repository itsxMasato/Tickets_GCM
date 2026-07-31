/* Documentado por: Miguel Flores */
/**
 * Compara dos identificadores tolerando diferencias de tipo (string vs number).
 * Si ambos valores son numéricos los compara como número; si no, como string.
 * @param {*} a - primer identificador a comparar
 * @param {*} b - segundo identificador a comparar
 * @returns {boolean} true si representan el mismo id
 */
export function sameId(a, b) {
  if (a == null || b == null) return false;
  if (typeof a === 'object' || typeof b === 'object') return false;
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na === nb;
  return String(a) === String(b);
}

