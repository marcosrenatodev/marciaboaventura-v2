-- First-use onboarding progress is private to the signed-in user and tenant.
-- This stores only the versioned tour status and step, never client/case data.
CREATE TABLE guided_tour_progress (
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  tour_id TEXT NOT NULL CHECK (tour_id = 'office_basics_v1'),
  status TEXT NOT NULL CHECK (status IN ('in_progress', 'skipped', 'completed')),
  step_index INTEGER NOT NULL CHECK (step_index BETWEEN 0 AND 5),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, user_id, tour_id),
  CHECK (status <> 'completed' OR step_index = 5),
  FOREIGN KEY (tenant_id, user_id)
    REFERENCES tenant_memberships (tenant_id, user_id) ON DELETE RESTRICT
);
