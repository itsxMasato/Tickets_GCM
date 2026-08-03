/* Documentado por: Miguel Flores */
'use strict'

// Funciones puras de acotamiento por empresa, compartidas por varios servicios. Viven acá
// (independientes de Firestore/ORM) para poder testearlas con arrays planos sin mockear
// ninguna capa de datos.

/**
 * Filtra una lista de filas (tickets, categorías, etc.) dejando solo las que
 * pertenecen a la empresa activa indicada o las que no tienen empresa asignada (company_id null).
 * @param {Array<Object>} rows - filas a filtrar, cada una con campo company_id
 * @param {String|Number|null} activeCompanyId - id de la empresa activa del usuario
 * @returns {Array<Object>} filas filtradas por empresa
 */
function scopeByCompany(rows, activeCompanyId) {
  if (activeCompanyId == null)
    return rows.filter((row) => row.company_id == null);
  const normalized = String(activeCompanyId);
  return rows.filter((row) => row.company_id == null || String(row.company_id) === normalized);
}

/**
 * Filtra una lista de usuarios dejando visibles solo al propio requester, a los
 * miembros activos de su empresa activa y a los usuarios sin ninguna membresía
 * registrada. No aplica restricción si el requester es platform admin, rol 'sac'
 * o no tiene empresa activa.
 * @param {Array<Object>} rows - usuarios a filtrar
 * @param {Array<Object>} memberships - membresías (user_id, company_id, active)
 * @param {Object} requester - usuario que realiza la consulta (con role/isPlatformAdmin/activeCompanyId)
 * @returns {Array<Object>} usuarios visibles para el requester
 */
function scopeUsersByCompany(rows, memberships, requester) {
  if (!requester || requester.isPlatformAdmin || requester.role === 'sac' || requester.activeCompanyId == null) {
    return rows;
  }
  const activeCompanyId = String(requester.activeCompanyId);
  const isActive = (m) => m.active === 1 || m.active === true || m.active === '1' || m.active === 'true';
  const memberIds = new Set(memberships.filter((m) => isActive(m) && String(m.company_id) === activeCompanyId).map((m) => String(m.user_id)));
  const anyMembershipIds = new Set(memberships.map((m) => String(m.user_id)));
  const requesterId = String(requester.id);
  return rows.filter((row) => {
    const id = String(row.id);
    return id === requesterId || memberIds.has(id) || !anyMembershipIds.has(id);
  });
}

module.exports = { scopeByCompany, scopeUsersByCompany };
