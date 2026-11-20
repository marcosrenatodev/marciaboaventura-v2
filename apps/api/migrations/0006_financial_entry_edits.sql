-- Preserve the distinction between cancellation and archival. Cancelled rows
-- remain visible in the ledger; only archived matters/cases are hidden.
UPDATE tasks SET deleted_at = NULL WHERE status = 'cancelled' AND deleted_at IS NOT NULL;
UPDATE appointments SET deleted_at = NULL WHERE status = 'cancelled' AND deleted_at IS NOT NULL;
UPDATE financial_entries SET deleted_at = NULL WHERE status = 'cancelled' AND deleted_at IS NOT NULL;

-- Add an explicit audit action for edits without retaining financial values.
DROP INDEX audit_events_by_tenant_created;
DROP INDEX audit_events_by_entity;
ALTER TABLE audit_events RENAME TO audit_events_before_edits;

CREATE TABLE audit_events (
  tenant_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  actor_user_id TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('matter', 'court_case', 'task', 'appointment', 'financial_entry')),
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('created', 'status_changed', 'updated')),
  created_at TEXT NOT NULL,
  request_id TEXT NOT NULL,
  metadata TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY (tenant_id, event_id),
  FOREIGN KEY (tenant_id) REFERENCES organizations (tenant_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, actor_user_id) REFERENCES tenant_memberships (tenant_id, user_id) ON DELETE RESTRICT
);

INSERT INTO audit_events (tenant_id, event_id, actor_user_id, entity_type, entity_id, action, created_at, request_id, metadata)
SELECT tenant_id, event_id, actor_user_id, entity_type, entity_id, action, created_at, request_id, metadata
FROM audit_events_before_edits;

DROP TABLE audit_events_before_edits;
CREATE INDEX audit_events_by_tenant_created ON audit_events (tenant_id, created_at);
CREATE INDEX audit_events_by_entity ON audit_events (tenant_id, entity_type, entity_id, created_at);
