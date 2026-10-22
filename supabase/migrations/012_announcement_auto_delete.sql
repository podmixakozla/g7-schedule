-- =====================================================
-- 012_announcement_auto_delete.sql
-- Adds telegram_messages (for deleting from bot chat) and expires_at (for timed auto-deletion)
-- =====================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'announcements' AND column_name = 'telegram_messages'
  ) THEN
    ALTER TABLE announcements ADD COLUMN telegram_messages jsonb NOT NULL DEFAULT '[]'::jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'announcements' AND column_name = 'expires_at'
  ) THEN
    ALTER TABLE announcements ADD COLUMN expires_at timestamptz;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_announcements_expires_at
  ON announcements (expires_at)
  WHERE expires_at IS NOT NULL;
