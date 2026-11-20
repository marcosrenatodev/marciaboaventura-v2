-- Track which areas the signed-in user has already learned, without storing case data.
CREATE TABLE guided_tour_screen_progress (
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  tour_id TEXT NOT NULL CHECK (tour_id = 'office_basics_v1'),
  screen_id TEXT NOT NULL CHECK (screen_id IN ('today', 'cases', 'calendar', 'finance', 'research', 'files')),
  seen_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, user_id, tour_id, screen_id),
  FOREIGN KEY (tenant_id, user_id, tour_id)
    REFERENCES guided_tour_progress (tenant_id, user_id, tour_id) ON DELETE RESTRICT
);

-- A previously viewed global-tour step counts as an explanation of that screen.
INSERT INTO guided_tour_screen_progress (tenant_id, user_id, tour_id, screen_id, seen_at)
SELECT tenant_id, user_id, tour_id, 'today', updated_at FROM guided_tour_progress WHERE step_index >= 0;
INSERT INTO guided_tour_screen_progress (tenant_id, user_id, tour_id, screen_id, seen_at)
SELECT tenant_id, user_id, tour_id, 'cases', updated_at FROM guided_tour_progress WHERE step_index >= 1;
INSERT INTO guided_tour_screen_progress (tenant_id, user_id, tour_id, screen_id, seen_at)
SELECT tenant_id, user_id, tour_id, 'calendar', updated_at FROM guided_tour_progress WHERE step_index >= 2;
INSERT INTO guided_tour_screen_progress (tenant_id, user_id, tour_id, screen_id, seen_at)
SELECT tenant_id, user_id, tour_id, 'finance', updated_at FROM guided_tour_progress WHERE step_index >= 3;
INSERT INTO guided_tour_screen_progress (tenant_id, user_id, tour_id, screen_id, seen_at)
SELECT tenant_id, user_id, tour_id, 'research', updated_at FROM guided_tour_progress WHERE step_index >= 4;
INSERT INTO guided_tour_screen_progress (tenant_id, user_id, tour_id, screen_id, seen_at)
SELECT tenant_id, user_id, tour_id, 'files', updated_at FROM guided_tour_progress WHERE step_index >= 5;
