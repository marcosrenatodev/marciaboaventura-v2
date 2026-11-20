-- Version the first-party simple electronic signature consent while preserving immutable v1 records.
DROP TRIGGER document_signing_records_no_update;
DROP TRIGGER document_signing_records_no_delete;

CREATE TABLE document_signing_records_next (
  tenant_id TEXT NOT NULL,
  signature_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  document_sha256 TEXT NOT NULL CHECK (length(document_sha256) = 64 AND document_sha256 NOT GLOB '*[^0-9a-f]*'),
  signer_user_id TEXT NOT NULL,
  signer_name TEXT NOT NULL CHECK (length(trim(signer_name)) BETWEEN 1 AND 120),
  signer_email TEXT NOT NULL CHECK (length(trim(signer_email)) BETWEEN 3 AND 320),
  confirmed_name TEXT NOT NULL CHECK (length(trim(confirmed_name)) BETWEEN 1 AND 120),
  consent_version TEXT NOT NULL CHECK (consent_version IN ('v1', 'v2')),
  consent_text TEXT NOT NULL CHECK (length(consent_text) BETWEEN 1 AND 1000),
  consented_at TEXT NOT NULL,
  request_id TEXT NOT NULL CHECK (length(request_id) BETWEEN 1 AND 160),
  receipt_sha256 TEXT NOT NULL CHECK (length(receipt_sha256) = 64 AND receipt_sha256 NOT GLOB '*[^0-9a-f]*'),
  PRIMARY KEY (tenant_id, signature_id),
  UNIQUE (tenant_id, document_id, signer_user_id, document_sha256, consent_version),
  FOREIGN KEY (tenant_id, document_id) REFERENCES documents (tenant_id, document_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, signer_user_id) REFERENCES tenant_memberships (tenant_id, user_id) ON DELETE RESTRICT
);

INSERT INTO document_signing_records_next (
  tenant_id, signature_id, document_id, document_sha256, signer_user_id, signer_name, signer_email,
  confirmed_name, consent_version, consent_text, consented_at, request_id, receipt_sha256
)
SELECT tenant_id, signature_id, document_id, document_sha256, signer_user_id, signer_name, signer_email,
  confirmed_name, consent_version, consent_text, consented_at, request_id, receipt_sha256
FROM document_signing_records;

DROP TABLE document_signing_records;
ALTER TABLE document_signing_records_next RENAME TO document_signing_records;

CREATE INDEX document_signing_records_by_document
  ON document_signing_records (tenant_id, document_id, consented_at DESC, signature_id DESC);

CREATE TRIGGER document_signing_records_no_update
BEFORE UPDATE ON document_signing_records
BEGIN
  SELECT RAISE(ABORT, 'document_signing_records_are_immutable');
END;

CREATE TRIGGER document_signing_records_no_delete
BEFORE DELETE ON document_signing_records
BEGIN
  SELECT RAISE(ABORT, 'document_signing_records_are_immutable');
END;
