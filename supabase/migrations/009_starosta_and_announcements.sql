-- =====================================================
-- 009_starosta_and_announcements.sql
-- Adds starosta role management and important announcements ("Важливі новини").
-- =====================================================

-- 1. Add is_starosta column to telegram_users
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'telegram_users' AND column_name = 'is_starosta'
  ) THEN
    ALTER TABLE telegram_users ADD COLUMN is_starosta boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- 2. Table starosta_roles keyed by telegram_id (allows assigning starosta even before full auth)
CREATE TABLE IF NOT EXISTS starosta_roles (
  telegram_id bigint PRIMARY KEY,
  assigned_by bigint,
  assigned_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE starosta_roles ENABLE ROW LEVEL SECURITY;

-- 3. Table announcements for important messages from starostas / admin
CREATE TABLE IF NOT EXISTS announcements (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  author_telegram_id bigint NOT NULL,
  author_name text NOT NULL,
  author_username text,
  content text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_announcements_active_created
  ON announcements (is_active, created_at DESC);

ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Public read announcements'
    AND tablename = 'announcements'
  ) THEN
    CREATE POLICY "Public read announcements" ON announcements
      FOR SELECT USING (true);
  END IF;
END $$;
