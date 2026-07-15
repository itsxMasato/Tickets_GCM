'use strict';

require('reflect-metadata');

/**
 * Punto de entrada único de la capa TypeORM.
 *
 * Convenciones de uso:
 *
 *   const orm = require('./orm');
 *   await orm.initORM();           // opcional: abrir la conexión explícitamente
 *   const users = await orm.getRepository(orm.User);
 *   const all    = await users.find();
 *   await orm.closeORM();           // al cerrar el proceso
 *
 * Importante: `initORM()` no se llama en `src/server.js`. El proceso sigue
 * booteando aunque SQL Server esté caído. La conexión se abre perezosa, en
 * la primera llamada a `getRepository(...)` o `initORM()`.
 */

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
  // Lifecycle
  AppDataSource:     datasource.AppDataSource,
  getDataSource:     datasource.getDataSource,
  initORM:           datasource.initORM,
  closeORM:          datasource.closeORM,

  // Repositorios
  getRepository:     factory.getRepository,
  getRepositorySync: factory.getRepositorySync,

  // Entidades
  User:              Entities.User,
  Category:          Entities.Category,
  Ticket:            Entities.Ticket,
  TicketAssignment:  Entities.TicketAssignment,
  TicketComment:     Entities.TicketComment,
  Attachment:        Entities.Attachment,
  Notification:      Entities.Notification,
  AuditLog:          Entities.AuditLog,

  // Enums
  RoleEnum, ROLE_VALUES,
  TicketStatusEnum, TICKET_STATUS_VALUES,
  TicketPriorityEnum, TICKET_PRIORITY_VALUES,
  NotificationTypeEnum, NOTIFICATION_TYPE_VALUES,
};
