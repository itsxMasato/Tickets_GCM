/* Documentado por: Miguel Flores */
import { sameId } from './ids.js';

export const ROLES = ['supervisor_campo', 'sac', 'admin_area', 'jefe_inmediato'];
export const AREAS = ['operaciones', 'logistica', 'mantenimiento', 'sistemas', 'otro'];

/**
 * Determina si el usuario tiene el rol SAC (Servicio al cliente).
 * @param {Object} user - usuario a evaluar
 * @returns {boolean} true si el usuario es SAC
 */
export function isSAC(user) { return user?.role === 'sac'; }
/**
 * Determina si el usuario tiene el rol jefe inmediato.
 * @param {Object} user - usuario a evaluar
 * @returns {boolean} true si el usuario es jefe inmediato
 */
export function isJefe(user) { return user?.role === 'jefe_inmediato'; }
/**
 * Determina si el usuario tiene el rol administrador de área.
 * @param {Object} user - usuario a evaluar
 * @returns {boolean} true si el usuario es admin de área
 */
export function isAdmin(user) { return user?.role === 'admin_area'; }
/**
 * Determina si el usuario tiene el rol supervisor de campo.
 * @param {Object} user - usuario a evaluar
 * @returns {boolean} true si el usuario es supervisor de campo
 */
export function isSupervisor(user) { return user?.role === 'supervisor_campo'; }

/**
 * Determina si el usuario puede crear tickets (SAC o supervisor de campo).
 * @param {Object} user - usuario a evaluar
 * @returns {boolean} true si puede crear tickets
 */
export function canCreateTicket(user) {
  return isSAC(user) || isSupervisor(user);
}

/**
 * Determina si el usuario puede ver un ticket según su rol y relación con el ticket
 * (SAC ve todos, jefe solo los solucionados, admin de área los propios asignados/creados,
 * supervisor solo los que creó).
 * @param {Object} user - usuario a evaluar
 * @param {Object} ticket - ticket a evaluar
 * @returns {boolean} true si el usuario puede ver el ticket
 */
export function canSeeTicket(user, ticket) {
  if (!user || !ticket) return false;
  if (isSAC(user)) return true;
  if (isJefe(user)) return ticket.status === 'solucionado';
  if (isAdmin(user)) return sameId(ticket.assigned_to, user.id) || sameId(ticket.created_by, user.id);
  if (isSupervisor(user)) return sameId(ticket.created_by, user.id);
  return false;
}

/**
 * Determina si el usuario puede editar los metadatos de un ticket (SAC siempre, supervisor
 * solo si lo creó y sigue en estado "recibido").
 * @param {Object} user - usuario a evaluar
 * @param {Object} ticket - ticket a evaluar
 * @returns {boolean} true si puede editar los metadatos del ticket
 */
export function canEditMeta(user, ticket) {
  if (!user || !ticket) return false;
  if (isSAC(user)) return true;
  if (isSupervisor(user)) return sameId(ticket.created_by, user.id) && ticket.status === 'recibido';
  return false;
}

/**
 * Determina si el usuario puede asignar tickets (SAC o jefe inmediato).
 * @param {Object} user - usuario a evaluar
 * @returns {boolean} true si puede asignar tickets
 */
export function canAssign(user) {
  return isSAC(user) || isJefe(user);
}

/**
 * Determina si el usuario puede cambiar la ubicación física de un ticket (taller / proveedor externo): SAC siempre, o el admin de área al que está asignado el ticket. Independiente del status.
 * @param {Object} user - usuario a evaluar
 * @param {Object} ticket - ticket a evaluar
 * @returns {boolean} true si puede cambiar la ubicación
 */
export function canChangeLocation(user, ticket) {
  if (!user || !ticket) return false;
  if (isSAC(user)) return true;
  if (isAdmin(user)) return sameId(ticket.assigned_to, user.id);
  return false;
}

/**
 * Calcula los próximos estados válidos a los que un ticket puede transicionar, según el rol
 * del usuario, el estado actual del ticket, y (para admin de área) si el ticket le está asignado.
 * @param {Object} user - usuario que realizaría la transición
 * @param {Object} ticket - ticket cuyo estado se quiere cambiar
 * @returns {Array<string>} lista de estados siguientes permitidos (vacía si no hay ninguno)
 */
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

/**
 * Determina si el usuario puede comentar en un ticket (debe poder verlo y el ticket no estar cerrado).
 * @param {Object} user - usuario a evaluar
 * @param {Object} ticket - ticket a evaluar
 * @returns {boolean} true si puede comentar
 */
export function canComment(user, ticket) {
  return canSeeTicket(user, ticket) && ticket.status !== 'cerrado';
}

/**
 * Determina si el usuario puede subir adjuntos a un ticket (debe poder verlo y el ticket no estar cerrado).
 * @param {Object} user - usuario a evaluar
 * @param {Object} ticket - ticket a evaluar
 * @returns {boolean} true si puede subir adjuntos
 */
export function canUpload(user, ticket) {
  return canSeeTicket(user, ticket) && ticket.status !== 'cerrado';
}

/**
 * Determina si el usuario puede administrar usuarios (solo SAC).
 * @param {Object} user - usuario a evaluar
 * @returns {boolean} true si puede administrar usuarios
 */
export function canManageUsers(user)    { return isSAC(user); }
/**
 * Determina si el usuario puede administrar categorías (solo SAC).
 * @param {Object} user - usuario a evaluar
 * @returns {boolean} true si puede administrar categorías
 */
export function canManageCategories(user) { return isSAC(user); }
/**
 * Determina si el usuario puede administrar proveedores externos (solo SAC).
 * @param {Object} user - usuario a evaluar
 * @returns {boolean} true si puede administrar proveedores
 */
export function canManageProviders(user) { return isSAC(user); }
/**
 * Determina si el usuario puede ver reportes (SAC o jefe inmediato).
 * @param {Object} user - usuario a evaluar
 * @returns {boolean} true si puede ver reportes
 */
export function canViewReports(user)    { return isSAC(user) || isJefe(user); }
/**
 * Determina si el usuario puede ver todos los tickets sin restricción (SAC o jefe inmediato).
 * @param {Object} user - usuario a evaluar
 * @returns {boolean} true si puede ver todos los tickets
 */
export function canViewAllTickets(user) { return isSAC(user) || isJefe(user); }

/**
 * Determina si el usuario es administrador de plataforma (multitenant, cruza todas las empresas).
 * @param {Object} user - usuario a evaluar
 * @returns {boolean} true si el usuario es administrador de plataforma
 */
export function isPlatformAdmin(user) { return user?.isPlatformAdmin === true; }
/**
 * Determina si el usuario puede administrar empresas (administrador de plataforma o SAC).
 * @param {Object} user - usuario a evaluar
 * @returns {boolean} true si puede administrar empresas
 */
export function canManageCompanies(user) { return isPlatformAdmin(user) || isSAC(user); }

/**
 * Determina si el usuario pertenece a más de una empresa (multitenant).
 * @param {Object} user - usuario a evaluar
 * @returns {boolean} true si el usuario tiene más de una membresía de empresa
 */
export function hasMultipleCompanies(user) {
  return Array.isArray(user?.memberships) && user.memberships.length > 1;
}

