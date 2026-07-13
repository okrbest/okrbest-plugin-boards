ALTER TABLE {{.prefix}}boards DROP COLUMN IF EXISTS has_acl_entries;
ALTER TABLE {{.prefix}}boards_history DROP COLUMN IF EXISTS has_acl_entries;
