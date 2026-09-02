-- =====================================================
-- Add group_code to telegram_users
-- Associates each user with a subgroup for schedule permissions.
-- =====================================================

ALTER TABLE telegram_users
  ADD COLUMN IF NOT EXISTS group_code text NOT NULL DEFAULT 'AR-26-1';
