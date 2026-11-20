-- Owner-managed provider configuration. Secret values are AES-GCM encrypted before they reach D1.
CREATE TABLE integration_credentials (
  tenant_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('google_drive', 'microsoft_graph')),
  ciphertext TEXT NOT NULL CHECK (length(ciphertext) BETWEEN 24 AND 16384),
  iv TEXT NOT NULL CHECK (length(iv) = 16),
  key_version INTEGER NOT NULL DEFAULT 1 CHECK (key_version = 1),
  updated_at TEXT NOT NULL,
  updated_by_user_id TEXT NOT NULL,
  PRIMARY KEY (tenant_id, provider),
  FOREIGN KEY (tenant_id) REFERENCES organizations (tenant_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, updated_by_user_id) REFERENCES tenant_memberships (tenant_id, user_id) ON DELETE RESTRICT
);

CREATE TABLE integration_credential_audit_events (
  tenant_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('google_drive', 'microsoft_graph')),
  actor_user_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('credentials_updated', 'credentials_cleared')),
  created_at TEXT NOT NULL,
  request_id TEXT NOT NULL,
  metadata TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY (tenant_id, event_id),
  FOREIGN KEY (tenant_id) REFERENCES organizations (tenant_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, actor_user_id) REFERENCES tenant_memberships (tenant_id, user_id) ON DELETE RESTRICT
);
CREATE INDEX integration_credential_audit_by_tenant_created ON integration_credential_audit_events (tenant_id, created_at DESC);
