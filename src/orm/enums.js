/* Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. */
'use strict';

/**
 * Enums de la capa TypeORM.
 *
 * Reflejan los CHECK constraints de src/db/schema.sql:
 *   - users.role            → 4 valores
 *   - tickets.status        → 6 valores
 *   - tickets.priority      → 4 valores
 *   - notifications.type    → 8 valores
 *
 * Importante:
 *   Los servicios actuales (auth.service.js, tickets.service.js, etc.) siguen
 *   usando sus propias constantes de string en src/utils/validators.js y
 *   servicios. Mientras convivan ambas definiciones, hay que mantenerlas en
 *   sync. Cuando un servicio migre al ORM, se reemplaza la constante local
 *   por la referencia a este archivo.
 *
 *   audit_log.action_type y audit_log.target_type NO son CHECK en el schema
 *   (son strings libres), por eso no tienen enum acá.
 */

const RoleEnum = Object.freeze({
  SUPERVISOR_CAMPO: 'supervisor_campo',
  SAC:              'sac',
  ADMIN_AREA:       'admin_area',
  JEFE_INMEDIATO:   'jefe_inmediato',
});
const ROLE_VALUES = Object.freeze(Object.values(RoleEnum));

const TicketStatusEnum = Object.freeze({
  RECIBIDO:    'recibido',
  ASIGNADO:    'asignado',
  EN_PROCESO:  'en_proceso',
  SOLUCIONADO: 'solucionado',
  CERRADO:     'cerrado',
  REABIERTO:   'reabierto',
});
const TICKET_STATUS_VALUES = Object.freeze(Object.values(TicketStatusEnum));

const TicketPriorityEnum = Object.freeze({
  BAJA:    'baja',
  MEDIA:   'media',
  ALTA:    'alta',
  URGENTE: 'urgente',
});
const TICKET_PRIORITY_VALUES = Object.freeze(Object.values(TicketPriorityEnum));

const NotificationTypeEnum = Object.freeze({
  TICKET_CREATED:        'ticket_created',
  TICKET_ASSIGNED:       'ticket_assigned',
  TICKET_COMMENTED:      'ticket_commented',
  TICKET_STATUS_CHANGED: 'ticket_status_changed',
  TICKET_CLOSED:         'ticket_closed',
  TICKET_REOPENED:       'ticket_reopened',
  TICKET_TRANSFERRED:    'ticket_transferred',
});
const NOTIFICATION_TYPE_VALUES = Object.freeze(Object.values(NotificationTypeEnum));

// 'personal' = bloque libre (sin ticket), 'ticket_linked' = bloque asociado a un ticket.
const CalendarEventTypeEnum = Object.freeze({
  PERSONAL:     'personal',
  TICKET_LINKED: 'ticket_linked',
});
const CALENDAR_EVENT_TYPE_VALUES = Object.freeze(Object.values(CalendarEventTypeEnum));

// Colores permitidos para un CalendarEvent. Coinciden con el set canónico
// del front: 'ocean' (default), 'brand' (navy), 'deep', 'accent' (camarón).
// Si el cliente envía uno fuera de la lista, el servicio lo rechaza.
const CALENDAR_EVENT_COLORS = Object.freeze(['ocean', 'brand', 'deep', 'accent']);

module.exports = {
  RoleEnum,
  ROLE_VALUES,
  TicketStatusEnum,
  TICKET_STATUS_VALUES,
  TicketPriorityEnum,
  TICKET_PRIORITY_VALUES,
  NotificationTypeEnum,
  NOTIFICATION_TYPE_VALUES,
  CalendarEventTypeEnum,
  CALENDAR_EVENT_TYPE_VALUES,
  CALENDAR_EVENT_COLORS,
};
