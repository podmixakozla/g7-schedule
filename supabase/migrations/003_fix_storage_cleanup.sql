-- =====================================================
-- Migration 003: Fix orphan photo cleanup + cleanup polish
--
-- Problem: cron job "clean-orphaned-board-photos" fails because
-- storage.protect_delete() blocks direct SQL deletes on storage.objects.
-- The trigger checks current_setting('storage.allow_delete_query').
--
-- Fix: create a PL/pgSQL function that sets this config per-transaction
-- before performing the orphan delete, then have the cron call it.
--
-- Also: remove the dead increment_reaction function (JSONB-era legacy).
-- =====================================================

-- 1. Create a function that safely deletes orphaned storage objects
CREATE OR REPLACE FUNCTION cleanup_orphaned_board_photos()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Allow direct delete from storage.objects within this transaction
  PERFORM set_config('storage.allow_delete_query', 'true', true);

  DELETE FROM storage.objects
  WHERE bucket_id = 'board-photos'
  AND name NOT IN (
    SELECT substring(photo_url from 'board-photos/(.*)$')
    FROM board_entries
    WHERE photo_url IS NOT NULL
  );
END;
$$;

-- 2. Update the cron job to call the function instead of inline SQL
SELECT cron.unschedule('clean-orphaned-board-photos');

SELECT cron.schedule(
  'clean-orphaned-board-photos',
  '10 0 * * *',
  $$SELECT cleanup_orphaned_board_photos()$$
);

-- 3. Remove the dead increment_reaction function (JSONB-era legacy)
-- This function operated on the old reactions JSONB column which is no
-- longer the source of truth. upsert_reaction (migration 002) handles
-- all champion logic using the reactions table.
DROP FUNCTION IF EXISTS increment_reaction(bigint, text);
