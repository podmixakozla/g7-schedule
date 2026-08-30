-- =====================================================
-- Migration 002: Champion logic in upsert_reaction
-- The old increment_reaction updated a JSONB reactions column
-- that no longer feeds the UI. upsert_reaction (migration 001)
-- manages the reactions table but never touched champion flags.
-- This migration replaces upsert_reaction with one that also
-- recomputes is_week_champion / is_month_champion after every
-- mutation, based on actual row counts in the reactions table.
-- =====================================================

CREATE OR REPLACE FUNCTION upsert_reaction(p_entry_id bigint, p_emoji text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_total int;
  entry_created timestamptz;
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

  -- ── Champion recomputation ──
  -- Count total reactions for this entry after the mutation
  SELECT COUNT(*)::int INTO new_total
  FROM reactions WHERE entry_id = p_entry_id;

  SELECT created_at INTO entry_created
  FROM board_entries WHERE id = p_entry_id;

  -- Week champion: entries created within the last 7 days
  IF entry_created > now() - interval '7 days' THEN
    -- Find the entry with the most reactions in the 7-day window
    WITH week_candidates AS (
      SELECT be.id, COUNT(r.id)::int AS total
      FROM board_entries be
      LEFT JOIN reactions r ON r.entry_id = be.id
      WHERE be.created_at > now() - interval '7 days'
      GROUP BY be.id
      ORDER BY total DESC, be.created_at ASC
      LIMIT 1
    )
    UPDATE board_entries
    SET is_week_champion = (id = (SELECT id FROM week_candidates))
    WHERE created_at > now() - interval '7 days';

    -- Clear stale week champion flag for entries outside the window
    UPDATE board_entries
    SET is_week_champion = false
    WHERE created_at <= now() - interval '7 days'
      AND is_week_champion = true;
  END IF;

  -- Month champion: entries created within the last 30 days
  IF entry_created > now() - interval '30 days' THEN
    WITH month_candidates AS (
      SELECT be.id, COUNT(r.id)::int AS total
      FROM board_entries be
      LEFT JOIN reactions r ON r.entry_id = be.id
      WHERE be.created_at > now() - interval '30 days'
      GROUP BY be.id
      ORDER BY total DESC, be.created_at ASC
      LIMIT 1
    )
    UPDATE board_entries
    SET is_month_champion = (id = (SELECT id FROM month_candidates))
    WHERE created_at > now() - interval '30 days';

    -- Clear stale month champion flag for entries outside the window
    UPDATE board_entries
    SET is_month_champion = false
    WHERE created_at <= now() - interval '30 days'
      AND is_month_champion = true;
  END IF;
END;
$$;

-- Revoke from anonymous role and PUBLIC, grant only to authenticated role
REVOKE EXECUTE ON FUNCTION upsert_reaction(bigint, text) FROM anon;
REVOKE EXECUTE ON FUNCTION upsert_reaction(bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION upsert_reaction(bigint, text) TO authenticated;
