/* Documentado por: Miguel Flores */
'use strict'

const { EntitySchema } = require('typeorm');
const {
  TICKET_STATUS_VALUES, TICKET_PRIORITY_VALUES,
  TICKET_LOCATION_TYPE_VALUES, TICKET_LOCATION_REASON_VALUES,
} = require('../enums');

// Entidad ORM: tabla `tickets`. Es la entidad central del sistema: representa cada incidencia
// reportada. Campos principales: code (identificador visible), title/description, category_id,
// area, status y priority (enums), created_by/assigned_to/closed_by (ids de usuario) y
// timestamps created_at/updated_at/closed_at; company_id la ata a una empresa en multitenant.
module.exports = new EntitySchema({
  name: 'Ticket',
  tableName: 'tickets',
  columns: {
    id:           { primary: true, type: 'integer', generated: 'increment' },
    company_id:   { type: 'integer', nullable: true },
    code:         { type: 'varchar', length: 50, unique: true, nullable: false },
    title:        { type: 'varchar', length: 255, nullable: false },
    description:  { type: 'text', nullable: false },
    category_id:  { type: 'integer', nullable: true },
    area:         { type: 'varchar', length: 100, nullable: true },
    status:       { type: 'simple-enum', enum: TICKET_STATUS_VALUES, default: 'recibido', nullable: false },
    priority:     { type: 'simple-enum', enum: TICKET_PRIORITY_VALUES, default: 'media', nullable: false },
    created_by:   { type: 'integer', nullable: false },
    assigned_to:  { type: 'integer', nullable: true },
    closed_by:    { type: 'integer', nullable: true },
    location_type:         { type: 'simple-enum', enum: TICKET_LOCATION_TYPE_VALUES, default: 'taller', nullable: false },
    location_provider_id:  { type: 'integer', nullable: true },
    location_reason:       { type: 'simple-enum', enum: TICKET_LOCATION_REASON_VALUES, nullable: true },
    location_changed_at:   { type: 'datetime', nullable: true },
    location_changed_by:   { type: 'integer', nullable: true },
    created_at:   { type: 'datetime', default: require('../timestamp-default').timestampDefault, nullable: false },
    updated_at:   { type: 'datetime', default: require('../timestamp-default').timestampDefault, nullable: false },
    closed_at:    { type: 'datetime', nullable: true },
  },
});

