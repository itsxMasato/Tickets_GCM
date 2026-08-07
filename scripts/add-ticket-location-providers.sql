-- ============================================================================
-- Incremental: trazabilidad de ubicación de tickets (proveedores externos)
-- ============================================================================
--
-- QUÉ ES ESTE ARCHIVO
-- ALTER/CREATE incrementales para aplicar sobre una base GCM_Tickets_DB que
-- YA EXISTE (con datos), a diferencia de `src/db/schema.mssql.sql` que asume
-- una base vacía. Este script deja la base al día con los cambios que se
-- hicieron en `schema.mssql.sql` en esta sesión: tabla `providers` nueva y
-- columnas de ubicación en `tickets`.
--
-- CÓMO EJECUTARLO
-- Abrir en SSMS, conectado a GCM_Tickets_DB, y ejecutar de punta a punta
-- (F5). Es seguro re-ejecutarlo si algún batch falla a mitad de camino,
-- salvo por el CREATE TABLE / ADD COLUMN, que fallarán si ya se aplicaron
-- (es esperable, indica que ese paso ya corrió).
--
-- DESPUÉS DE CORRERLO: `pnpm run orm:smoke` debe listar `providers` con
-- count 0 y no debe fallar el SELECT sobre `tickets`.
-- ============================================================================

USE GCM_Tickets_DB;
GO

-- ────────────────────────────────────────────────────────────────────────
-- providers — catálogo de proveedores externos (ej. AQ)
-- ────────────────────────────────────────────────────────────────────────
CREATE TABLE dbo.providers (
  id          INT IDENTITY(1,1) NOT NULL,
  company_id  INT             NULL,
  name        NVARCHAR(255)   NOT NULL,
  active      BIT             NOT NULL CONSTRAINT DF_providers_active DEFAULT (1),
  created_at  DATETIME2       NOT NULL CONSTRAINT DF_providers_created_at DEFAULT (SYSUTCDATETIME()),
  CONSTRAINT PK_providers PRIMARY KEY CLUSTERED (id),
  CONSTRAINT UQ_providers_company_name UNIQUE (company_id, name),
  CONSTRAINT FK_providers_company FOREIGN KEY (company_id)
    REFERENCES dbo.companies(id) ON DELETE NO ACTION
);
GO

-- ────────────────────────────────────────────────────────────────────────
-- tickets — columnas de ubicación física (independiente de `status`)
-- ────────────────────────────────────────────────────────────────────────
ALTER TABLE dbo.tickets ADD
  location_type         NVARCHAR(20)  NOT NULL CONSTRAINT DF_tickets_location_type DEFAULT ('taller') WITH VALUES,
  location_provider_id  INT           NULL,
  location_reason        NVARCHAR(20) NULL,
  location_changed_at   DATETIME2     NULL,
  location_changed_by   INT           NULL;
GO

ALTER TABLE dbo.tickets ADD CONSTRAINT CK_tickets_location_type
  CHECK (location_type IN ('taller','proveedor'));
GO
ALTER TABLE dbo.tickets ADD CONSTRAINT CK_tickets_location_reason
  CHECK (location_reason IN ('garantia','reparacion_externa','compra_repuesto','otro'));
GO
ALTER TABLE dbo.tickets ADD CONSTRAINT CK_tickets_location_consistency
  CHECK (
    (location_type = 'taller'    AND location_provider_id IS NULL     AND location_reason IS NULL)
    OR
    (location_type = 'proveedor' AND location_provider_id IS NOT NULL AND location_reason IS NOT NULL)
  );
GO
ALTER TABLE dbo.tickets ADD CONSTRAINT FK_tickets_location_provider
  FOREIGN KEY (location_provider_id) REFERENCES dbo.providers(id) ON DELETE NO ACTION;
GO
ALTER TABLE dbo.tickets ADD CONSTRAINT FK_tickets_location_changed_by
  FOREIGN KEY (location_changed_by) REFERENCES dbo.users(id) ON DELETE NO ACTION;
GO

CREATE INDEX IX_tickets_location_type ON dbo.tickets(location_type);
GO
CREATE INDEX IX_tickets_company_location ON dbo.tickets(company_id, location_type);
GO

-- ────────────────────────────────────────────────────────────────────────
-- notifications — habilitar los 2 tipos nuevos (ticket_sent_to_provider,
-- ticket_returned_to_shop) en el CHECK existente. SQL Server no permite
-- alterar un CHECK in place: hay que borrarlo y volver a crearlo.
-- ────────────────────────────────────────────────────────────────────────
ALTER TABLE dbo.notifications DROP CONSTRAINT CK_notifications_type;
GO
ALTER TABLE dbo.notifications ADD CONSTRAINT CK_notifications_type CHECK (type IN (
  'ticket_created','ticket_assigned','ticket_commented','ticket_status_changed',
  'ticket_closed','ticket_reopened','ticket_transferred',
  'ticket_sent_to_provider','ticket_returned_to_shop'
));
GO
