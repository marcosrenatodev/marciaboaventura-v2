-- Better Auth 1.7.25 schema plus one-shot first-owner setup state.
-- The initial scaffold's users table represented a tenant link, not an auth user.
ALTER TABLE users RENAME TO legacy_tenant_users;

CREATE TABLE user (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  emailVerified INTEGER NOT NULL DEFAULT 0,
  image TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE session (
  id TEXT PRIMARY KEY NOT NULL,
  expiresAt TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  ipAddress TEXT,
  userAgent TEXT,
  userId TEXT NOT NULL,
  FOREIGN KEY (userId) REFERENCES user(id) ON DELETE CASCADE
);
CREATE INDEX session_userId_idx ON session (userId);

CREATE TABLE account (
  id TEXT PRIMARY KEY NOT NULL,
  accountId TEXT NOT NULL,
  providerId TEXT NOT NULL,
  userId TEXT NOT NULL,
  accessToken TEXT,
  refreshToken TEXT,
  idToken TEXT,
  accessTokenExpiresAt TEXT,
  refreshTokenExpiresAt TEXT,
  scope TEXT,
  password TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  FOREIGN KEY (userId) REFERENCES user(id) ON DELETE CASCADE
);
CREATE INDEX account_userId_idx ON account (userId);

CREATE TABLE verification (
  id TEXT PRIMARY KEY NOT NULL,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expiresAt TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
CREATE INDEX verification_identifier_idx ON verification (identifier);

CREATE TABLE tenant_memberships (
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'member')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (tenant_id, user_id),
  FOREIGN KEY (tenant_id) REFERENCES organizations (tenant_id) ON DELETE RESTRICT,
  FOREIGN KEY (user_id) REFERENCES user (id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX tenant_memberships_single_owner ON tenant_memberships (tenant_id) WHERE role = 'owner';
CREATE INDEX tenant_memberships_by_user ON tenant_memberships (user_id, tenant_id);

CREATE TABLE setup_control (
  id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
  status TEXT NOT NULL CHECK (status IN ('ready', 'pending', 'complete')) DEFAULT 'ready',
  candidate_email TEXT,
  claim_id TEXT,
  lease_expires_at TEXT,
  completed_at TEXT
);
INSERT INTO setup_control (id, status) VALUES (1, 'ready');
