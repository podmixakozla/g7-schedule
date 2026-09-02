-- =====================================================
-- Add group_code to schedule_lessons
-- Supports АР-26-1 (default) and АР-26ск-1 subgroups.
-- АР-26ск-1 inherits from АР-26-1 when no override exists.
-- =====================================================

-- Add group_code column with default.
-- All existing rows automatically get 'AR-26-1'.
ALTER TABLE schedule_lessons
  ADD COLUMN IF NOT EXISTS group_code text NOT NULL DEFAULT 'AR-26-1';

-- Drop the old unique constraint (day_of_week, pair_number)
DROP INDEX IF EXISTS idx_schedule_lessons_day_pair;

-- New unique constraint: one lesson per (day_of_week, pair_number, group_code)
CREATE UNIQUE INDEX IF NOT EXISTS idx_schedule_lessons_day_pair_group
  ON schedule_lessons (day_of_week, pair_number, group_code);
