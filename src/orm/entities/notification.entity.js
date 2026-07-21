/* Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. */
'use strict';

const { EntitySchema } = require('typeorm');
const { NOTIFICATION_TYPE_VALUES } = require('../enums');
const { bitBoolean } = require('../transformers');

/**
 * notifications — inbox por usuario.
 *
 *   id          INT IDENTITY(1,1) PRIMARY KEY
 *   user_id     INT NOT NULL                → users(id) ON DELETE CASCADE
 *   company_id  INT NULL                    → companies(id) ON DELETE RESTRICT
 *   type        VARCHAR(40) NOT NULL        -- simple-enum, 8 valores
 *   ticket_id   INT NULL                    → tickets(id) ON DELETE CASCADE
 *   title       NVARCHAR(255) NOT NULL
 *   body        NVARCHAR(MAX) NULL
 *   read        BIT NOT NULL DEFAULT 0
 *   created_at  DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
 *
 * Multi-tenant (Fase 1):
 *   - `company_id` se denormaliza para reportes cross-tenant sin JOIN
 *     a tickets. En Fase 6 el filtro se aplica en notifications.service.
 *   - Cuando ticket_id IS NULL, company_id se rellena con la membresía
 *     activa del destinatario (no todas las notificaciones tienen ticket).
 */
module.exports = new EntitySchema({
  name: 'Notification',
  tableName: 'notifications',
  columns: {
    id:         { primary: true, type: 'integer', generated: 'increment' },
    user_id:    { type: 'integer', nullable: false },
    company_id: { type: 'integer', nullable: true },
    type:       { type: 'simple-enum', enum: NOTIFICATION_TYPE_VALUES, nullable: false },
    ticket_id:  { type: 'integer', nullable: true },
    title:      { type: 'varchar', length: 255, nullable: false },
    body:       { type: 'text', nullable: true },
    read:       { type: 'integer', default: 0, nullable: false, transformer: bitBoolean() },
    created_at: { type: 'datetime', default: require('../timestamp-default').timestampDefault, nullable: false },
  },
});
