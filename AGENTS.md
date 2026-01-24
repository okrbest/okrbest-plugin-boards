# MATTERMOST BOARDS PLUGIN

**Generated:** 2026-01-23
**Commit:** 1e99b5f7
**Branch:** fix-blocksuite-ui-bug

## OVERVIEW

Mattermost Boards plugin (Focalboard) - self-hosted Kanban/project management. Go 1.24+ backend + React 17/TypeScript frontend. Plugin for Mattermost 10.7.0+.

## STRUCTURE

```
okrbest-plugin-newboards/
├── server/           # Go backend (plugin → api → app → store)
│   ├── api/         # HTTP handlers, routing (Gorilla Mux)
│   ├── app/         # Business logic, permissions
│   ├── model/       # Domain models (Board, Block, Card)
│   ├── boards/      # Plugin app initialization
│   ├── services/    # Store, permissions, notify, metrics
│   └── ws/          # WebSocket adapter (real-time sync)
├── webapp/           # React frontend
│   └── src/
│       ├── components/   # UI (cardDetail, kanban, table, sidebar)
│       ├── store/        # Redux Toolkit slices
│       ├── blocks/       # Block type definitions
│       ├── widgets/      # Reusable UI primitives
│       └── properties/   # Property type handlers
├── conductor/        # Project docs, style guides, tracks
├── spec-docs/        # Architecture, BlockSuite migration docs
└── build/            # Build tooling (pluginctl, sync)
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Add API endpoint | `server/api/{feature}.go` → register in `api.go` | Follow existing handler pattern |
| Business logic | `server/app/{feature}.go` | Layer between API and Store |
| DB operations | `server/services/store/sqlstore/` | Squirrel query builder |
| Add component | `webapp/src/components/` | Functional + hooks |
| State management | `webapp/src/store/{slice}.ts` | Redux Toolkit |
| New block type | `webapp/src/blocks/` + `server/model/block.go` | Both ends needed |
| Card editor | `webapp/src/components/blockSuite/` | BlockSuite/Yjs integration |
| WebSocket events | `server/ws/plugin_adapter.go` | Real-time broadcasts |
| DB migrations | `server/services/store/sqlstore/migrations/` | Postgres/MySQL/SQLite |

## CONVENTIONS

### Server (Go)
- Layer flow: `API → App → Store` (never skip)
- Errors: `model.NewErrBadRequest()`, `NewErrForbidden()`, etc.
- Logging: `mlog.Debug/Info/Warn/Error` with structured fields
- Tests: `*_test.go` in same package

### Webapp (TypeScript/React)
- Functional components only, hooks for logic
- Redux Toolkit for all state
- SCSS with BEM naming, CSS variables for theming
- Tests: `*.test.tsx` colocated

### Both
- Korean responses required
- Match existing patterns in codebase
- One feature per change

## ANTI-PATTERNS (THIS PROJECT)

- **NEVER** skip layers (API directly calling Store)
- **NEVER** suppress types: `as any`, `@ts-ignore`, `@ts-expect-error`
- **NEVER** empty catch blocks
- **NEVER** commit without explicit request
- **DO NOT** add new dependencies without justification
- **DO NOT** refactor while fixing bugs

## COMMANDS

```bash
# Install dependencies
cd webapp && npm install

# Dev build (current OS only)
MM_DEBUG=true make dist

# Production build (all platforms)
make dist

# Deploy to local Mattermost
make deploy

# Watch mode (auto-reload)
make watch-plugin

# Tests
make test                    # All tests
make server-test             # Go tests
cd webapp && npm run test    # Jest tests

# Lint
make check-style
cd webapp && npm run check   # ESLint + Stylelint
```

## KEY ENTRY POINTS

| Entry | File | Purpose |
|-------|------|---------|
| Plugin main | `server/main.go` | `plugin.ClientMain()` |
| Plugin hooks | `server/plugin.go` | Mattermost lifecycle |
| API router | `server/api/api.go` | `RegisterRoutes()` |
| App init | `server/app/app.go` | `New()` constructor |
| Webapp entry | `webapp/src/index.tsx` | `Plugin.initialize()` |
| Redux store | `webapp/src/store/index.ts` | `configureStore()` |
| Router | `webapp/src/router.tsx` | React Router config |

## API BASE

All REST APIs: `/plugins/focalboard/api/v2/`
WebSocket: Via Mattermost plugin adapter

| Endpoint | Method | Handler |
|----------|--------|---------|
| `/boards` | GET/POST | `api/boards.go` |
| `/boards/{id}` | GET/PATCH/DELETE | `api/boards.go` |
| `/boards/{id}/blocks` | GET/POST | `api/blocks.go` |
| `/cards` | POST | `api/cards.go` |
| `/cards/{id}/blocksuite/*` | GET/PUT | `api/blocksuite.go` |
| `/teams/{id}/categories` | GET/POST | `api/categories.go` |

## BLOCKSUITE (EDITOR)

Active migration: legacy Block system → BlockSuite (Yjs CRDT).

| Component | File |
|-----------|------|
| Editor entry | `webapp/src/components/blockSuite/BlockSuiteEditor.tsx` |
| State provider | `webapp/src/components/blockSuite/EditorProvider.tsx` |
| Init logic | `webapp/src/components/blockSuite/editor/editor.ts` |
| Migration utils | `webapp/src/utils/blockSuiteUtils.ts` |
| Backend API | `server/api/blocksuite.go` |

See `spec-docs/blocksuite-migration.md` for details.

## NOTES

- `conductor/` contains existing project docs - check before asking questions
- `.cursor/rules/` has domain-specific AI rules
- Plugin ID is `focalboard`, not `boards`
- Build requires sibling `mattermost` repo clone at `../mattermost`
- Set `MM_DEBUG=true` for faster dev builds
