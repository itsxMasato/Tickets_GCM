/* Documentado por: Miguel Flores */
'use strict'

require('reflect-metadata');

// Punto de entrada de la capa ORM (TypeORM/SQL Server): reexporta el DataSource, las
// utilidades de repositorio, todas las entidades y los enums compartidos, para que el
// resto de la app importe todo desde `src/orm` en vez de conocer la estructura interna.

const datasource = require('./datasource');
const Entities = require('./entities');
const factory = require('./repositories/repository-factory');

const {
  RoleEnum, ROLE_VALUES,
  TicketStatusEnum, TICKET_STATUS_VALUES,
  TicketPriorityEnum, TICKET_PRIORITY_VALUES,
  NotificationTypeEnum, NOTIFICATION_TYPE_VALUES,
} = require('./enums');

module.exports = {
  AppDataSource: datasource.AppDataSource,
  getDataSource:     datasource.getDataSource,
  initORM:           datasource.initORM,
  closeORM:          datasource.closeORM,

  getRepository: factory.getRepository,
  getRepositorySync: factory.getRepositorySync,

  User: Entities.User,
  Category:                Entities.Category,
  Ticket:                  Entities.Ticket,
  TicketAssignment:        Entities.TicketAssignment,
  TicketComment:           Entities.TicketComment,
  Attachment:              Entities.Attachment,
  Notification:            Entities.Notification,
  AuditLog:                Entities.AuditLog,
  CalendarEvent:           Entities.CalendarEvent,
  Company: Entities.Company,
  UserCompanyMembership:   Entities.UserCompanyMembership,
  RolePermission:          Entities.RolePermission,
  RoleLabel:               Entities.RoleLabel,

  RoleEnum, ROLE_VALUES,
  TicketStatusEnum, TICKET_STATUS_VALUES,
  TicketPriorityEnum, TICKET_PRIORITY_VALUES,
  NotificationTypeEnum, NOTIFICATION_TYPE_VALUES,
};

