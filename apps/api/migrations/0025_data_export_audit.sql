-- Record owner-requested office-data exports without retaining exported content.
CREATE TABLE data_export_audit_events (
  tenant_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  actor_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  request_id TEXT NOT NULL CHECK (length(request_id) BETWEEN 1 AND 160),
  format_version INTEGER NOT NULL CHECK (format_version = 1),
  collection_counts TEXT NOT NULL CHECK (length(collection_counts) BETWEEN 2 AND 4096),
  byte_size INTEGER NOT NULL CHECK (byte_size BETWEEN 1 AND 4194304),
  PRIMARY KEY (tenant_id, event_id),
  FOREIGN KEY (tenant_id) REFERENCES organizations (tenant_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, actor_user_id) REFERENCES tenant_memberships (tenant_id, user_id) ON DELETE RESTRICT
);

CREATE INDEX data_export_audit_by_tenant_created
  ON data_export_audit_events (tenant_id, created_at DESC);

CREATE TRIGGER data_export_audit_events_no_update
BEFORE UPDATE ON data_export_audit_events
BEGIN
  SELECT RAISE(ABORT, 'data export audit is append-only');
END;

CREATE TRIGGER data_export_audit_events_no_delete
BEFORE DELETE ON data_export_audit_events
BEGIN
  SELECT RAISE(ABORT, 'data export audit is append-only');
END;
