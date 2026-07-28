/* Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. */
'use strict';

// canViewTicket - unica fuente de verdad para "puede este usuario ver este
// ticket". Antes existia una copia divergente en attachments.service.js que
// dejaba pasar a CUALQUIER admin_area sin validar assigned_to/created_by
// (IDOR: un admin_area podia descargar adjuntos de tickets ajenos con solo
// iterar el id). tickets.service.js y attachments.service.js importan esta
// misma funcion para que nunca se vuelvan a desincronizar.
function canViewTicket(ticket, user) {
  if (!user || !ticket) return false;
  if (user.role === 'sac') return true;
  if (user.role === 'jefe_inmediato') return ticket.status === 'solucionado';
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

module.exports = { canViewTicket };
