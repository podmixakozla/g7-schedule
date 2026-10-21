-- =====================================================
-- 007_user_visits.sql
-- Tracks user visits with a rolling 7-day retention window.
-- Read access is restricted strictly to the administrator via Edge Function.
-- =====================================================

CREATE TABLE IF NOT EXISTS user_visits (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  telegram_id bigint,
  username text,
  first_name text,
  last_name text,
  photo_url text,
  group_code text DEFAULT 'AR-26-1',
  device text,
  visited_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_visits_visited_at
  ON user_visits (visited_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_visits_telegram_id
  ON user_visits (telegram_id, visited_at DESC);

ALTER TABLE user_visits ENABLE ROW LEVEL SECURITY;
-- No public RLS policies: only Edge Functions using service_role can read/write/prune.
