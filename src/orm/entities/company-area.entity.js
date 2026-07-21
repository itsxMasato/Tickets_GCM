/* Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. */
'use strict';

const { EntitySchema } = require('typeorm');
const { bitBoolean } = require('../transformers');

/**
 * company_areas — áreas operativas definidas por empresa.
 *
 *   id          INT IDENTITY(1,1) PRIMARY KEY
 *   company_id  INT NOT NULL                  → companies(id) ON DELETE CASCADE
 *   key         NVARCHAR(50) NOT NULL         -- 'operaciones', 'cocina', 'camaras' (slug, no se renombra)
 *   label       NVARCHAR(100) NOT NULL        -- 'Operaciones', 'Cocina', 'Cámaras' (humano, traducible)
 *   active      BIT NOT NULL DEFAULT 1
 *   sort_order  INT NOT NULL DEFAULT 0        -- posición en dropdowns
 *   CONSTRAINT UQ_company_area UNIQUE (company_id, key)
 *
 * Reemplaza el enum global de 5 áreas (`operaciones`, `logistica`,
 * `mantenimiento`, `sistemas`, `otro`) que vivía en `users.area` y
 * `tickets.area`. Ahora cada empresa puede definir las áreas que
 * necesite: una camaronera puede tener `cocina`, `camaras`, `limpieza`;
 * una constructora puede tener `obra`, `logistica`, `administracion`.
 *
 * Al crear una empresa nueva, el seed siembra las 5 áreas default para
 * mantener compatibilidad. Se pueden desactivar y agregar custom.
 *
 * El `key` es la FK lógica que va en `tickets.area_key` y
 * `user_company_memberships.area_key`. Es estable (no se renombra
 * tras creación); si se renombra, hay que migrar los datos. `label`
 * sí es traducible y se puede editar.
 */
module.exports = new EntitySchema({
  name: 'CompanyArea',
  tableName: 'company_areas',
  columns: {
    id:         { primary: true, type: 'integer', generated: 'increment' },
    company_id: { type: 'integer', nullable: false },
    key:        { type: 'varchar', length: 50, nullable: false },
    label:      { type: 'varchar', length: 100, nullable: false },
    active:     { type: 'integer', default: 1, nullable: false, transformer: bitBoolean() },
    sort_order: { type: 'integer', default: 0, nullable: false },
  },
  indices: [
    { name: 'UQ_company_area', unique: true, columns: ['company_id', 'key'] },
  ],
});
