-- Append-only references to encrypted PDF copies in the private backup R2 bucket.
-- A document must have a successful copy event before the API transitions it to ready
-- whenever DOCUMENT_BACKUP_ENABLED is enabled.
CREATE TABLE document_backup_copy_events (
  backup_copy_id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  backup_target TEXT NOT NULL CHECK (backup_target = 'r2-documents-v1'),
  backup_object_key TEXT NOT NULL UNIQUE,
  ciphertext_sha256 TEXT NOT NULL CHECK (length(ciphertext_sha256) = 64 AND ciphertext_sha256 NOT GLOB '*[^0-9a-f]*'),
  ciphertext_byte_size INTEGER NOT NULL CHECK (ciphertext_byte_size BETWEEN 17 AND 10485776),
  encryption_key_version INTEGER NOT NULL CHECK (encryption_key_version = 1),
  copied_at TEXT NOT NULL,
  FOREIGN KEY (tenant_id, document_id) REFERENCES documents (tenant_id, document_id) ON DELETE RESTRICT
);

CREATE INDEX document_backup_copies_by_document_time
  ON document_backup_copy_events (tenant_id, document_id, copied_at DESC, backup_copy_id DESC);

CREATE UNIQUE INDEX document_backup_copies_by_identity
  ON document_backup_copy_events (tenant_id, document_id, backup_copy_id);

ALTER TABLE documents
  ADD COLUMN backup_required INTEGER NOT NULL DEFAULT 0 CHECK (backup_required IN (0, 1));

CREATE TRIGGER documents_ready_requires_backup
BEFORE UPDATE OF status ON documents
WHEN NEW.status = 'ready'
  AND NEW.backup_required = 1
  AND NOT EXISTS (
    SELECT 1 FROM document_backup_copy_events
    WHERE tenant_id = NEW.tenant_id AND document_id = NEW.document_id
  )
BEGIN
  SELECT RAISE(ABORT, 'required document backup copy is missing');
END;

CREATE TRIGGER document_backup_copy_requires_uploading_document
BEFORE INSERT ON document_backup_copy_events
WHEN NOT EXISTS (
  SELECT 1 FROM documents
  WHERE tenant_id = NEW.tenant_id AND document_id = NEW.document_id
    AND status = 'uploading' AND backup_required = 1
)
BEGIN
  SELECT RAISE(ABORT, 'document backup copy is not expected for this upload');
END;

CREATE TRIGGER document_backup_copy_events_no_update
BEFORE UPDATE ON document_backup_copy_events
BEGIN
  SELECT RAISE(ABORT, 'document backup copy events are append-only');
END;

CREATE TRIGGER document_backup_copy_events_no_delete
BEFORE DELETE ON document_backup_copy_events
BEGIN
  SELECT RAISE(ABORT, 'document backup copy events are append-only');
END;
