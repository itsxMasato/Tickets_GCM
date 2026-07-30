/* Documentado por: Miguel Flores */
'use strict'

function sameCompany(ticket, user) {
  if (ticket.company_id == null) return true;
  if (user.activeCompanyId == null) return false;
  return String(ticket.company_id) === String(user.activeCompanyId);
}

function resolveTicketArea(ticket) {
  return ticket.area || ticket.assigned_to_area || ticket.created_by_area || null;
}

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

