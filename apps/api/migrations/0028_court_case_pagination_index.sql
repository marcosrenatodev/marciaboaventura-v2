CREATE INDEX IF NOT EXISTS court_cases_by_tenant_created_case
  ON court_cases (tenant_id, created_at DESC, case_id DESC)
  WHERE deleted_at IS NULL;
