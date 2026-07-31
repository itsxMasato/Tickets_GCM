/* Documentado por: Miguel Flores */
'use strict'

/**
 * Determina si un ticket pertenece a la misma empresa activa del usuario.
 * Si el ticket no tiene company_id se considera visible (dato legacy sin empresa asignada).
 * @param {Object} ticket - registro de ticket
 * @param {Object} user - usuario con activeCompanyId
 * @returns {boolean} true si el ticket es de la empresa activa del usuario (o no tiene empresa)
 */
function sameCompany(ticket, user) {
  if (ticket.company_id == null) return true;
  if (user.activeCompanyId == null) return false;
  return String(ticket.company_id) === String(user.activeCompanyId);
}

/**
 * Resuelve el área asociada a un ticket, priorizando area, luego el área del asignado
 * y por último el área de quien lo creó.
 * @param {Object} ticket - registro de ticket
 * @returns {string|null} área resuelta, o null si no hay ninguna
 */
function resolveTicketArea(ticket) {
  return ticket.area || ticket.assigned_to_area || ticket.created_by_area || null;
}

/**
 * Determina si un usuario puede ver un ticket dado, según su rol:
 * platform admin ve todo; sac ve todo dentro de su empresa; jefe_inmediato solo ve
 * tickets solucionados de su área y empresa; admin_area solo los asignados o creados por él;
 * supervisor_campo solo los que él creó.
 * @param {Object} ticket - registro de ticket
 * @param {Object} user - usuario solicitante
 * @returns {boolean} true si el usuario tiene permiso para ver el ticket
 */
function canViewTicket(ticket, user) {
  if (!user || !ticket) return false;
  if (user.isPlatformAdmin) return true;
  if (user.role === 'sac') return sameCompany(ticket, user);
  if (user.role === 'jefe_inmediato') {
    if (ticket.status !== 'solucionado' || !sameCompany(ticket, user)) return false;
    const area = resolveTicketArea(ticket);
    return area == null || area === user.area;
  }
  if (user.role === 'admin_area') {
    if (ticket.assigned_to && ticket.assigned_to === user.id) return true;
    if (ticket.created_by && ticket.created_by === user.id) return true;
    return false;
  }
  if (user.role === 'supervisor_campo') {
    return ticket.created_by === user.id;
  }
  return false;
}

module.exports = { canViewTicket, sameCompany, resolveTicketArea };

