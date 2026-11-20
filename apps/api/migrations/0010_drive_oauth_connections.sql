-- OAuth callbacks are one-time, PKCE-bound transactions. Provider tokens remain encrypted.
CREATE TABLE integration_oauth_transactions (
  state_hash TEXT NOT NULL PRIMARY KEY CHECK (length(state_hash) = 64),
  tenant_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('google_drive', 'microsoft_graph')),
  user_id TEXT NOT NULL,
  code_verifier_ciphertext TEXT NOT NULL CHECK (length(code_verifier_ciphertext) BETWEEN 24 AND 4096),
  code_verifier_iv TEXT NOT NULL CHECK (length(code_verifier_iv) = 16),
  redirect_uri TEXT NOT NULL CHECK (length(redirect_uri) BETWEEN 20 AND 512),
  return_platform TEXT NOT NULL CHECK (return_platform IN ('web', 'native')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'exchanging')),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (tenant_id) REFERENCES organizations (tenant_id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, user_id) REFERENCES tenant_memberships (tenant_id, user_id) ON DELETE CASCADE
);
CREATE INDEX integration_oauth_transactions_expiry ON integration_oauth_transactions (expires_at);

CREATE TABLE integration_connections (
  tenant_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('google_drive', 'microsoft_graph')),
  ciphertext TEXT NOT NULL CHECK (length(ciphertext) BETWEEN 24 AND 32768),
  iv TEXT NOT NULL CHECK (length(iv) = 16),
  key_version INTEGER NOT NULL DEFAULT 1 CHECK (key_version = 1),
  connected_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  connected_by_user_id TEXT NOT NULL,
  PRIMARY KEY (tenant_id, provider),
  FOREIGN KEY (tenant_id) REFERENCES organizations (tenant_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, connected_by_user_id) REFERENCES tenant_memberships (tenant_id, user_id) ON DELETE RESTRICT
);

CREATE TABLE integration_connection_audit_events (
  tenant_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('google_drive', 'microsoft_graph')),
  actor_user_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('connected', 'disconnected')),
  created_at TEXT NOT NULL,
  request_id TEXT NOT NULL,
  metadata TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY (tenant_id, event_id),
  FOREIGN KEY (tenant_id) REFERENCES organizations (tenant_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, actor_user_id) REFERENCES tenant_memberships (tenant_id, user_id) ON DELETE RESTRICT
);
CREATE INDEX integration_connection_audit_by_tenant_created ON integration_connection_audit_events (tenant_id, created_at DESC);
