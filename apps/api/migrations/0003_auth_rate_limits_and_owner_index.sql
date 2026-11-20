-- Rate-limit storage is shared through D1 across Worker isolates.
CREATE TABLE IF NOT EXISTS rateLimit (
  id TEXT PRIMARY KEY NOT NULL,
  key TEXT NOT NULL UNIQUE,
  count INTEGER NOT NULL,
  lastRequest INTEGER NOT NULL
);

-- Keep one owner per tenant; setup_control is the global first-owner gate.
DROP INDEX IF EXISTS tenant_memberships_single_owner;
CREATE UNIQUE INDEX tenant_memberships_single_owner
  ON tenant_memberships (tenant_id) WHERE role = 'owner';
