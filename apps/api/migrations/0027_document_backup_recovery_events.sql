-- Append-only operational evidence for backup recovery success and failure attempts.
CREATE TABLE document_backup_recovery_events (
  recovery_event_id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  backup_copy_id TEXT,
  actor_user_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  primary_failure TEXT NOT NULL CHECK (primary_failure IN (
    'primary_missing', 'primary_metadata_mismatch', 'primary_ciphertext_mismatch',
    'primary_decryption_failed', 'primary_storage_error'
  )),
  backup_outcome TEXT NOT NULL CHECK (backup_outcome IN (
    'recovered', 'copy_record_missing', 'backup_binding_unavailable', 'backup_lookup_error',
    'backup_object_missing', 'backup_metadata_mismatch', 'backup_ciphertext_mismatch',
    'backup_decryption_failed', 'backup_storage_error'
  )),
  primary_repaired INTEGER NOT NULL CHECK (primary_repaired IN (0, 1)),
  recovered_at TEXT NOT NULL,
  CHECK (
    (backup_outcome IN ('copy_record_missing', 'backup_binding_unavailable', 'backup_lookup_error') AND backup_copy_id IS NULL)
    OR (backup_outcome NOT IN ('copy_record_missing', 'backup_binding_unavailable', 'backup_lookup_error') AND backup_copy_id IS NOT NULL)
  ),
  CHECK (backup_outcome = 'recovered' OR primary_repaired = 0),
  FOREIGN KEY (tenant_id, document_id) REFERENCES documents (tenant_id, document_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, actor_user_id) REFERENCES tenant_memberships (tenant_id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, document_id, backup_copy_id)
    REFERENCES document_backup_copy_events (tenant_id, document_id, backup_copy_id) ON DELETE RESTRICT
);

CREATE INDEX document_backup_recoveries_by_document_time
  ON document_backup_recovery_events (tenant_id, document_id, recovered_at DESC, recovery_event_id DESC);

CREATE TRIGGER document_backup_recovery_events_no_update
BEFORE UPDATE ON document_backup_recovery_events
BEGIN
  SELECT RAISE(ABORT, 'document backup recovery events are append-only');
END;

CREATE TRIGGER document_backup_recovery_events_no_delete
BEFORE DELETE ON document_backup_recovery_events
BEGIN
  SELECT RAISE(ABORT, 'document backup recovery events are append-only');
END;
