-- Schema vazio para o spike D1. Não cria contas, sessões ou dados de clientes.
-- IDs são opacos; não usar CPF, e-mail, nome ou número CNJ como identificador.
-- D1 habilita foreign keys. Relações compostas impedem vínculo entre tenants.

CREATE TABLE organizations (
  tenant_id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(tenant_id)) > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Modelo provisório de vínculo ao escritório; não implementa autenticação.
-- O provedor de identidade e a ligação com usuários dependem do spike de auth.
CREATE TABLE users (
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL CHECK (length(trim(user_id)) > 0),
  role TEXT NOT NULL CHECK (role IN ('owner', 'member')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (tenant_id, user_id),
  FOREIGN KEY (tenant_id) REFERENCES organizations (tenant_id) ON DELETE RESTRICT
);

CREATE TABLE cases (
  tenant_id TEXT NOT NULL,
  case_id TEXT NOT NULL CHECK (length(trim(case_id)) > 0),
  created_by_user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (tenant_id, case_id),
  FOREIGN KEY (tenant_id) REFERENCES organizations (tenant_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, created_by_user_id)
    REFERENCES users (tenant_id, user_id) ON DELETE RESTRICT
);

CREATE INDEX cases_by_tenant_and_status ON cases (tenant_id, status, created_at);
CREATE INDEX cases_by_creator ON cases (tenant_id, created_by_user_id);
