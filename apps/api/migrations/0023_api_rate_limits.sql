-- D1-backed fixed-window limits shared by every Worker isolate.
-- Bucket keys are HMACs, so user, tenant, and source-IP identifiers stay private.
CREATE TABLE api_rate_limits (
  bucket_key TEXT PRIMARY KEY NOT NULL CHECK (length(bucket_key) = 64),
  window_start INTEGER NOT NULL CHECK (window_start >= 0),
  request_count INTEGER NOT NULL CHECK (request_count >= 1)
);
