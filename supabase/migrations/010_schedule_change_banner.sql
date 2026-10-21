-- =====================================================
-- 010_schedule_change_banner.sql
-- Stores latest schedule change summary for the accent pill in #nowCard.
-- =====================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'schedule_sync_meta' AND column_name = 'last_change_at'
  ) THEN
    ALTER TABLE schedule_sync_meta ADD COLUMN last_change_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'schedule_sync_meta' AND column_name = 'last_change_summary'
  ) THEN
    ALTER TABLE schedule_sync_meta ADD COLUMN last_change_summary jsonb;
  END IF;
END $$;
