-- ============================================================
-- CUSTOM MIGRATION: Create board_mentions table
-- Date: 2026-05-11
--
-- Purpose: Store @mention events from boards/cards for dashboard
--          aggregation. Dashboard plugin reads (SELECT) this table.
-- Note: This is a custom migration. Keep this in mind when
--       merging upstream Focalboard updates.
-- ============================================================

CREATE TABLE IF NOT EXISTS {{.prefix}}board_mentions (
    id           VARCHAR(36) PRIMARY KEY,
    user_id      VARCHAR(36) NOT NULL,
    sender_id    VARCHAR(36) NOT NULL,
    block_id     VARCHAR(36) NOT NULL,
    board_id     VARCHAR(36) NOT NULL,
    card_id      VARCHAR(36) DEFAULT '',
    channel_id   VARCHAR(36),
    message      VARCHAR(512),
    post_id      VARCHAR(36) DEFAULT '',
    create_at    BIGINT NOT NULL,
    replied_at   BIGINT DEFAULT 0
) {{if .mysql}}DEFAULT CHARACTER SET utf8mb4{{end}};

{{ createIndexIfNeeded "board_mentions" "user_id, create_at" }}
{{ createIndexIfNeeded "board_mentions" "post_id, user_id" }}
{{ createIndexIfNeeded "board_mentions" "user_id, card_id, replied_at" }}
