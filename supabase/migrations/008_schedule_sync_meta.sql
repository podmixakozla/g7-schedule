-- =====================================================
-- 008_schedule_sync_meta.sql
-- Tracks automatic 2-hour schedule synchronization from nmu.org.ua (ЕТФ Excel).
-- =====================================================

CREATE TABLE IF NOT EXISTS schedule_sync_meta (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  last_synced_at timestamptz,
  source_page_url text,
  source_file_url text,
  quarter int,
  lessons_count int DEFAULT 0,
  last_error text
);

INSERT INTO schedule_sync_meta (id, source_page_url)
VALUES (1, 'https://nmu.org.ua/main/students/schedule/')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE schedule_sync_meta ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Public read schedule_sync_meta'
    AND tablename = 'schedule_sync_meta'
  ) THEN
    CREATE POLICY "Public read schedule_sync_meta" ON schedule_sync_meta
      FOR SELECT USING (true);
  END IF;
END $$;
