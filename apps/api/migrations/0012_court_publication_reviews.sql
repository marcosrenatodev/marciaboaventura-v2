-- Internal review state for public DJEN metadata; this does not represent legal service or deadline confirmation.
CREATE TABLE court_publication_reviews (
  tenant_id TEXT NOT NULL,
  case_id TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'reviewed')),
  reviewed_at TEXT,
  reviewed_by_user_id TEXT,
  updated_at TEXT NOT NULL,
  updated_by_user_id TEXT NOT NULL,
  PRIMARY KEY (tenant_id, case_id, source_hash),
  CHECK (
    (status = 'pending' AND reviewed_at IS NULL AND reviewed_by_user_id IS NULL)
    OR (status = 'reviewed' AND reviewed_at IS NOT NULL AND reviewed_by_user_id IS NOT NULL)
  ),
  FOREIGN KEY (tenant_id, case_id, source_hash)
    REFERENCES court_publications (tenant_id, case_id, source_hash) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, updated_by_user_id)
    REFERENCES tenant_memberships (tenant_id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, reviewed_by_user_id)
    REFERENCES tenant_memberships (tenant_id, user_id) ON DELETE RESTRICT
);

CREATE INDEX court_publication_reviews_by_tenant_status
  ON court_publication_reviews (tenant_id, status, updated_at DESC);

CREATE TABLE court_publication_review_audit_events (
  tenant_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  case_id TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  actor_user_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('reviewed', 'reopened')),
  created_at TEXT NOT NULL,
  request_id TEXT NOT NULL,
  PRIMARY KEY (tenant_id, event_id),
  FOREIGN KEY (tenant_id, case_id, source_hash)
    REFERENCES court_publications (tenant_id, case_id, source_hash) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, actor_user_id)
    REFERENCES tenant_memberships (tenant_id, user_id) ON DELETE RESTRICT
);

CREATE INDEX court_publication_review_audit_by_case_time
  ON court_publication_review_audit_events (tenant_id, case_id, source_hash, created_at DESC);
