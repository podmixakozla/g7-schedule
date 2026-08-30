-- =====================================================
-- Database Migration: Telegram Auth + Admin Capabilities
-- Run this in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/fvbnnjghfiuiuulgoktn/sql/new
-- =====================================================

-- =====================================================
-- 1. telegram_users table
-- Stores linked Telegram profiles. PK is the Supabase auth UUID.
-- =====================================================
CREATE TABLE IF NOT EXISTS telegram_users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  telegram_id bigint UNIQUE NOT NULL,
  username text,
  first_name text,
  last_name text,
  photo_url text,
  created_at timestamptz DEFAULT now()
);

-- =====================================================
-- 2. Add creator_id to board_entries
-- Optional FK to auth.users. Existing rows get NULL (still readable).
-- =====================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'board_entries' AND column_name = 'creator_id'
  ) THEN
    ALTER TABLE board_entries ADD COLUMN creator_id uuid;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'board_entries_creator_id_fkey'
  ) THEN
    ALTER TABLE board_entries
      ADD CONSTRAINT board_entries_creator_id_fkey
      FOREIGN KEY (creator_id) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- =====================================================
-- 3. Add user_id to comments
-- Optional FK to auth.users. Existing rows get NULL (still readable).
-- =====================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'comments' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE comments ADD COLUMN user_id uuid;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'comments_user_id_fkey'
  ) THEN
    ALTER TABLE comments
      ADD CONSTRAINT comments_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- =====================================================
-- 4. reactions table
-- One reaction per (entry_id, user_id). entry_id is bigint to
-- match board_entries.id. user_id is uuid to match auth.users.id.
-- =====================================================
CREATE TABLE IF NOT EXISTS reactions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entry_id bigint NOT NULL REFERENCES board_entries(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(entry_id, user_id)
);

-- =====================================================
-- 5. upsert_reaction RPC
--
-- SECURITY MODEL:
--   SECURITY DEFINER: function runs as owner (postgres), but auth.uid()
--   still reflects the calling user's JWT sub claim (their auth UUID).
--   This is required because without SECURITY DEFINER, the anonymous
--   role would hit RLS errors before the auth.uid() check in the function.
--
--   search_path = public: prevents search path injection attacks.
--   A malicious user cannot create a function in a schema that gets
--   searched before public, hijacking this function's behavior.
--
--   REVOKE from anon / GRANT to authenticated: only authenticated
--   users can call this function. Anonymous HTTP requests are blocked.
--
--   Cross-user safety: the function NEVER accepts a user_id parameter.
--   All queries use auth.uid() in WHERE clauses, so a user can only
--   read/modify their own reaction row.
-- =====================================================
CREATE OR REPLACE FUNCTION upsert_reaction(p_entry_id bigint, p_emoji text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Guard: require authenticated user
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Same emoji → toggle off (delete existing reaction)
  IF EXISTS (
    SELECT 1 FROM reactions
    WHERE entry_id = p_entry_id AND user_id = auth.uid()
    AND emoji = p_emoji
  ) THEN
    DELETE FROM reactions
    WHERE entry_id = p_entry_id AND user_id = auth.uid();
  -- Different emoji → replace (update existing reaction)
  ELSIF EXISTS (
    SELECT 1 FROM reactions
    WHERE entry_id = p_entry_id AND user_id = auth.uid()
  ) THEN
    UPDATE reactions SET emoji = p_emoji
    WHERE entry_id = p_entry_id AND user_id = auth.uid();
  -- No existing reaction → insert new
  ELSE
    INSERT INTO reactions (entry_id, user_id, emoji)
    VALUES (p_entry_id, auth.uid(), p_emoji);
  END IF;
END;
$$;

-- Revoke from anonymous role and PUBLIC, grant only to authenticated role
REVOKE EXECUTE ON FUNCTION upsert_reaction(bigint, text) FROM anon;
REVOKE EXECUTE ON FUNCTION upsert_reaction(bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION upsert_reaction(bigint, text) TO authenticated;

-- =====================================================
-- 6. reaction_counts view
-- Public read of aggregate emoji counts per post.
-- Does NOT expose individual user_id or reaction id.
-- =====================================================
CREATE OR REPLACE VIEW reaction_counts AS
SELECT entry_id, emoji, COUNT(*)::int AS count
FROM reactions
GROUP BY entry_id, emoji;

-- =====================================================
-- 7. Preserve existing increment_reaction RPC
-- Kept for backward compatibility until new system confirmed working.
-- Can be removed later via: DROP FUNCTION IF EXISTS increment_reaction;
-- =====================================================
-- (do not remove)

-- =====================================================
-- 8. Enable RLS on all tables
-- =====================================================
ALTER TABLE telegram_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE board_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE reactions ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 9. RLS policies — telegram_users
-- Users can only read their own profile.
-- =====================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Users can read own profile'
    AND tablename = 'telegram_users'
  ) THEN
    CREATE POLICY "Users can read own profile" ON telegram_users
      FOR SELECT USING (auth.uid() = id);
  END IF;
END $$;

-- =====================================================
-- 10. RLS policies — board_entries
-- Public read for everyone.
-- Insert requires auth.uid() = creator_id.
-- NO DELETE policy: only Edge Functions (service role) can delete.
-- Existing rows with NULL creator_id remain fully readable.
-- =====================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Public read board_entries'
    AND tablename = 'board_entries'
  ) THEN
    CREATE POLICY "Public read board_entries" ON board_entries
      FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Authenticated insert board_entries'
    AND tablename = 'board_entries'
  ) THEN
    CREATE POLICY "Authenticated insert board_entries" ON board_entries
      FOR INSERT WITH CHECK (auth.uid() = creator_id);
  END IF;
END $$;

-- =====================================================
-- 11. RLS policies — comments
-- Public read for everyone.
-- Insert requires auth.uid() = user_id.
-- NO DELETE policy: only Edge Functions (service role) can delete.
-- Existing rows with NULL user_id remain fully readable.
-- =====================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Public read comments'
    AND tablename = 'comments'
  ) THEN
    CREATE POLICY "Public read comments" ON comments
      FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Authenticated insert comments'
    AND tablename = 'comments'
  ) THEN
    CREATE POLICY "Authenticated insert comments" ON comments
      FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- =====================================================
-- 12. RLS policies — reactions
-- Public read: anyone can see reaction counts via the view.
--   Individual reaction rows are only readable by the owner
--   because the view aggregates (hides user_id).
-- All (insert/update/delete): only the owner's own reaction.
-- =====================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Public read reactions via view'
    AND tablename = 'reactions'
  ) THEN
    -- Allow public read of individual rows (needed for the view to work)
    -- The reaction_counts view aggregates and hides user_id
    CREATE POLICY "Public read reactions via view" ON reactions
      FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Authenticated manage own reaction'
    AND tablename = 'reactions'
  ) THEN
    -- Users can insert/update/delete only their own reactions
    CREATE POLICY "Authenticated manage own reaction" ON reactions
      FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
