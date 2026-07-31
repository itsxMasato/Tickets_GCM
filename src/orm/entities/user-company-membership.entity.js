/* Documentado por: Miguel Flores */
'use strict'

const { EntitySchema } = require('typeorm');
const { ROLE_VALUES } = require('../enums');
const { bitBoolean } = require('../transformers');

// Entidad ORM: tabla `user_company_memberships`. Relación N:M entre usuarios y empresas
// en el esquema multitenant: a qué empresa pertenece un usuario, con qué rol (role),
// si está activa, si es la empresa por defecto (is_default) y last_seen_at. Único por
// (user_id, company_id).
module.exports = new EntitySchema({
  name: 'UserCompanyMembership',
  tableName: 'user_company_memberships',
  columns: {
    id:           { primary: true, type: 'integer', generated: 'increment' },
    user_id:      { type: 'integer', nullable: false },
    company_id:   { type: 'integer', nullable: false },
    role:         { type: 'simple-enum', enum: ROLE_VALUES, nullable: false },
    active:       { type: 'integer', default: 1, nullable: false, transformer: bitBoolean() },
    is_default:   { type: 'integer', default: 0, nullable: false, transformer: bitBoolean() },
    created_at:   { type: 'datetime', default: require('../timestamp-default').timestampDefault, nullable: false },
    last_seen_at: { type: 'datetime', nullable: true },
  },
  indices: [
    { name: 'UQ_user_company', unique: true, columns: ['user_id', 'company_id'] },
    { name: 'IX_company_user', columns: ['company_id', 'user_id'] },
  ],
});

