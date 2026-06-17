-- Sistema de Tickets GCM — esquema SQLite (flujo GCM)
-- Roles:
--   supervisor_campo  → genera tickets en campo
--   sac               → asigna / reasigna, ve todo, NO cierra
--   admin_area        → trabaja tickets de su área, NO cierra
--   jefe_inmediato    → cierra / reabre
-- Estados:
--   recibido | asignado | en_proceso | solucionado | cerrado | reabierto

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  username        TEXT NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,
  full_name       TEXT NOT NULL,
  email           TEXT,
  role            TEXT NOT NULL CHECK (role IN ('supervisor_campo','sac','admin_area','jefe_inmediato')),
  area            TEXT,                                 -- 'operaciones','logistica','mantenimiento','sistemas','otro'
  active          INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS categories (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT NOT NULL UNIQUE,
  active          INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tickets (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  code            TEXT NOT NULL UNIQUE,
  title           TEXT NOT NULL,
  description     TEXT NOT NULL,
  category_id     INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  area            TEXT,                                 -- área a la que pertenece
  status          TEXT NOT NULL DEFAULT 'recibido'
                  CHECK (status IN ('recibido','asignado','en_proceso','solucionado','cerrado','reabierto')),
  priority        TEXT NOT NULL DEFAULT 'media'
                  CHECK (priority IN ('baja','media','alta','urgente')),
  created_by      INTEGER NOT NULL REFERENCES users(id),
  assigned_to     INTEGER REFERENCES users(id),         -- admin_area que trabaja
  closed_by       INTEGER REFERENCES users(id),         -- jefe que cerró
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  closed_at       TEXT
);

CREATE INDEX IF NOT EXISTS idx_tickets_status       ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_assigned_to  ON tickets(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tickets_created_at   ON tickets(created_at);
CREATE INDEX IF NOT EXISTS idx_tickets_priority     ON tickets(priority);
CREATE INDEX IF NOT EXISTS idx_tickets_category_id  ON tickets(category_id);
CREATE INDEX IF NOT EXISTS idx_tickets_area         ON tickets(area);

CREATE TABLE IF NOT EXISTS ticket_assignments (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id       INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  from_user_id    INTEGER REFERENCES users(id),
  to_user_id      INTEGER NOT NULL REFERENCES users(id),
  assigned_by     INTEGER NOT NULL REFERENCES users(id),
  notes           TEXT,
  assigned_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_assignments_ticket ON ticket_assignments(ticket_id);

CREATE TABLE IF NOT EXISTS ticket_comments (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id       INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  user_id         INTEGER NOT NULL REFERENCES users(id),
  comment         TEXT NOT NULL,
  attachment_id   INTEGER REFERENCES attachments(id) ON DELETE CASCADE,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_comments_ticket ON ticket_comments(ticket_id);

CREATE TABLE IF NOT EXISTS attachments (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id       INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  user_id         INTEGER NOT NULL REFERENCES users(id),
  comment_id      INTEGER REFERENCES ticket_comments(id) ON DELETE SET NULL,
  filename        TEXT NOT NULL,
  original_name   TEXT NOT NULL,
  mime_type       TEXT NOT NULL,
  size            INTEGER NOT NULL,
  uploaded_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_attachments_ticket ON attachments(ticket_id);

CREATE TABLE IF NOT EXISTS notifications (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type            TEXT NOT NULL CHECK (type IN ('ticket_created','ticket_assigned','ticket_commented','ticket_status_changed','ticket_closed','ticket_reopened','ticket_transferred')),
  ticket_id       INTEGER REFERENCES tickets(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  body            TEXT,
  read            INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read, created_at);
