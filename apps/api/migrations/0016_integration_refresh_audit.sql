-- Preserve connection history while allowing the existing token refresh audit event.
ALTER TABLE integration_connection_audit_events
  RENAME TO integration_connection_audit_events_legacy;

CREATE TABLE integration_connection_audit_events (
  tenant_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('google_drive', 'microsoft_graph')),
  actor_user_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('connected', 'disconnected', 'token_refreshed')),
  created_at TEXT NOT NULL,
  request_id TEXT NOT NULL,
  metadata TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY (tenant_id, event_id),
  FOREIGN KEY (tenant_id) REFERENCES organizations (tenant_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, actor_user_id) REFERENCES tenant_memberships (tenant_id, user_id) ON DELETE RESTRICT
);

INSERT INTO integration_connection_audit_events (
  tenant_id, event_id, provider, actor_user_id, action, created_at, request_id, metadata
)
SELECT tenant_id, event_id, provider, actor_user_id, action, created_at, request_id, metadata
FROM integration_connection_audit_events_legacy;

DROP TABLE integration_connection_audit_events_legacy;

CREATE INDEX integration_connection_audit_by_tenant_created
  ON integration_connection_audit_events (tenant_id, created_at DESC);
