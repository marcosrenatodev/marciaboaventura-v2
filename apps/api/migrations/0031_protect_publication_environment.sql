-- A hash shared by homologation and production must never silently move an
-- existing publication and its review history between environments.
CREATE TRIGGER protect_publication_environment
BEFORE UPDATE OF source_environment ON court_publications
WHEN OLD.source_environment <> NEW.source_environment
BEGIN
  SELECT RAISE(ABORT, 'publication_environment_conflict');
END;
