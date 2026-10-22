-- =====================================================
-- 011_announcement_photos.sql
-- Adds photo attachments support to starosta announcements
-- =====================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'announcements' AND column_name = 'photo_url'
  ) THEN
    ALTER TABLE announcements ADD COLUMN photo_url text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'announcements' AND column_name = 'photo_urls'
  ) THEN
    ALTER TABLE announcements ADD COLUMN photo_urls jsonb NOT NULL DEFAULT '[]'::jsonb;
  END IF;
END $$;
