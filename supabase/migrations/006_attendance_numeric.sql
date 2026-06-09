-- Migration 006: Change supervisor assignment attendance to numeric
-- This allows storing attendance values like 0.5, 1.0, 1.5, 2.0.

-- 1. Alter is_present column to NUMERIC(3, 1)
ALTER TABLE daily_supervisor_assignments
  ALTER COLUMN is_present TYPE NUMERIC(3, 1) USING (CASE WHEN is_present THEN 1.0 ELSE 0.0 END);

-- 2. Update default value
ALTER TABLE daily_supervisor_assignments
  ALTER COLUMN is_present SET DEFAULT 1.0;
