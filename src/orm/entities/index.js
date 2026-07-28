/* Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. */
'use strict';

/**
 * Reexporta las EntitySchema como clases para que el resto de la capa ORM
 * las importe con destructuring.
 *
 * TypeORM 1.0 acepta tanto `new EntitySchema({...})` directamente como el
 * resultado expuesto como `EntitySchema target`. Acá exportamos la instancia
 * que devuelve `new EntitySchema(...)` (no una clase) — es la forma canónica
 * para CommonJS sin decoradores.
 */

module.exports = {
  User:                    require('./user.entity'),
  Category:                require('./category.entity'),
  Ticket:                  require('./ticket.entity'),
  TicketAssignment:        require('./ticket-assignment.entity'),
  TicketComment:           require('./ticket-comment.entity'),
  Attachment:              require('./attachment.entity'),
  Notification:            require('./notification.entity'),
  AuditLog:                require('./audit-log.entity'),
  CalendarEvent:           require('./calendar-event.entity'),
  // Multi-tenant (Fase 1)
  Company:                 require('./company.entity'),
  UserCompanyMembership:   require('./user-company-membership.entity'),
  RolePermission:          require('./role-permission.entity'),
};
