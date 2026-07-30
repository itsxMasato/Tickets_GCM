/* Documentado por: Miguel Flores */
'use strict'

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
  Company: require('./company.entity'),
  UserCompanyMembership:   require('./user-company-membership.entity'),
  RolePermission:          require('./role-permission.entity'),
};

