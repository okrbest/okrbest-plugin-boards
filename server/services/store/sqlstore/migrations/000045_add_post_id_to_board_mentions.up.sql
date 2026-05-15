-- ============================================================
-- CUSTOM MIGRATION: Add post_id column to board_mentions (no-op)
-- Date: 2026-05-12
--
-- Note: post_id column is now included in migration 000044.
--       This migration is kept as a no-op for environments that
--       already ran 000044 without post_id.
-- ============================================================

ALTER TABLE {{.prefix}}board_mentions ADD COLUMN IF NOT EXISTS post_id VARCHAR(36) DEFAULT '';

{{ createIndexIfNeeded "board_mentions" "post_id, user_id" }}
{{ createIndexIfNeeded "board_mentions" "user_id, card_id, replied_at" }}
