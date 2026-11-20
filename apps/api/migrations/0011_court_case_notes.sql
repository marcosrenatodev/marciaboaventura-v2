-- Append-only internal notes for an office case. No hard-delete API is provided.
CREATE TABLE court_case_notes (
  tenant_id TEXT NOT NULL,
  note_id TEXT NOT NULL,
  case_id TEXT NOT NULL,
  body TEXT NOT NULL CHECK (length(trim(body)) BETWEEN 1 AND 8000),
  created_at TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL,
  PRIMARY KEY (tenant_id, note_id),
  FOREIGN KEY (tenant_id, case_id) REFERENCES court_cases (tenant_id, case_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, created_by_user_id) REFERENCES tenant_memberships (tenant_id, user_id) ON DELETE RESTRICT
);
CREATE INDEX court_case_notes_by_tenant_case_created ON court_case_notes (tenant_id, case_id, created_at DESC, note_id DESC);

CREATE TABLE court_case_note_audit_events (
  tenant_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  note_id TEXT NOT NULL,
  case_id TEXT NOT NULL,
  actor_user_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action = 'created'),
  created_at TEXT NOT NULL,
  request_id TEXT NOT NULL,
  metadata TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY (tenant_id, event_id),
  FOREIGN KEY (tenant_id, note_id) REFERENCES court_case_notes (tenant_id, note_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, case_id) REFERENCES court_cases (tenant_id, case_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, actor_user_id) REFERENCES tenant_memberships (tenant_id, user_id) ON DELETE RESTRICT
);
CREATE INDEX court_case_note_audit_by_tenant_created ON court_case_note_audit_events (tenant_id, created_at DESC);
