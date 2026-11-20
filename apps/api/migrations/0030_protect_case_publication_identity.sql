-- Preserve the identity associated with already saved DJEN observations even
-- if a future code path updates court_cases without the API's guard.
CREATE TRIGGER protect_case_publication_identity
BEFORE UPDATE OF case_number ON court_cases
WHEN REPLACE(REPLACE(REPLACE(COALESCE(OLD.case_number, ''), '.', ''), '-', ''), ' ', '')
  <> REPLACE(REPLACE(REPLACE(COALESCE(NEW.case_number, ''), '.', ''), '-', ''), ' ', '')
  AND (EXISTS (SELECT 1 FROM court_publications WHERE tenant_id = OLD.tenant_id AND case_id = OLD.case_id)
    OR EXISTS (SELECT 1 FROM court_publication_syncs WHERE tenant_id = OLD.tenant_id AND case_id = OLD.case_id))
BEGIN
  SELECT RAISE(ABORT, 'case_number_has_publication_history');
END;
