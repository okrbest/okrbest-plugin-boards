# Phase 1 Issues & Blockers

## Pre-existing Configuration Issues (Not Phase 1 Related)

### 1. Jest ESM/TypeScript Configuration
**Status:** BLOCKING
**Error:** `SyntaxError: Cannot use import statement outside a module`
**Location:** @blocksuite/blocks ESM imports
**Impact:** `npm run test` fails for 29 test suites
**Root Cause:** Jest configuration doesn't handle ESM modules from @blocksuite/blocks
**Solution Needed:** Update Jest config to transform node_modules/@blocksuite/* or use ESM loader

### 2. TypeScript Strict Mode Violations
**Status:** BLOCKING
**Error Count:** 36 implicit `any` type errors
**Files Affected:**
- src/components/sidebar/sidebarBoardItem.tsx
- src/components/viewHeader/cardFilterValue.tsx
- src/components/viewHeader/filterEntry.tsx (28 errors)
- src/components/viewHeader/filterValue.tsx
- src/components/viewHeader/viewHeaderDisplayByMenu.tsx
- src/components/viewHeader/viewHeaderGroupByMenu.tsx
- src/widgets/propertyMenu.tsx
**Root Cause:** Callback parameters missing type annotations
**Solution Needed:** Add explicit type annotations to all callback parameters

### 3. ESLint Resolver Configuration
**Status:** BLOCKING
**Error Count:** 585 errors
**Error:** `Resolve error: typescript with invalid interface loaded as resolver`
**Root Cause:** ESLint import/order plugin resolver configuration broken
**Solution Needed:** Fix .eslintrc TypeScript resolver configuration

## Phase 1 Cleanup Status
✅ react-beautiful-dnd: Completely removed (0 imports)
✅ PureComponent: Removed from menu.tsx
✅ All Phase 1 tasks (1.1-1.9) completed successfully

## Recommendation
Phase 1 cleanup work is complete. The verification command failures are due to pre-existing infrastructure issues that should be addressed in a separate task before proceeding to Phase 2.
