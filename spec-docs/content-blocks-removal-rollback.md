# Content Blocks Removal - Rollback Strategy

## Overview

This document describes the rollback strategy for removing the legacy content blocks system after BlockSuite migration.

## Prerequisites

Before starting any removal phase:

1. **Database Backup**: Always create a full backup
   ```bash
   # PostgreSQL
   pg_dump -t focalboard_blocks -t focalboard_blocks_history -t focalboard_blocksuite_docs dbname > backup_$(date +%Y%m%d).sql
   
   # MySQL
   mysqldump dbname focalboard_blocks focalboard_blocks_history focalboard_blocksuite_docs > backup_$(date +%Y%m%d).sql
   ```

2. **Migration Status Check**: Verify all cards are migrated
   ```
   GET /api/v2/statistics/migration
   ```
   Response should show:
   - `isMigrationComplete: true`
   - `cardsWithContentBlocksNotMigrated: 0`

## Phase-specific Rollback Procedures

### Phase 1A: UI Rendering Separation

**Risk Level**: Low

**Changes**:
- Feature flag `newBoardsEditor` always true
- CardDetail only renders BlockSuiteEditor

**Rollback**:
```bash
git revert <commit-hash>
```

No database changes. Instant rollback via git.

### Phase 1B: Webapp Content Block Code Removal

**Risk Level**: Medium

**Files Removed**:
- `webapp/src/blocks/textBlock.ts`, `imageBlock.ts`, etc.
- `webapp/src/components/content/*`
- `webapp/src/store/contents.ts`
- `webapp/src/components/contentBlock.tsx`

**Rollback**:
```bash
git checkout HEAD~1 -- webapp/src/blocks/textBlock.ts webapp/src/blocks/imageBlock.ts ...
# OR
git revert <commit-hash>
```

Rebuild and redeploy.

### Phase 1C: Gallery/Unfurl BlockSuite Implementation

**Risk Level**: Medium

**Changes**:
- Gallery card image extraction uses BlockSuite
- Unfurl preview uses BlockSuite

**Rollback**:
```bash
git revert <commit-hash>
```

Rebuild and redeploy.

### Phase 2: contentOrder Field Removal

**Risk Level**: Medium

**Changes**:
- `Card.contentOrder` field removed from model
- Server ignores contentOrder in import
- Client no longer sends contentOrder

**Rollback**:
1. Revert code changes: `git revert <commit-hash>`
2. If database migration was run, execute rollback migration

### Phase 3: Server API Removal

**Risk Level**: High

**Changes**:
- `server/api/content_blocks.go` removed
- `server/app/content_blocks.go` removed
- Blocks API rejects content block types

**Rollback**:
```bash
git revert <commit-hash>
```

Rebuild and redeploy.

### Phase 3+: Database Cleanup

**Risk Level**: High (Irreversible without backup)

**Changes**:
```sql
DELETE FROM focalboard_blocks WHERE type IN ('text', 'image', 'checkbox', ...);
DELETE FROM focalboard_blocks_history WHERE type IN ('text', 'image', 'checkbox', ...);
```

**Rollback**:
Restore from backup created before this phase.
```bash
# PostgreSQL
psql dbname < backup_YYYYMMDD.sql

# MySQL
mysql dbname < backup_YYYYMMDD.sql
```

## Emergency Rollback Checklist

1. [ ] Identify which phase caused the issue
2. [ ] Stop the Mattermost server
3. [ ] Restore database from backup (if Phase 3+ was executed)
4. [ ] Revert code changes via git
5. [ ] Rebuild plugin: `make dist`
6. [ ] Redeploy plugin: `make deploy`
7. [ ] Restart Mattermost server
8. [ ] Verify functionality

## Monitoring After Each Phase

After completing each phase, monitor for:

1. **Error logs**: Check for content block related errors
2. **User reports**: Card content not displaying
3. **Gallery view**: Images not showing
4. **Unfurl previews**: Broken previews in chat

## Decision Points for Rollback

Trigger rollback if:

| Condition | Action |
|-----------|--------|
| > 1% of cards show rendering issues | Rollback immediately |
| Gallery images not loading > 5% | Rollback immediately |
| Import/Export failures > 1% | Rollback, investigate |
| Performance degradation > 20% | Rollback, investigate |

## Contact

If issues occur during removal phases, contact the development team before proceeding with rollback if time permits.
