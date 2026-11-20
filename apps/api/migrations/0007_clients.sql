-- Minimal tenant-scoped client directory and matter links. Client records are never hard-deleted.
CREATE TABLE clients (
  tenant_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  display_name TEXT NOT NULL CHECK (length(trim(display_name)) BETWEEN 1 AND 160),
  email TEXT CHECK (email IS NULL OR (length(email) <= 320 AND instr(email, '@') > 1)),
  phone TEXT CHECK (phone IS NULL OR length(phone) <= 32),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL,
  updated_by_user_id TEXT NOT NULL,
  PRIMARY KEY (tenant_id, client_id),
  FOREIGN KEY (tenant_id) REFERENCES organizations (tenant_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, created_by_user_id) REFERENCES tenant_memberships (tenant_id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, updated_by_user_id) REFERENCES tenant_memberships (tenant_id, user_id) ON DELETE RESTRICT
);
CREATE INDEX clients_by_tenant_status_updated ON clients (tenant_id, status, updated_at DESC);

CREATE TABLE matter_clients (
  tenant_id TEXT NOT NULL,
  matter_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, matter_id),
  FOREIGN KEY (tenant_id, matter_id) REFERENCES matters (tenant_id, matter_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, client_id) REFERENCES clients (tenant_id, client_id) ON DELETE RESTRICT
);
CREATE INDEX matter_clients_by_tenant_client ON matter_clients (tenant_id, client_id);

CREATE TABLE client_audit_events (
  tenant_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  actor_user_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('created', 'updated', 'status_changed')),
  created_at TEXT NOT NULL,
  request_id TEXT NOT NULL,
  metadata TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY (tenant_id, event_id),
  FOREIGN KEY (tenant_id, client_id) REFERENCES clients (tenant_id, client_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, actor_user_id) REFERENCES tenant_memberships (tenant_id, user_id) ON DELETE RESTRICT
);
CREATE INDEX client_audit_by_tenant_created ON client_audit_events (tenant_id, created_at DESC);
