-- Consultas genéricas salvas por escritório; resultados continuam nas fontes oficiais.
CREATE TABLE legal_researches (
  tenant_id TEXT NOT NULL,
  research_id TEXT NOT NULL,
  query TEXT NOT NULL CHECK (length(trim(query)) BETWEEN 2 AND 600),
  court_id TEXT NOT NULL CHECK (court_id IN ('TJPR', 'TJSC', 'TJRS', 'TRF4', 'STJ', 'STF')),
  source_url TEXT NOT NULL CHECK (source_url LIKE 'https://%'),
  created_at TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL,
  PRIMARY KEY (tenant_id, research_id),
  FOREIGN KEY (tenant_id) REFERENCES organizations (tenant_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, created_by_user_id) REFERENCES tenant_memberships (tenant_id, user_id) ON DELETE RESTRICT
);
CREATE INDEX legal_researches_by_tenant_created ON legal_researches (tenant_id, created_at DESC);

CREATE TABLE legal_research_audit_events (
  tenant_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  research_id TEXT NOT NULL,
  actor_user_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action = 'created'),
  created_at TEXT NOT NULL,
  request_id TEXT NOT NULL,
  PRIMARY KEY (tenant_id, event_id),
  FOREIGN KEY (tenant_id, research_id) REFERENCES legal_researches (tenant_id, research_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, actor_user_id) REFERENCES tenant_memberships (tenant_id, user_id) ON DELETE RESTRICT
);
CREATE INDEX legal_research_audit_by_tenant_created ON legal_research_audit_events (tenant_id, created_at);
