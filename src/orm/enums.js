/* Documentado por: Miguel Flores */
'use strict'

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

const CalendarEventTypeEnum = Object.freeze({
  PERSONAL:     'personal',
  TICKET_LINKED: 'ticket_linked',
});
const CALENDAR_EVENT_TYPE_VALUES = Object.freeze(Object.values(CalendarEventTypeEnum));

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

