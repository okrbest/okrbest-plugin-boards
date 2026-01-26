-- ============================================================
-- CUSTOM MIGRATION: Add last_diff_summary column to blocksuite_docs
-- Date: 2025-01-25
--
-- Purpose: Store last diff summary for change tracking
-- Note: This is a custom migration. Keep this in mind when
--       merging upstream Focalboard updates.
-- ============================================================

{{ addColumnIfNeeded "blocksuite_docs" "last_diff_summary" "TEXT" ""}}

{{if .postgres}}
    COMMENT ON COLUMN {{.prefix}}blocksuite_docs.last_diff_summary IS 'Last diff summary for BlockSuite document change tracking';
{{end}}
