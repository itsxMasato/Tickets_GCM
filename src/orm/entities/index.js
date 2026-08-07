/* Documentado por: Miguel Flores */
'use strict'

// Agrupa y reexporta todas las EntitySchema de la capa ORM (TypeORM/SQL Server),
// para registrarlas en el DataSource y para que otros módulos ORM las importen por nombre.
module.exports = {
  User:                    require('./user.entity'),
  Category:                require('./category.entity'),
  Provider:                require('./provider.entity'),
  Ticket:                  require('./ticket.entity'),
  TicketAssignment:        require('./ticket-assignment.entity'),
  TicketComment:           require('./ticket-comment.entity'),
  Attachment:              require('./attachment.entity'),
  Notification:            require('./notification.entity'),
  AuditLog:                require('./audit-log.entity'),
  CalendarEvent:           require('./calendar-event.entity'),
  Company: require('./company.entity'),
  UserCompanyMembership:   require('./user-company-membership.entity'),
  RolePermission:          require('./role-permission.entity'),
  RoleLabel:               require('./role-label.entity'),
};

