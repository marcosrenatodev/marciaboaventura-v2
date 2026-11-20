-- Better Auth 1.7.25 two-factor plugin: TOTP plus encrypted, one-time backup codes.
-- Keep this forward-only; do not rewrite the existing authentication migrations.
ALTER TABLE user ADD COLUMN twoFactorEnabled INTEGER NOT NULL DEFAULT 0;

CREATE TABLE twoFactor (
  id TEXT PRIMARY KEY NOT NULL,
  secret TEXT NOT NULL,
  backupCodes TEXT NOT NULL,
  userId TEXT NOT NULL,
  verified INTEGER DEFAULT 1,
  failedVerificationCount INTEGER DEFAULT 0,
  lockedUntil TEXT,
  FOREIGN KEY (userId) REFERENCES user(id) ON DELETE CASCADE
);

CREATE INDEX twoFactor_secret_idx ON twoFactor (secret);
CREATE INDEX twoFactor_userId_idx ON twoFactor (userId);
