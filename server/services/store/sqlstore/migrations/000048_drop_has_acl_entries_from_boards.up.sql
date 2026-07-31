-- ============================================================
-- CUSTOM MIGRATION: Drop has_acl_entries flag from boards
--
-- Purpose: The department/position based board ACL feature has been
--          removed, so the flag that let board list/search pre-filter
--          candidates at the DB level no longer has a reader. Drop the
--          index first, then the columns: MySQL would otherwise keep a
--          narrowed index under the original name, while PostgreSQL
--          drops it along with the column.
-- ============================================================

{{ dropIndexIfNeeded "boards" "team_id, has_acl_entries" }}

{{ dropColumnIfNeeded "boards" "has_acl_entries" }}

{{ dropColumnIfNeeded "boards_history" "has_acl_entries" }}
