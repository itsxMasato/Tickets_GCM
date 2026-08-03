/* Documentado por: Miguel Flores */
'use strict'

const { EntitySchema } = require('typeorm');
const { ROLE_VALUES } = require('../enums');
const { bitBoolean } = require('../transformers');

// Entidad ORM: tabla `users`. Representa a los usuarios del sistema. Campos principales:
// username/password_hash para login local, full_name, email opcional, avatar_url, role/area
// (rol y área operativa), is_platform_admin (flag de administrador de plataforma multitenant),
// is_bootstrap (cuenta de arranque autoeliminable, ver auth.service.js#transferBootstrapAdminIfNeeded)
// y active (borrado lógico).
module.exports = new EntitySchema({
  name: 'User',
  tableName: 'users',
  columns: {
    id:                { primary: true, type: 'integer', generated: 'increment' },
    username:          { type: 'varchar', length: 255, unique: true, nullable: false },
    password_hash:     { type: 'varchar', length: 255, nullable: false },
    full_name:         { type: 'varchar', length: 255, nullable: false },
    email:             { type: 'varchar', length: 255, nullable: true },
    avatar_url:        { type: 'varchar', length: 500, nullable: true },
    role:              { type: 'simple-enum', enum: ROLE_VALUES, nullable: false },
    area:              { type: 'varchar', length: 30, nullable: true },
    is_platform_admin: { type: 'integer', default: 0, nullable: false, transformer: bitBoolean() },
    is_bootstrap:      { type: 'integer', default: 0, nullable: false, transformer: bitBoolean() },
    active:            { type: 'integer', default: 1, nullable: false, transformer: bitBoolean() },
    created_at:        { type: 'datetime', default: require('../timestamp-default').timestampDefault, nullable: false },
  },
});

