/* Documentado por: Miguel Flores */
'use strict'

require('reflect-metadata');

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

  RoleEnum, ROLE_VALUES,
  TicketStatusEnum, TICKET_STATUS_VALUES,
  TicketPriorityEnum, TICKET_PRIORITY_VALUES,
  NotificationTypeEnum, NOTIFICATION_TYPE_VALUES,
};

