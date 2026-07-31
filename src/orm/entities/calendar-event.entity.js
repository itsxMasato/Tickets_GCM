/* Documentado por: Miguel Flores */
'use strict'

const { EntitySchema } = require('typeorm');
const { CALENDAR_EVENT_TYPE_VALUES } = require('../enums');

// Entidad ORM: tabla `calendar_events`. Eventos del calendario de un usuario: personales
// o vinculados a un ticket (type), con rango start_at/end_at, color de UI y notas.
module.exports = new EntitySchema({
  name: 'CalendarEvent',
  tableName: 'calendar_events',
  columns: {
    id:         { primary: true, type: 'integer', generated: 'increment' },
    user_id:    { type: 'integer', nullable: false },
    company_id: { type: 'integer', nullable: true },
    ticket_id:  { type: 'integer', nullable: true },
    title:      { type: 'varchar', length: 200, nullable: false },
    notes:      { type: 'text', nullable: true },
    start_at:   { type: 'datetime', nullable: false },
    end_at:     { type: 'datetime', nullable: false },
    color:      { type: 'varchar', length: 20, nullable: true },
    type:       { type: 'simple-enum', enum: CALENDAR_EVENT_TYPE_VALUES, default: 'personal', nullable: false },
    created_at: { type: 'datetime', default: require('../timestamp-default').timestampDefault, nullable: false },
    updated_at: { type: 'datetime', default: require('../timestamp-default').timestampDefault, nullable: false },
  },
});

