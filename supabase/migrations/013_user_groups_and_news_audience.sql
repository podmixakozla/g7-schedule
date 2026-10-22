-- =====================================================
-- 013_user_groups_and_news_audience.sql
-- 1. Adds user_group to telegram_users
-- 2. Adds target_groups to announcements
-- 3. Adds set_my_group RPC function
-- =====================================================

-- 1. telegram_users: user_group column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'telegram_users' AND column_name = 'user_group'
  ) THEN
    ALTER TABLE telegram_users ADD COLUMN user_group text;
    ALTER TABLE telegram_users ADD CONSTRAINT telegram_users_user_group_check
      CHECK (user_group IS NULL OR user_group IN ('AR-26-1', 'AR-26-2', 'AR-26sk-1'));
  END IF;
END $$;

-- 2. announcements: target_groups text[] column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'announcements' AND column_name = 'target_groups'
  ) THEN
    ALTER TABLE announcements ADD COLUMN target_groups text[] NOT NULL DEFAULT '{}'::text[];
  END IF;
END $$;

-- 3. RPC set_my_group
CREATE OR REPLACE FUNCTION set_my_group(target_group text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_res text;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF target_group IS NOT NULL AND target_group NOT IN ('AR-26-1', 'AR-26-2', 'AR-26sk-1') THEN
    RAISE EXCEPTION 'Invalid group code: %', target_group;
  END IF;

  UPDATE telegram_users
  SET user_group = target_group
  WHERE id = v_uid
  RETURNING user_group INTO v_res;

  RETURN jsonb_build_object('ok', true, 'user_group', v_res);
END;
$$;

GRANT EXECUTE ON FUNCTION set_my_group(text) TO authenticated;
GRANT EXECUTE ON FUNCTION set_my_group(text) TO anon;
