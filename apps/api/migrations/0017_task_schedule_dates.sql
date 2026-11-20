ALTER TABLE tasks ADD COLUMN scheduled_on TEXT
  CHECK (scheduled_on IS NULL OR (length(scheduled_on) = 10 AND date(scheduled_on) = scheduled_on));

UPDATE tasks
SET scheduled_on = substr(scheduled_for, 1, 10)
WHERE scheduled_for IS NOT NULL AND length(scheduled_for) >= 10;

CREATE INDEX tasks_by_tenant_status_scheduled_on
  ON tasks (tenant_id, status, scheduled_on);
