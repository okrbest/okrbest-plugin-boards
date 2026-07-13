-- ============================================================
-- CUSTOM MIGRATION: Add has_acl_entries flag to boards
--
-- Purpose: Board list/search need to expand results to boards a user
--          can reach via ACL (department/position/department+position)
--          or a full-visibility position, in addition to plain
--          membership/open-board rules. To avoid scanning every board's
--          Properties JSON on every list/search request, this flag lets
--          the candidate query filter at the DB level via an index.
-- ============================================================

ALTER TABLE {{.prefix}}boards ADD COLUMN IF NOT EXISTS has_acl_entries BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE {{.prefix}}boards_history ADD COLUMN IF NOT EXISTS has_acl_entries BOOLEAN NOT NULL DEFAULT false;

{{ createIndexIfNeeded "boards" "team_id, has_acl_entries" }}
