CREATE INDEX IF NOT EXISTS court_publications_by_first_seen
  ON court_publications (tenant_id, case_id, first_seen_at DESC, source_hash DESC);
