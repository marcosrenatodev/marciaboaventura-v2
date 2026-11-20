-- Educational post drafts stay inside the office tenant until the user shares
-- them manually. Audit entries intentionally omit the draft text.
CREATE TABLE social_content_drafts (
  tenant_id TEXT NOT NULL,
  draft_id TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('instagram', 'facebook', 'tiktok')),
  topic TEXT NOT NULL CHECK (length(topic) BETWEEN 2 AND 160),
  content TEXT NOT NULL CHECK (length(content) BETWEEN 12 AND 5000),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL,
  updated_by_user_id TEXT NOT NULL,
  PRIMARY KEY (tenant_id, draft_id),
  FOREIGN KEY (tenant_id) REFERENCES organizations (tenant_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, created_by_user_id) REFERENCES tenant_memberships (tenant_id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, updated_by_user_id) REFERENCES tenant_memberships (tenant_id, user_id) ON DELETE RESTRICT
);

CREATE INDEX social_content_drafts_by_tenant_updated
  ON social_content_drafts (tenant_id, updated_at DESC);

CREATE TABLE social_content_draft_audit_events (
  tenant_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  draft_id TEXT NOT NULL,
  actor_user_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('created', 'updated')),
  created_at TEXT NOT NULL,
  request_id TEXT NOT NULL,
  PRIMARY KEY (tenant_id, event_id),
  FOREIGN KEY (tenant_id, draft_id) REFERENCES social_content_drafts (tenant_id, draft_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, actor_user_id) REFERENCES tenant_memberships (tenant_id, user_id) ON DELETE RESTRICT
);

CREATE INDEX social_content_draft_audit_by_draft_time
  ON social_content_draft_audit_events (tenant_id, draft_id, created_at DESC);

CREATE TRIGGER social_content_draft_audit_events_no_update
BEFORE UPDATE ON social_content_draft_audit_events
BEGIN
  SELECT RAISE(ABORT, 'social content draft audit is append-only');
END;

CREATE TRIGGER social_content_draft_audit_events_no_delete
BEFORE DELETE ON social_content_draft_audit_events
BEGIN
  SELECT RAISE(ABORT, 'social content draft audit is append-only');
END;
