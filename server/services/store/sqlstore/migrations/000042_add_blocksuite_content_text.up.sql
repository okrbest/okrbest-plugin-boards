-- ============================================================
-- CUSTOM MIGRATION: Add content_text column to blocksuite_docs
-- Date: 2025-01-25
--
-- Purpose: Store plaintext content for search/indexing
-- Note: This is a custom migration. Keep this in mind when
--       merging upstream Focalboard updates.
-- ============================================================

{{ addColumnIfNeeded "blocksuite_docs" "content_text" "TEXT" ""}}

{{if .postgres}}
    COMMENT ON COLUMN {{.prefix}}blocksuite_docs.content_text IS 'Plaintext content extracted from BlockSuite document for search/indexing';
{{end}}
