-- Private PDF vault metadata; file bytes live only in the private R2 binding.
CREATE TABLE documents (
  tenant_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  matter_id TEXT,
  case_id TEXT,
  object_key TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL CHECK (length(trim(file_name)) BETWEEN 1 AND 180),
  mime_type TEXT NOT NULL CHECK (mime_type = 'application/pdf'),
  byte_size INTEGER NOT NULL CHECK (byte_size BETWEEN 1 AND 10485760),
  sha256 TEXT NOT NULL CHECK (length(sha256) = 64 AND sha256 NOT GLOB '*[^0-9a-f]*'),
  encryption_key_version INTEGER NOT NULL CHECK (encryption_key_version = 1),
  encryption_iv TEXT NOT NULL CHECK (length(encryption_iv) BETWEEN 16 AND 32),
  status TEXT NOT NULL CHECK (status IN ('uploading', 'ready', 'failed', 'archived')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL,
  updated_by_user_id TEXT NOT NULL,
  PRIMARY KEY (tenant_id, document_id),
  FOREIGN KEY (tenant_id) REFERENCES organizations (tenant_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, matter_id) REFERENCES matters (tenant_id, matter_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, case_id) REFERENCES court_cases (tenant_id, case_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, created_by_user_id) REFERENCES tenant_memberships (tenant_id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, updated_by_user_id) REFERENCES tenant_memberships (tenant_id, user_id) ON DELETE RESTRICT
);

CREATE INDEX documents_by_tenant_status_created
  ON documents (tenant_id, status, created_at DESC, document_id DESC);
CREATE INDEX documents_by_tenant_case_created
  ON documents (tenant_id, case_id, created_at DESC);
CREATE INDEX documents_by_tenant_matter_created
  ON documents (tenant_id, matter_id, created_at DESC);

CREATE TABLE document_audit_events (
  tenant_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  actor_user_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('upload_started', 'upload_completed', 'upload_failed', 'downloaded', 'archived', 'restored')),
  created_at TEXT NOT NULL,
  request_id TEXT NOT NULL,
  PRIMARY KEY (tenant_id, event_id),
  FOREIGN KEY (tenant_id, document_id) REFERENCES documents (tenant_id, document_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, actor_user_id) REFERENCES tenant_memberships (tenant_id, user_id) ON DELETE RESTRICT
);

CREATE INDEX document_audit_by_tenant_document_time
  ON document_audit_events (tenant_id, document_id, created_at DESC);
