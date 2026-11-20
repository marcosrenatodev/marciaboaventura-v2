-- Saved legal searches are tenant-owned office notes, not legal opinions.
-- Edits and removals retain append-only metadata while hiding archived rows by default.
ALTER TABLE legal_researches ADD COLUMN updated_at TEXT;
ALTER TABLE legal_researches ADD COLUMN updated_by_user_id TEXT;
ALTER TABLE legal_researches ADD COLUMN archived_at TEXT;

UPDATE legal_researches
SET updated_at = created_at, updated_by_user_id = created_by_user_id
WHERE updated_at IS NULL OR updated_by_user_id IS NULL;

CREATE TRIGGER legal_researches_lifecycle_required_insert
BEFORE INSERT ON legal_researches
WHEN NEW.updated_at IS NULL OR NEW.updated_by_user_id IS NULL
BEGIN
  SELECT RAISE(ABORT, 'legal research lifecycle fields are required');
END;

CREATE TRIGGER legal_researches_lifecycle_required_update
BEFORE UPDATE ON legal_researches
WHEN NEW.updated_at IS NULL OR NEW.updated_by_user_id IS NULL
BEGIN
  SELECT RAISE(ABORT, 'legal research lifecycle fields are required');
END;

CREATE INDEX legal_researches_by_tenant_archive_created
  ON legal_researches (tenant_id, archived_at, created_at DESC, research_id DESC);

CREATE TABLE legal_research_audit_events_next (
  tenant_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  research_id TEXT NOT NULL,
  actor_user_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('created', 'updated', 'archived', 'restored')),
  created_at TEXT NOT NULL,
  request_id TEXT NOT NULL,
  metadata TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY (tenant_id, event_id),
  FOREIGN KEY (tenant_id, research_id) REFERENCES legal_researches (tenant_id, research_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, actor_user_id) REFERENCES tenant_memberships (tenant_id, user_id) ON DELETE RESTRICT
);

INSERT INTO legal_research_audit_events_next
  (tenant_id, event_id, research_id, actor_user_id, action, created_at, request_id, metadata)
SELECT tenant_id, event_id, research_id, actor_user_id, action, created_at, request_id, '{}'
FROM legal_research_audit_events;

DROP TABLE legal_research_audit_events;
ALTER TABLE legal_research_audit_events_next RENAME TO legal_research_audit_events;

CREATE INDEX legal_research_audit_by_tenant_created
  ON legal_research_audit_events (tenant_id, created_at);
CREATE INDEX legal_research_audit_by_research_created
  ON legal_research_audit_events (tenant_id, research_id, created_at DESC);

CREATE TRIGGER legal_research_audit_events_no_update
BEFORE UPDATE ON legal_research_audit_events
BEGIN
  SELECT RAISE(ABORT, 'legal research audit is append-only');
END;

CREATE TRIGGER legal_research_audit_events_no_delete
BEFORE DELETE ON legal_research_audit_events
BEGIN
  SELECT RAISE(ABORT, 'legal research audit is append-only');
END;
