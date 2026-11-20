-- A repeated save of the same active court/question is the same saved search.
-- The digest avoids duplicating query text outside its existing column.
ALTER TABLE legal_researches ADD COLUMN idempotency_hash TEXT;

CREATE UNIQUE INDEX legal_researches_by_tenant_active_idempotency
  ON legal_researches (tenant_id, idempotency_hash)
  WHERE archived_at IS NULL AND idempotency_hash IS NOT NULL;

CREATE INDEX legal_researches_by_tenant_recently_archived
  ON legal_researches (tenant_id, archived_at DESC, created_at DESC, research_id DESC)
  WHERE archived_at IS NOT NULL;
