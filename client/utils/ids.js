// Comparación de ids tolerante a Number/String.
// Los ids que llegan del backend (ticket.assigned_to, ticket.created_by,
// c.user_id, etc.) salen como Number porque el server normaliza con toId().
// El id de la sesión en el cliente puede llegar como String (mismo flujo
// de login que producía el bug del server). Sin esta coerción, las
// comparaciones estrictas (`ticket.assigned_to === user.id`) fallan y la
// UI oculta botones, comentarios o tickets completos.
//
// Usar solo para IDs (no para comparar otro tipo de valores).
export function sameId(a, b) {
  if (a == null || b == null) return false;
  if (typeof a === 'object' || typeof b === 'object') return false;
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na === nb;
  return String(a) === String(b);
}
