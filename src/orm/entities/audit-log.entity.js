/* Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. */
'use strict';

const { EntitySchema } = require('typeorm');

/**
 * audit_log — bitácora de operaciones sensibles.
 *
 *   id           INT IDENTITY(1,1) PRIMARY KEY
 *   user_id      INT NULL                   → users(id) ON DELETE SET NULL  (¡SET NULL, no CASCADE!)
 *   company_id   INT NULL                   → companies(id) ON DELETE RESTRICT
 *   action_type  NVARCHAR(50) NOT NULL      -- libre: 'ticket_created', 'user_modified', etc.
 *   target_type  NVARCHAR(50) NOT NULL      -- libre: 'ticket', 'user', 'category'
 *   target_id    INT NULL
 *   target_code  NVARCHAR(50) NULL          -- p.ej. código del ticket para referencia rápida
 *   description  NVARCHAR(MAX) NULL
 *   old_value    NVARCHAR(MAX) NULL         -- JSON string (sin transformer en esta capa)
 *   new_value    NVARCHAR(MAX) NULL         -- JSON string
 *   ip_address   NVARCHAR(45) NULL          -- IPv4 o IPv6
 *   created_at   DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
 *
 * Multi-tenant (Fase 1):
 *   - `company_id` se denormaliza para reportes cross-tenant sin JOIN.
 *     Cuando el evento es tenant-scoped (ticket, user, category), se rellena
 *     desde el contexto. Cuando es plataforma (login, switch-company), se
 *     deja NULL y se filtra por user_id en su lugar.
 *
 * Particularidad: en src/db/schema.sql, esta es la única FK a users con ON DELETE
 * SET NULL (no CASCADE como el resto). La idea: aunque se borre un usuario, el
 * registro de auditoría persiste.
 *
 * `old_value` y `new_value` se almacenan como JSON-string y el servicio
 * audit.service.js los parsea a objeto en la lectura. Esta capa los deja como
 * string; cuando un consumidor migre al ORM y quiera objetos, agrega un
 * transformer o usa parse en el servicio.
 */
module.exports = new EntitySchema({
  name: 'AuditLog',
  tableName: 'audit_log',
  columns: {
    id:          { primary: true, type: 'integer', generated: 'increment' },
    user_id:     { type: 'integer', nullable: true },
    company_id:  { type: 'integer', nullable: true },
    action_type: { type: 'varchar', length: 50, nullable: false },
    target_type: { type: 'varchar', length: 50, nullable: false },
    target_id:   { type: 'integer', nullable: true },
    target_code: { type: 'varchar', length: 50, nullable: true },
    description: { type: 'text', nullable: true },
    old_value:   { type: 'text', nullable: true },
    new_value:   { type: 'text', nullable: true },
    ip_address:  { type: 'varchar', length: 45, nullable: true },
    created_at:  { type: 'datetime', default: require('../timestamp-default').timestampDefault, nullable: false },
  },
});
