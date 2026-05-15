-- ============================================================
-- CUSTOM MIGRATION: Fix board_mentions VARCHAR column sizes
-- Date: 2026-05-12
--
-- Purpose: Newboards IDs are 27 chars (prefix + 26-char ID),
--          so VARCHAR(26) is too small. Widen to VARCHAR(36)
--          to match the rest of the schema.
-- ============================================================

{{if .postgres}}
ALTER TABLE {{.prefix}}board_mentions ALTER COLUMN id TYPE VARCHAR(36);
ALTER TABLE {{.prefix}}board_mentions ALTER COLUMN user_id TYPE VARCHAR(36);
ALTER TABLE {{.prefix}}board_mentions ALTER COLUMN sender_id TYPE VARCHAR(36);
ALTER TABLE {{.prefix}}board_mentions ALTER COLUMN block_id TYPE VARCHAR(36);
ALTER TABLE {{.prefix}}board_mentions ALTER COLUMN board_id TYPE VARCHAR(36);
ALTER TABLE {{.prefix}}board_mentions ALTER COLUMN card_id TYPE VARCHAR(36);
ALTER TABLE {{.prefix}}board_mentions ALTER COLUMN channel_id TYPE VARCHAR(36);
ALTER TABLE {{.prefix}}board_mentions ALTER COLUMN post_id TYPE VARCHAR(36);
{{end}}

{{if .mysql}}
ALTER TABLE {{.prefix}}board_mentions MODIFY COLUMN id VARCHAR(36);
ALTER TABLE {{.prefix}}board_mentions MODIFY COLUMN user_id VARCHAR(36) NOT NULL;
ALTER TABLE {{.prefix}}board_mentions MODIFY COLUMN sender_id VARCHAR(36) NOT NULL;
ALTER TABLE {{.prefix}}board_mentions MODIFY COLUMN block_id VARCHAR(36) NOT NULL;
ALTER TABLE {{.prefix}}board_mentions MODIFY COLUMN board_id VARCHAR(36) NOT NULL;
ALTER TABLE {{.prefix}}board_mentions MODIFY COLUMN card_id VARCHAR(36) DEFAULT '';
ALTER TABLE {{.prefix}}board_mentions MODIFY COLUMN channel_id VARCHAR(36);
ALTER TABLE {{.prefix}}board_mentions MODIFY COLUMN post_id VARCHAR(36) DEFAULT '';
{{end}}

{{- /* SQLite uses dynamic typing; VARCHAR length is not enforced, so no changes needed */ -}}
