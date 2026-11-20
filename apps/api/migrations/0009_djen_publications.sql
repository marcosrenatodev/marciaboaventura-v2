-- Consulta manual do DJEN por processo. O conteúdo da publicação não é copiado para D1.
CREATE TABLE court_provider_rate_limits (
  provider TEXT NOT NULL PRIMARY KEY CHECK (provider = 'djen'),
  next_allowed_at TEXT NOT NULL
);

CREATE TABLE court_publication_syncs (
  tenant_id TEXT NOT NULL,
  case_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('items_returned', 'empty_unconfirmed', 'rate_limited', 'source_error')),
  source_environment TEXT NOT NULL CHECK (source_environment IN ('homologation', 'production')),
  checked_at TEXT NOT NULL,
  returned_count INTEGER NOT NULL DEFAULT 0 CHECK (returned_count BETWEEN 0 AND 100),
  warning_code TEXT CHECK (warning_code IS NULL OR warning_code IN ('coverage_unverified', 'empty_unconfirmed', 'rate_limited', 'source_unavailable', 'invalid_response', 'process_number_required')),
  checked_by_user_id TEXT NOT NULL,
  PRIMARY KEY (tenant_id, case_id),
  FOREIGN KEY (tenant_id, case_id) REFERENCES court_cases (tenant_id, case_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, checked_by_user_id) REFERENCES tenant_memberships (tenant_id, user_id) ON DELETE RESTRICT
);

CREATE TABLE court_publications (
  tenant_id TEXT NOT NULL,
  case_id TEXT NOT NULL,
  source_hash TEXT NOT NULL CHECK (length(source_hash) BETWEEN 12 AND 128),
  source_environment TEXT NOT NULL CHECK (source_environment IN ('homologation', 'production')),
  tribunal_code TEXT CHECK (tribunal_code IS NULL OR length(tribunal_code) <= 24),
  communication_type TEXT CHECK (communication_type IS NULL OR length(communication_type) <= 120),
  available_on TEXT CHECK (available_on IS NULL OR (length(available_on) = 10 AND date(available_on) IS NOT NULL)),
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, case_id, source_hash),
  FOREIGN KEY (tenant_id, case_id) REFERENCES court_cases (tenant_id, case_id) ON DELETE RESTRICT
);
CREATE INDEX court_publications_by_tenant_case_date ON court_publications (tenant_id, case_id, available_on DESC, last_seen_at DESC);

CREATE TABLE court_publication_sync_audit_events (
  tenant_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  case_id TEXT NOT NULL,
  actor_user_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('items_returned', 'empty_unconfirmed', 'rate_limited', 'source_error')),
  returned_count INTEGER NOT NULL DEFAULT 0 CHECK (returned_count BETWEEN 0 AND 100),
  created_at TEXT NOT NULL,
  request_id TEXT NOT NULL,
  PRIMARY KEY (tenant_id, event_id),
  FOREIGN KEY (tenant_id, case_id) REFERENCES court_cases (tenant_id, case_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, actor_user_id) REFERENCES tenant_memberships (tenant_id, user_id) ON DELETE RESTRICT
);
CREATE INDEX court_publication_sync_audit_by_tenant_time ON court_publication_sync_audit_events (tenant_id, created_at);
