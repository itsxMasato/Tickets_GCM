/* Documentado por: Miguel Flores */
'use strict'

// Enums compartidos por la capa ORM (TypeORM/SQL Server): valores válidos para roles,
// estados y prioridad de tickets, tipos de notificación y de evento de calendario, más
// sus respectivos arrays de valores (*_VALUES) para usar en validaciones y columnas enum.

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

// Ubicación física actual del ticket, independiente de `status`: un ticket
// puede seguir "en_proceso" mientras está afuera, en un proveedor externo.
const TicketLocationTypeEnum = Object.freeze({
  TALLER:    'taller',
  PROVEEDOR: 'proveedor',
});
const TICKET_LOCATION_TYPE_VALUES = Object.freeze(Object.values(TicketLocationTypeEnum));

const TicketLocationReasonEnum = Object.freeze({
  GARANTIA:           'garantia',
  REPARACION_EXTERNA: 'reparacion_externa',
  COMPRA_REPUESTO:    'compra_repuesto',
  OTRO:               'otro',
});
const TICKET_LOCATION_REASON_VALUES = Object.freeze(Object.values(TicketLocationReasonEnum));

const NotificationTypeEnum = Object.freeze({
  TICKET_CREATED:            'ticket_created',
  TICKET_ASSIGNED:           'ticket_assigned',
  TICKET_COMMENTED:          'ticket_commented',
  TICKET_STATUS_CHANGED:     'ticket_status_changed',
  TICKET_CLOSED:             'ticket_closed',
  TICKET_REOPENED:           'ticket_reopened',
  TICKET_TRANSFERRED:        'ticket_transferred',
  TICKET_SENT_TO_PROVIDER:   'ticket_sent_to_provider',
  TICKET_RETURNED_TO_SHOP:   'ticket_returned_to_shop',
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
  TicketLocationTypeEnum,
  TICKET_LOCATION_TYPE_VALUES,
  TicketLocationReasonEnum,
  TICKET_LOCATION_REASON_VALUES,
  NotificationTypeEnum,
  NOTIFICATION_TYPE_VALUES,
  CalendarEventTypeEnum,
  CALENDAR_EVENT_TYPE_VALUES,
  CALENDAR_EVENT_COLORS,
};

