-- A refresh may rotate the provider token even if its response is lost. A
-- stranded guard therefore requires reconnection instead of automatic retry.
CREATE TABLE integration_refresh_guards (
  tenant_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('google_drive', 'microsoft_graph')),
  attempt_id TEXT NOT NULL,
  started_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, provider),
  FOREIGN KEY (tenant_id) REFERENCES organizations (tenant_id) ON DELETE RESTRICT
);
