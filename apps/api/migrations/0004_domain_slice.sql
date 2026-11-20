-- Primeira fatia persistente do domínio. Todos os dados e vínculos são tenant-scoped.
CREATE TABLE matters (
  tenant_id TEXT NOT NULL,
  matter_id TEXT NOT NULL,
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 160),
  description TEXT CHECK (description IS NULL OR length(description) <= 4000),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  created_by_user_id TEXT NOT NULL,
  updated_by_user_id TEXT NOT NULL,
  PRIMARY KEY (tenant_id, matter_id),
  FOREIGN KEY (tenant_id) REFERENCES organizations (tenant_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, created_by_user_id) REFERENCES tenant_memberships (tenant_id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, updated_by_user_id) REFERENCES tenant_memberships (tenant_id, user_id) ON DELETE RESTRICT
);
CREATE INDEX matters_by_tenant_status_updated ON matters (tenant_id, status, updated_at);

CREATE TABLE court_cases (
  tenant_id TEXT NOT NULL,
  case_id TEXT NOT NULL,
  matter_id TEXT,
  court_name TEXT NOT NULL CHECK (length(trim(court_name)) BETWEEN 1 AND 160),
  jurisdiction TEXT CHECK (jurisdiction IS NULL OR length(jurisdiction) <= 120),
  case_number TEXT CHECK (case_number IS NULL OR length(case_number) <= 80),
  label TEXT CHECK (label IS NULL OR length(label) <= 160),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  created_by_user_id TEXT NOT NULL,
  updated_by_user_id TEXT NOT NULL,
  PRIMARY KEY (tenant_id, case_id),
  FOREIGN KEY (tenant_id) REFERENCES organizations (tenant_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, matter_id) REFERENCES matters (tenant_id, matter_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, created_by_user_id) REFERENCES tenant_memberships (tenant_id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, updated_by_user_id) REFERENCES tenant_memberships (tenant_id, user_id) ON DELETE RESTRICT
);
CREATE INDEX court_cases_by_tenant_matter_status ON court_cases (tenant_id, matter_id, status);

CREATE TABLE tasks (
  tenant_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  matter_id TEXT,
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 160),
  notes TEXT CHECK (notes IS NULL OR length(notes) <= 4000),
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'done', 'cancelled')),
  scheduled_for TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  created_by_user_id TEXT NOT NULL,
  updated_by_user_id TEXT NOT NULL,
  PRIMARY KEY (tenant_id, task_id),
  FOREIGN KEY (tenant_id) REFERENCES organizations (tenant_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, matter_id) REFERENCES matters (tenant_id, matter_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, created_by_user_id) REFERENCES tenant_memberships (tenant_id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, updated_by_user_id) REFERENCES tenant_memberships (tenant_id, user_id) ON DELETE RESTRICT
);
CREATE INDEX tasks_by_tenant_status_schedule ON tasks (tenant_id, status, scheduled_for);
CREATE INDEX tasks_by_tenant_matter_status ON tasks (tenant_id, matter_id, status);

CREATE TABLE appointments (
  tenant_id TEXT NOT NULL,
  appointment_id TEXT NOT NULL,
  matter_id TEXT,
  case_id TEXT,
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 160),
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL CHECK (ends_at > starts_at),
  timezone TEXT NOT NULL CHECK (length(trim(timezone)) BETWEEN 1 AND 64),
  location TEXT CHECK (location IS NULL OR length(location) <= 500),
  notes TEXT CHECK (notes IS NULL OR length(notes) <= 4000),
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'cancelled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  created_by_user_id TEXT NOT NULL,
  updated_by_user_id TEXT NOT NULL,
  PRIMARY KEY (tenant_id, appointment_id),
  FOREIGN KEY (tenant_id) REFERENCES organizations (tenant_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, matter_id) REFERENCES matters (tenant_id, matter_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, case_id) REFERENCES court_cases (tenant_id, case_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, created_by_user_id) REFERENCES tenant_memberships (tenant_id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, updated_by_user_id) REFERENCES tenant_memberships (tenant_id, user_id) ON DELETE RESTRICT
);
CREATE INDEX appointments_by_tenant_start_status ON appointments (tenant_id, starts_at, status);

CREATE TABLE financial_entries (
  tenant_id TEXT NOT NULL,
  entry_id TEXT NOT NULL,
  matter_id TEXT,
  case_id TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('income', 'expense')),
  description TEXT NOT NULL CHECK (length(trim(description)) BETWEEN 1 AND 160),
  amount_cents INTEGER NOT NULL CHECK (amount_cents BETWEEN 1 AND 9007199254740991),
  currency TEXT NOT NULL DEFAULT 'BRL' CHECK (currency = 'BRL'),
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'paid', 'cancelled')),
  due_on TEXT CHECK (due_on IS NULL OR (length(due_on) = 10 AND date(due_on) IS NOT NULL)),
  occurred_at TEXT,
  timezone TEXT CHECK (timezone IS NULL OR length(timezone) <= 64),
  category TEXT CHECK (category IS NULL OR length(category) <= 80),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  created_by_user_id TEXT NOT NULL,
  updated_by_user_id TEXT NOT NULL,
  PRIMARY KEY (tenant_id, entry_id),
  FOREIGN KEY (tenant_id) REFERENCES organizations (tenant_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, matter_id) REFERENCES matters (tenant_id, matter_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, case_id) REFERENCES court_cases (tenant_id, case_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, created_by_user_id) REFERENCES tenant_memberships (tenant_id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, updated_by_user_id) REFERENCES tenant_memberships (tenant_id, user_id) ON DELETE RESTRICT
);
CREATE INDEX financial_entries_by_tenant_kind_status_due ON financial_entries (tenant_id, kind, status, due_on);
CREATE INDEX financial_entries_by_tenant_occurred ON financial_entries (tenant_id, occurred_at);

CREATE TABLE audit_events (
  tenant_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  actor_user_id TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('matter', 'court_case', 'task', 'appointment', 'financial_entry')),
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('created', 'status_changed')),
  created_at TEXT NOT NULL,
  request_id TEXT NOT NULL,
  metadata TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY (tenant_id, event_id),
  FOREIGN KEY (tenant_id) REFERENCES organizations (tenant_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, actor_user_id) REFERENCES tenant_memberships (tenant_id, user_id) ON DELETE RESTRICT
);
CREATE INDEX audit_events_by_tenant_created ON audit_events (tenant_id, created_at);
CREATE INDEX audit_events_by_entity ON audit_events (tenant_id, entity_type, entity_id, created_at);
