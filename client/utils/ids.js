/* Documentado por: Miguel Flores */
export function sameId(a, b) {
  if (a == null || b == null) return false;
  if (typeof a === 'object' || typeof b === 'object') return false;
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na === nb;
  return String(a) === String(b);
}

