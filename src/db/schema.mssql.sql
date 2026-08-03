/* Documentado por: Miguel Flores */
-- ============================================================================
-- Sistema de Tickets GCM — esquema de destino para Microsoft SQL Server
-- ============================================================================
--
-- QUÉ ES ESTE ARCHIVO
-- Es el T-SQL completo y listo para ejecutar contra una base SQL Server vacía,
-- pensado para el día en que el sistema deje de correr sobre Firestore y pase
-- a la base de datos de la empresa. No reemplaza a `schema.sql` (ese sigue
-- siendo el esquema SQLite de referencia/legado); este es su equivalente
-- para SQL Server, ampliado con todo lo que el modelo de datos ganó desde
-- que `schema.sql` se escribió (multiempresa, plataforma admin, etc.).
--
-- Refleja el modelo de datos TAL COMO FUNCIONA HOY la aplicación (verificado
-- contra `src/firestoreData.js` y los servicios en `src/services/`), no el
-- modelo aspiracional de algunos documentos de planeación. Dos ejemplos
-- concretos de esa diferencia:
--   • `users` conserva `role` y `area` directamente (el modelo "el rol vive
--     en la membresía, no en el usuario" descrito en MULTITENANT.md §4.2
--     todavía no se implementó en el código). `user_company_memberships` ya
--     tiene su propia columna `role` (lista para ese futuro corte), pero
--     todavía no tiene un equivalente a `area` — cuando se implemente el
--     corte, hay que agregarla ahí y retirarla de `users`.
--   • No existe tabla `company_areas`: se documentó como entidad planeada
--     pero nunca se conectó a ningún código real; no se incluye acá para no
--     inventar una tabla que la aplicación no usa.
--
-- BASE DE DATOS: GCM_Tickets_DB
--
-- CÓMO EJECUTARLO
--   sqlcmd -S <servidor> -d GCM_Tickets_DB -i schema.mssql.sql
-- o pegarlo en SQL Server Management Studio / Azure Data Studio. El script
-- crea la base GCM_Tickets_DB si no existe (bloque de abajo) y luego crea
-- las tablas dentro de ella. Es idempotente workaround-free: está pensado
-- para correr UNA vez sobre una base nueva, no repetidamente sobre una con
-- datos.
--
-- DECISIONES DE DISEÑO QUE UN DBA REVISOR DEBE CONOCER
--
-- 1) Tipos de columna booleana: BIT, no INT.
--    Las entidades TypeORM (`src/orm/entities/*.js`) declaran estas columnas
--    como `type: 'integer'` con un transformer que redondea a 0/1, porque el
--    driver SQLite de fallback (`DISABLE_MSSQL=true`) hidrata mal el tipo
--    `boolean`. Eso es una limitación del fallback de desarrollo, no del
--    diseño real. Este archivo usa el tipo correcto para SQL Server: BIT.
--    Esto cierra la decisión pendiente documentada en MULTITENANT.md §9.1 /
--    §Fase 10 (opción 1 de las tres: "aceptar que MSSQL real usa BIT, el
--    driver ORM se ajusta aparte si hace falta").
--
-- 2) `username_lower` / `email_lower` de Firestore no existen acá.
--    En Firestore no hay búsquedas case-insensitive nativas, así que el
--    código mantiene una copia en minúsculas de `username`/`email` para
--    poder buscarlas (ver `firestoreData.js`). SQL Server no necesita eso:
--    la collation por defecto de la instancia (típicamente
--    SQL_Latin1_General_CP1_CI_AS) ya compara e indexa como
--    case-insensitive, así que un UNIQUE simple sobre `username`/`email`
--    alcanza. Si el DBA instala la base con una collation case-sensitive,
--    hay que agregarlas como columnas calculadas — avisar en ese caso.
--
-- 3) Política de borrado en cascada (ON DELETE).
--    - Ninguna referencia hacia `users` es CASCADE. Los usuarios se
--      desactivan (`active = 0`), nunca se borran; forzar el borrado de un
--      usuario referenciado por tickets/comentarios/etc. debe fallar
--      (comportamiento NO ACTION por defecto), no arrastrar datos.
--    - Ninguna referencia hacia `companies` es CASCADE, por la misma razón
--      (las empresas se desactivan vía `softDeleteCompany`, no se borran).
--    - Los hijos directos de un ticket (`ticket_assignments`,
--      `ticket_comments`, `attachments`, `notifications.ticket_id`) sí
--      cascadean desde `tickets`, porque si algún día se borra un ticket no
--      tiene sentido dejar huérfanos sus comentarios/adjuntos.
--    - `calendar_events.ticket_id` usa SET NULL, no CASCADE: un evento de
--      calendario debe sobrevivir aunque su ticket vinculado desaparezca.
--    - `ticket_comments.attachment_id` y `attachments.comment_id` se
--      referencian mutuamente (un comentario puede tener un adjunto "propio"
--      y un adjunto puede apuntar al comentario donde se subió). Ambas FK
--      usan NO ACTION: si las dos cascadearan, SQL Server rechaza la
--      creación con el error 1785 ("may cause cycles or multiple cascade
--      paths"), porque un ticket borrado alcanzaría `attachments` por dos
--      caminos distintos (directo, y vía `ticket_comments`). En la práctica
--      esto no pierde integridad: hoy la aplicación nunca borra tickets.
--
-- 4) Las colecciones `metadata`, `audit_action_types` y `audit_active_users`
--    de Firestore NO tienen tabla equivalente acá a propósito. Son
--    parches específicos de Firestore:
--    - `metadata/counters` reemplaza el autoincremento nativo, que SQL
--      Server sí tiene (IDENTITY) — no hace falta.
--    - `audit_action_types` / `audit_active_users` son listas denormalizadas
--      para poblar filtros rápido sin poder hacer SELECT DISTINCT barato en
--      Firestore. En SQL Server, `SELECT DISTINCT action_type FROM
--      audit_log` (con el índice de abajo) es una consulta trivial — no
--      hace falta mantener una tabla aparte.
--
-- ORDEN DE CREACIÓN: respeta las dependencias de FK. `ticket_comments` y
-- `attachments` se resuelven con un ALTER TABLE al final por la referencia
-- cruzada explicada en el punto 3.
-- ============================================================================

IF NOT EXISTS (SELECT 1 FROM sys.databases WHERE name = N'GCM_Tickets_DB')
BEGIN
  CREATE DATABASE GCM_Tickets_DB;
END
GO

USE GCM_Tickets_DB;
GO

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

-- ────────────────────────────────────────────────────────────────────────
-- users
-- ────────────────────────────────────────────────────────────────────────
CREATE TABLE dbo.users (
  id                  INT IDENTITY(1,1) NOT NULL,
  username            NVARCHAR(255)   NOT NULL,
  password_hash       NVARCHAR(255)   NOT NULL,
  full_name           NVARCHAR(255)   NOT NULL,
  email               NVARCHAR(255)   NULL,
  avatar_url          NVARCHAR(500)   NULL,
  role                NVARCHAR(30)    NOT NULL,
  area                NVARCHAR(30)    NULL,
  is_platform_admin   BIT             NOT NULL CONSTRAINT DF_users_is_platform_admin DEFAULT (0),
  -- is_bootstrap: marca la cuenta de arranque inicial que se crea sola cuando
  -- la base está vacía y se autoelimina en cuanto alguien crea el primer
  -- usuario real con rol 'sac'. Ver auth.service.js#transferBootstrapAdminIfNeeded.
  is_bootstrap        BIT             NOT NULL CONSTRAINT DF_users_is_bootstrap DEFAULT (0),
  active              BIT             NOT NULL CONSTRAINT DF_users_active DEFAULT (1),
  created_at          DATETIME2       NOT NULL CONSTRAINT DF_users_created_at DEFAULT (SYSUTCDATETIME()),
  CONSTRAINT PK_users PRIMARY KEY CLUSTERED (id),
  CONSTRAINT UQ_users_username UNIQUE (username),
  CONSTRAINT CK_users_role CHECK (role IN ('supervisor_campo','sac','admin_area','jefe_inmediato')),
  CONSTRAINT CK_users_area CHECK (area IS NULL OR area IN ('operaciones','logistica','mantenimiento','sistemas','otro'))
);
GO
-- email es NULL-able (no todos los usuarios tienen uno); un UNIQUE CONSTRAINT normal en SQL
-- Server trata múltiples NULL como valores duplicados (a diferencia de Postgres), lo que
-- rompería con más de un usuario sin email. Un índice único filtrado ignora los NULL.
CREATE UNIQUE INDEX UQ_users_email ON dbo.users(email) WHERE email IS NOT NULL;
GO

-- ────────────────────────────────────────────────────────────────────────
-- companies — empresas del grupo (modelo multiempresa)
-- ────────────────────────────────────────────────────────────────────────
CREATE TABLE dbo.companies (
  id                    INT IDENTITY(1,1) NOT NULL,
  name                  NVARCHAR(200)   NOT NULL,
  slug                  NVARCHAR(50)    NOT NULL,
  logo_url              NVARCHAR(500)   NULL,
  color                 NVARCHAR(20)    NULL,
  -- code_prefix: prefijo usado para generar el código visible de los tickets
  -- de esta empresa (p. ej. "ZZCC-" → ZZCC-00038). Único cuando se define.
  code_prefix           NVARCHAR(6)     NULL,
  location              NVARCHAR(200)   NULL,
  responsible_user_id   INT             NULL,
  active                BIT             NOT NULL CONSTRAINT DF_companies_active DEFAULT (1),
  is_default            BIT             NOT NULL CONSTRAINT DF_companies_is_default DEFAULT (0),
  created_at            DATETIME2       NOT NULL CONSTRAINT DF_companies_created_at DEFAULT (SYSUTCDATETIME()),
  updated_at            DATETIME2       NOT NULL CONSTRAINT DF_companies_updated_at DEFAULT (SYSUTCDATETIME()),
  CONSTRAINT PK_companies PRIMARY KEY CLUSTERED (id),
  CONSTRAINT UQ_companies_slug UNIQUE (slug),
  CONSTRAINT FK_companies_responsible_user FOREIGN KEY (responsible_user_id)
    REFERENCES dbo.users(id) ON DELETE NO ACTION
);
GO
-- code_prefix es NULL-able (no todas las empresas generan código de ticket con prefijo);
-- mismo motivo que UQ_users_email arriba: índice único filtrado en vez de UNIQUE CONSTRAINT.
CREATE UNIQUE INDEX UQ_companies_code_prefix ON dbo.companies(code_prefix) WHERE code_prefix IS NOT NULL;
GO

-- ────────────────────────────────────────────────────────────────────────
-- categories
-- ────────────────────────────────────────────────────────────────────────
CREATE TABLE dbo.categories (
  id          INT IDENTITY(1,1) NOT NULL,
  company_id  INT             NULL,
  name        NVARCHAR(255)   NOT NULL,
  active      BIT             NOT NULL CONSTRAINT DF_categories_active DEFAULT (1),
  created_at  DATETIME2       NOT NULL CONSTRAINT DF_categories_created_at DEFAULT (SYSUTCDATETIME()),
  CONSTRAINT PK_categories PRIMARY KEY CLUSTERED (id),
  CONSTRAINT UQ_categories_company_name UNIQUE (company_id, name),
  CONSTRAINT FK_categories_company FOREIGN KEY (company_id)
    REFERENCES dbo.companies(id) ON DELETE NO ACTION
);
GO

-- ────────────────────────────────────────────────────────────────────────
-- user_company_memberships — a qué empresas pertenece cada usuario y con
-- qué rol en cada una (tabla central del modelo multiempresa)
-- ────────────────────────────────────────────────────────────────────────
CREATE TABLE dbo.user_company_memberships (
  id            INT IDENTITY(1,1) NOT NULL,
  user_id       INT             NOT NULL,
  company_id    INT             NOT NULL,
  role          NVARCHAR(30)    NOT NULL,
  active        BIT             NOT NULL CONSTRAINT DF_ucm_active DEFAULT (1),
  is_default    BIT             NOT NULL CONSTRAINT DF_ucm_is_default DEFAULT (0),
  created_at    DATETIME2       NOT NULL CONSTRAINT DF_ucm_created_at DEFAULT (SYSUTCDATETIME()),
  last_seen_at  DATETIME2       NULL,
  CONSTRAINT PK_user_company_memberships PRIMARY KEY CLUSTERED (id),
  CONSTRAINT UQ_ucm_user_company UNIQUE (user_id, company_id),
  CONSTRAINT CK_ucm_role CHECK (role IN ('supervisor_campo','sac','admin_area','jefe_inmediato')),
  CONSTRAINT FK_ucm_user FOREIGN KEY (user_id) REFERENCES dbo.users(id) ON DELETE NO ACTION,
  CONSTRAINT FK_ucm_company FOREIGN KEY (company_id) REFERENCES dbo.companies(id) ON DELETE NO ACTION
);
GO
CREATE INDEX IX_ucm_company_active ON dbo.user_company_memberships(company_id, active);
GO

-- ────────────────────────────────────────────────────────────────────────
-- role_permissions — overrides de los 6 permisos configurables, por rol
-- (ver roles.service.js#PERMISSION_KEYS). Son globales a la plataforma hoy
-- (igual que en Firestore, un doc por rol sin empresa) — company_id queda
-- NULL-able y sin usar, reservado para si algún día se implementan permisos
-- por empresa (la UNIQUE constraint de abajo ya funciona igual con
-- company_id siempre NULL: SQL Server trata los NULL como iguales entre sí
-- a los efectos de una UNIQUE constraint, así que sigue habiendo como
-- máximo una fila por (role, permission_key)).
-- ────────────────────────────────────────────────────────────────────────
CREATE TABLE dbo.role_permissions (
  id              INT IDENTITY(1,1) NOT NULL,
  company_id      INT             NULL,
  role            NVARCHAR(30)    NOT NULL,
  permission_key  NVARCHAR(50)    NOT NULL,
  [value]         BIT             NOT NULL,
  CONSTRAINT PK_role_permissions PRIMARY KEY CLUSTERED (id),
  CONSTRAINT UQ_role_permissions_company_role_key UNIQUE (company_id, role, permission_key),
  CONSTRAINT CK_role_permissions_role CHECK (role IN ('supervisor_campo','sac','admin_area','jefe_inmediato')),
  CONSTRAINT FK_role_permissions_company FOREIGN KEY (company_id)
    REFERENCES dbo.companies(id) ON DELETE NO ACTION
);
GO

-- ────────────────────────────────────────────────────────────────────────
-- role_labels — nombre visible personalizado por rol (por defecto usa el
-- label estándar del código; esta tabla solo guarda los overrides)
-- ────────────────────────────────────────────────────────────────────────
CREATE TABLE dbo.role_labels (
  role        NVARCHAR(30)    NOT NULL,
  label       NVARCHAR(80)    NOT NULL,
  updated_at  DATETIME2       NOT NULL CONSTRAINT DF_role_labels_updated_at DEFAULT (SYSUTCDATETIME()),
  updated_by  INT             NULL,
  CONSTRAINT PK_role_labels PRIMARY KEY CLUSTERED (role),
  CONSTRAINT CK_role_labels_role CHECK (role IN ('supervisor_campo','sac','admin_area','jefe_inmediato')),
  CONSTRAINT FK_role_labels_updated_by FOREIGN KEY (updated_by)
    REFERENCES dbo.users(id) ON DELETE NO ACTION
);
GO

-- ────────────────────────────────────────────────────────────────────────
-- tickets — entidad central del sistema
-- ────────────────────────────────────────────────────────────────────────
CREATE TABLE dbo.tickets (
  id            INT IDENTITY(1,1) NOT NULL,
  company_id    INT             NULL,
  code          NVARCHAR(50)    NOT NULL,
  title         NVARCHAR(255)   NOT NULL,
  description   NVARCHAR(MAX)   NOT NULL,
  category_id   INT             NULL,
  area          NVARCHAR(100)   NULL,
  status        NVARCHAR(20)    NOT NULL CONSTRAINT DF_tickets_status DEFAULT ('recibido'),
  priority      NVARCHAR(20)    NOT NULL CONSTRAINT DF_tickets_priority DEFAULT ('media'),
  created_by    INT             NOT NULL,
  assigned_to   INT             NULL,
  closed_by     INT             NULL,
  created_at    DATETIME2       NOT NULL CONSTRAINT DF_tickets_created_at DEFAULT (SYSUTCDATETIME()),
  updated_at    DATETIME2       NOT NULL CONSTRAINT DF_tickets_updated_at DEFAULT (SYSUTCDATETIME()),
  closed_at     DATETIME2       NULL,
  CONSTRAINT PK_tickets PRIMARY KEY CLUSTERED (id),
  CONSTRAINT UQ_tickets_code UNIQUE (code),
  CONSTRAINT CK_tickets_status CHECK (status IN ('recibido','asignado','en_proceso','solucionado','cerrado','reabierto')),
  CONSTRAINT CK_tickets_priority CHECK (priority IN ('baja','media','alta','urgente')),
  CONSTRAINT FK_tickets_company FOREIGN KEY (company_id) REFERENCES dbo.companies(id) ON DELETE NO ACTION,
  CONSTRAINT FK_tickets_category FOREIGN KEY (category_id) REFERENCES dbo.categories(id) ON DELETE SET NULL,
  CONSTRAINT FK_tickets_created_by FOREIGN KEY (created_by) REFERENCES dbo.users(id) ON DELETE NO ACTION,
  CONSTRAINT FK_tickets_assigned_to FOREIGN KEY (assigned_to) REFERENCES dbo.users(id) ON DELETE NO ACTION,
  CONSTRAINT FK_tickets_closed_by FOREIGN KEY (closed_by) REFERENCES dbo.users(id) ON DELETE NO ACTION
);
GO
CREATE INDEX IX_tickets_status        ON dbo.tickets(status);
CREATE INDEX IX_tickets_assigned_to   ON dbo.tickets(assigned_to);
CREATE INDEX IX_tickets_created_at    ON dbo.tickets(created_at);
CREATE INDEX IX_tickets_priority      ON dbo.tickets(priority);
CREATE INDEX IX_tickets_category_id   ON dbo.tickets(category_id);
CREATE INDEX IX_tickets_area          ON dbo.tickets(area);
-- Índices compuestos para los accesos multiempresa más comunes (siempre se
-- filtra por company_id primero; ver docs/MULTITENANT.md §3.3).
CREATE INDEX IX_tickets_company_status    ON dbo.tickets(company_id, status, created_at DESC);
CREATE INDEX IX_tickets_company_assigned  ON dbo.tickets(company_id, assigned_to, status);
CREATE INDEX IX_tickets_company_created   ON dbo.tickets(company_id, created_by, created_at DESC);
CREATE INDEX IX_tickets_company_area      ON dbo.tickets(company_id, area, status);
GO

-- ────────────────────────────────────────────────────────────────────────
-- ticket_assignments — historial de a quién se le asignó cada ticket
-- ────────────────────────────────────────────────────────────────────────
CREATE TABLE dbo.ticket_assignments (
  id            INT IDENTITY(1,1) NOT NULL,
  ticket_id     INT             NOT NULL,
  from_user_id  INT             NULL,
  to_user_id    INT             NOT NULL,
  assigned_by   INT             NOT NULL,
  notes         NVARCHAR(MAX)   NULL,
  assigned_at   DATETIME2       NOT NULL CONSTRAINT DF_ticket_assignments_assigned_at DEFAULT (SYSUTCDATETIME()),
  CONSTRAINT PK_ticket_assignments PRIMARY KEY CLUSTERED (id),
  CONSTRAINT FK_ticket_assignments_ticket FOREIGN KEY (ticket_id) REFERENCES dbo.tickets(id) ON DELETE CASCADE,
  CONSTRAINT FK_ticket_assignments_from_user FOREIGN KEY (from_user_id) REFERENCES dbo.users(id) ON DELETE NO ACTION,
  CONSTRAINT FK_ticket_assignments_to_user FOREIGN KEY (to_user_id) REFERENCES dbo.users(id) ON DELETE NO ACTION,
  CONSTRAINT FK_ticket_assignments_assigned_by FOREIGN KEY (assigned_by) REFERENCES dbo.users(id) ON DELETE NO ACTION
);
GO
CREATE INDEX IX_ticket_assignments_ticket ON dbo.ticket_assignments(ticket_id);
GO

-- ────────────────────────────────────────────────────────────────────────
-- ticket_comments — historial tipo chat de cada ticket
-- (attachment_id se declara acá pero su FK se agrega al final, ver punto 3
-- de las notas de diseño arriba)
-- ────────────────────────────────────────────────────────────────────────
CREATE TABLE dbo.ticket_comments (
  id             INT IDENTITY(1,1) NOT NULL,
  ticket_id      INT             NOT NULL,
  user_id        INT             NOT NULL,
  comment        NVARCHAR(MAX)   NOT NULL,
  attachment_id  INT             NULL,
  created_at     DATETIME2       NOT NULL CONSTRAINT DF_ticket_comments_created_at DEFAULT (SYSUTCDATETIME()),
  CONSTRAINT PK_ticket_comments PRIMARY KEY CLUSTERED (id),
  CONSTRAINT FK_ticket_comments_ticket FOREIGN KEY (ticket_id) REFERENCES dbo.tickets(id) ON DELETE CASCADE,
  CONSTRAINT FK_ticket_comments_user FOREIGN KEY (user_id) REFERENCES dbo.users(id) ON DELETE NO ACTION
);
GO
CREATE INDEX IX_ticket_comments_ticket ON dbo.ticket_comments(ticket_id);
GO

-- ────────────────────────────────────────────────────────────────────────
-- attachments — archivos subidos a un ticket (opcionalmente a un comentario)
-- ────────────────────────────────────────────────────────────────────────
CREATE TABLE dbo.attachments (
  id             INT IDENTITY(1,1) NOT NULL,
  ticket_id      INT             NOT NULL,
  user_id        INT             NOT NULL,
  comment_id     INT             NULL,
  filename       NVARCHAR(255)   NOT NULL,
  original_name  NVARCHAR(255)   NOT NULL,
  mime_type      NVARCHAR(100)   NOT NULL,
  [size]         INT             NOT NULL,
  uploaded_at    DATETIME2       NOT NULL CONSTRAINT DF_attachments_uploaded_at DEFAULT (SYSUTCDATETIME()),
  CONSTRAINT PK_attachments PRIMARY KEY CLUSTERED (id),
  CONSTRAINT FK_attachments_ticket FOREIGN KEY (ticket_id) REFERENCES dbo.tickets(id) ON DELETE CASCADE,
  CONSTRAINT FK_attachments_user FOREIGN KEY (user_id) REFERENCES dbo.users(id) ON DELETE NO ACTION,
  -- NO ACTION (no SET NULL/CASCADE): ver nota de diseño §3 sobre la
  -- referencia cruzada con ticket_comments.attachment_id.
  CONSTRAINT FK_attachments_comment FOREIGN KEY (comment_id) REFERENCES dbo.ticket_comments(id) ON DELETE NO ACTION
);
GO
CREATE INDEX IX_attachments_ticket ON dbo.attachments(ticket_id);
GO

-- Cierra la referencia cruzada: ticket_comments.attachment_id → attachments.
-- NO ACTION por la misma razón que attachments.comment_id (nota de diseño §3).
ALTER TABLE dbo.ticket_comments
  ADD CONSTRAINT FK_ticket_comments_attachment FOREIGN KEY (attachment_id)
  REFERENCES dbo.attachments(id) ON DELETE NO ACTION;
GO

-- ────────────────────────────────────────────────────────────────────────
-- notifications
-- ────────────────────────────────────────────────────────────────────────
CREATE TABLE dbo.notifications (
  id          INT IDENTITY(1,1) NOT NULL,
  user_id     INT             NOT NULL,
  company_id  INT             NULL,
  type        NVARCHAR(30)    NOT NULL,
  ticket_id   INT             NULL,
  title       NVARCHAR(255)   NOT NULL,
  body        NVARCHAR(MAX)   NULL,
  [read]      BIT             NOT NULL CONSTRAINT DF_notifications_read DEFAULT (0),
  created_at  DATETIME2       NOT NULL CONSTRAINT DF_notifications_created_at DEFAULT (SYSUTCDATETIME()),
  CONSTRAINT PK_notifications PRIMARY KEY CLUSTERED (id),
  CONSTRAINT CK_notifications_type CHECK (type IN (
    'ticket_created','ticket_assigned','ticket_commented','ticket_status_changed',
    'ticket_closed','ticket_reopened','ticket_transferred'
  )),
  CONSTRAINT FK_notifications_user FOREIGN KEY (user_id) REFERENCES dbo.users(id) ON DELETE CASCADE,
  CONSTRAINT FK_notifications_company FOREIGN KEY (company_id) REFERENCES dbo.companies(id) ON DELETE NO ACTION,
  CONSTRAINT FK_notifications_ticket FOREIGN KEY (ticket_id) REFERENCES dbo.tickets(id) ON DELETE CASCADE
);
GO
CREATE INDEX IX_notifications_user ON dbo.notifications(user_id, [read], created_at);
CREATE INDEX IX_notifications_company_user ON dbo.notifications(company_id, user_id, [read], created_at DESC);
GO

-- ────────────────────────────────────────────────────────────────────────
-- audit_log — bitácora de auditoría
-- ────────────────────────────────────────────────────────────────────────
CREATE TABLE dbo.audit_log (
  id            INT IDENTITY(1,1) NOT NULL,
  user_id       INT             NULL,
  company_id    INT             NULL,
  action_type   NVARCHAR(50)    NOT NULL,
  target_type   NVARCHAR(50)    NOT NULL,
  target_id     INT             NULL,
  target_code   NVARCHAR(50)    NULL,
  description   NVARCHAR(MAX)   NULL,
  -- old_value / new_value guardan JSON serializado como texto cuando el
  -- valor es un objeto (ver firestoreData.js#logAudit), igual que hoy.
  old_value     NVARCHAR(MAX)   NULL,
  new_value     NVARCHAR(MAX)   NULL,
  ip_address    NVARCHAR(45)    NULL,
  created_at    DATETIME2       NOT NULL CONSTRAINT DF_audit_log_created_at DEFAULT (SYSUTCDATETIME()),
  CONSTRAINT PK_audit_log PRIMARY KEY CLUSTERED (id),
  -- ON DELETE SET NULL: si el usuario autor se elimina alguna vez, el
  -- registro de auditoría se conserva (no se pierde el historial).
  CONSTRAINT FK_audit_log_user FOREIGN KEY (user_id) REFERENCES dbo.users(id) ON DELETE SET NULL,
  CONSTRAINT FK_audit_log_company FOREIGN KEY (company_id) REFERENCES dbo.companies(id) ON DELETE NO ACTION
);
GO
CREATE INDEX IX_audit_log_user      ON dbo.audit_log(user_id);
CREATE INDEX IX_audit_log_action    ON dbo.audit_log(action_type);
CREATE INDEX IX_audit_log_target    ON dbo.audit_log(target_type, target_id);
CREATE INDEX IX_audit_log_created   ON dbo.audit_log(created_at);
CREATE INDEX IX_audit_log_company_target ON dbo.audit_log(company_id, target_type, created_at DESC);
GO

-- ────────────────────────────────────────────────────────────────────────
-- calendar_events — agenda/Gantt personal, opcionalmente ligada a un ticket
-- ────────────────────────────────────────────────────────────────────────
CREATE TABLE dbo.calendar_events (
  id          INT IDENTITY(1,1) NOT NULL,
  user_id     INT             NOT NULL,
  company_id  INT             NULL,
  ticket_id   INT             NULL,
  title       NVARCHAR(200)   NOT NULL,
  notes       NVARCHAR(MAX)   NULL,
  start_at    DATETIME2       NOT NULL,
  end_at      DATETIME2       NOT NULL,
  color       NVARCHAR(20)    NULL,
  type        NVARCHAR(20)    NOT NULL CONSTRAINT DF_calendar_events_type DEFAULT ('personal'),
  -- active: borrado lógico (mismo patrón que users/companies/categories). deleteEvent()
  -- en calendar.service.js lo pone en 0 en vez de borrar la fila; listEvents() lo filtra.
  active      BIT             NOT NULL CONSTRAINT DF_calendar_events_active DEFAULT (1),
  created_at  DATETIME2       NOT NULL CONSTRAINT DF_calendar_events_created_at DEFAULT (SYSUTCDATETIME()),
  updated_at  DATETIME2       NOT NULL CONSTRAINT DF_calendar_events_updated_at DEFAULT (SYSUTCDATETIME()),
  CONSTRAINT PK_calendar_events PRIMARY KEY CLUSTERED (id),
  CONSTRAINT CK_calendar_events_type CHECK (type IN ('personal','ticket_linked')),
  CONSTRAINT CK_calendar_events_color CHECK (color IS NULL OR color IN ('ocean','brand','deep','accent')),
  CONSTRAINT FK_calendar_events_user FOREIGN KEY (user_id) REFERENCES dbo.users(id) ON DELETE CASCADE,
  CONSTRAINT FK_calendar_events_company FOREIGN KEY (company_id) REFERENCES dbo.companies(id) ON DELETE NO ACTION,
  CONSTRAINT FK_calendar_events_ticket FOREIGN KEY (ticket_id) REFERENCES dbo.tickets(id) ON DELETE SET NULL
);
GO
CREATE INDEX IX_calendar_events_user_range ON dbo.calendar_events(user_id, start_at, end_at);
CREATE INDEX IX_calendar_events_ticket     ON dbo.calendar_events(ticket_id);
GO

-- ============================================================================
-- Fin del esquema. 13 tablas, en el mismo orden en que se crean arriba:
-- users, companies, categories, user_company_memberships, role_permissions,
-- role_labels, tickets, ticket_assignments, ticket_comments, attachments,
-- notifications, audit_log, calendar_events.
--
-- PENDIENTE INTENCIONAL (no es un olvido): esto crea tablas, restricciones
-- e índices. NO crea logins/usuarios de SQL Server, NO configura el pool de
-- conexión (eso lo resuelve la app vía las variables MSSQL_* documentadas
-- en `src/orm/env.js` y `.env.example`), y NO migra datos existentes de
-- Firestore — eso es un script aparte (extract de Firestore → INSERT acá),
-- todavía no escrito.
-- ============================================================================
