/* Documentado por: Miguel Flores */
import { sameId } from './ids.js';

export const ROLES = ['supervisor_campo', 'sac', 'admin_area', 'jefe_inmediato'];
export const AREAS = ['operaciones', 'logistica', 'mantenimiento', 'sistemas', 'otro'];

export function isSAC(user) { return user?.role === 'sac'; }
export function isJefe(user) { return user?.role === 'jefe_inmediato'; }
export function isAdmin(user) { return user?.role === 'admin_area'; }
export function isSupervisor(user) { return user?.role === 'supervisor_campo'; }

export function canCreateTicket(user) {
  return isSAC(user) || isSupervisor(user);
}

export function canSeeTicket(user, ticket) {
  if (!user || !ticket) return false;
  if (isSAC(user)) return true;
  if (isJefe(user)) return ticket.status === 'solucionado';
  if (isAdmin(user)) return sameId(ticket.assigned_to, user.id) || sameId(ticket.created_by, user.id);
  if (isSupervisor(user)) return sameId(ticket.created_by, user.id);
  return false;
}

export function canEditMeta(user, ticket) {
  if (!user || !ticket) return false;
  if (isSAC(user)) return true;
  if (isSupervisor(user)) return sameId(ticket.created_by, user.id) && ticket.status === 'recibido';
  return false;
}

export function canAssign(user) {
  return isSAC(user) || isJefe(user);
}

export function nextStates(user, ticket) {
  if (!user || !ticket) return [];
  const cur = ticket.status;
  if (isSAC(user)) {
    return {
      recibido:    ['asignado', 'cerrado'],
      asignado:    ['en_proceso', 'asignado'],
      en_proceso:  ['solucionado', 'asignado'],
      solucionado: ['cerrado', 'reabierto', 'en_proceso'],
      cerrado:     ['reabierto'],
      reabierto:   ['en_proceso', 'asignado'],
    }[cur] || [];
  }
  if (isJefe(user)) {
    return {
      recibido:    ['cerrado'],
      solucionado: ['cerrado', 'reabierto'],
      cerrado:     ['reabierto'],
    }[cur] || [];
  }
  if (isAdmin(user)) {
    if (!sameId(ticket.assigned_to, user.id)) return [];
    return {
      asignado:    ['en_proceso'],
      en_proceso:  ['solucionado'],
      reabierto:   ['en_proceso'],
      solucionado: ['en_proceso'],
    }[cur] || [];
  }
  return [];
}

export function canComment(user, ticket) {
  return canSeeTicket(user, ticket) && ticket.status !== 'cerrado';
}

export function canUpload(user, ticket) {
  return canSeeTicket(user, ticket) && ticket.status !== 'cerrado';
}

export function canManageUsers(user)    { return isSAC(user); }
export function canManageCategories(user) { return isSAC(user); }
export function canViewReports(user)    { return isSAC(user) || isJefe(user); }
export function canViewAllTickets(user) { return isSAC(user) || isJefe(user); }

export function isPlatformAdmin(user) { return user?.isPlatformAdmin === true; }
export function canManageCompanies(user) { return isPlatformAdmin(user) || isSAC(user); }

export function hasMultipleCompanies(user) {
  return Array.isArray(user?.memberships) && user.memberships.length > 1;
}

