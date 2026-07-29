# MATTERMOST BOARDS PLUGIN

**Generated:** 2026-01-23
**Commit:** 1e99b5f7
**Branch:** fix-blocksuite-ui-bug

## OVERVIEW

Mattermost Boards plugin (Focalboard) - self-hosted Kanban/project management. Go 1.24.6 backend + React 19/TypeScript 5.7 frontend. Plugin for Mattermost 10.7.0+.

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

<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan
<!-- SPECKIT END -->

## WORKFLOW (spec-kit + superpowers)

This repository combines **spec-kit** (specification pipeline) and **superpowers**
(implementation discipline). spec-kit owns the spec/plan artifacts under `specs/`
(`$speckit-specify`, `$speckit-plan`, `$speckit-tasks`); superpowers governs
implementation — test-driven development, verification-before-completion, and
root-cause debugging. See [SPEC_KIT_GUIDE.md](SPEC_KIT_GUIDE.md). Project rules
live in `.specify/memory/constitution.md`.

명령 접두사: Codex `$speckit-*`, Claude Code `/speckit-*`, Cursor는 채팅에서 스킬
이름 언급.

Upstream(mattermost/mattermost-plugin-boards) 커밋 선별 반영은 `$speckit-sync`
(사전 준비 필요 — SPEC_KIT_GUIDE.md 6절).

### Brainstorming → speckit 핸드오프

기능 작업은 **복잡도로 분기**한다.

- **단순/명확**: 브레인스토밍 없이 바로 `$speckit-specify`.
- **복잡**: superpowers `brainstorming`으로 의도·요구사항·설계를 정리한 뒤 `$speckit-specify`로 넘긴다.

**핵심 규칙 — brainstorming → speckit 전환은 반드시 "명시적 사용자 선택 단계"를 거친다.**

- brainstorming을 자동 종료하거나 건너뛰지 않는다. 사용자가 넘기라고 하기 전엔 speckit으로 진입 금지.
- 설계가 정리되면 전환을 눈에 보이게 제시하고 사용자가 고른다:
  ① `$speckit-specify`로 진행  ② 더 다듬기  ③ 중단/보류.
- 핸드오프 시점과 넘길 내용(정리된 설계)을 사용자가 확인한 뒤 결정한다.

### 명세 문서 언어

`specs/<NNN-feature>/`의 spec-kit 산출물(`spec.md`, `plan.md`, `tasks.md`,
`checklists/`)은 **한국어로 작성한다**. 코드 식별자, 파일 경로, 셸 명령, FR/SC
식별자, BDD 키워드(Given/When/Then)는 원형 유지. 템플릿이 영어로 산출되더라도
한국어로 옮긴다.

### 문서 경로 정리

| 경로 | 성격 |
|---|---|
| `specs/<NNN-feature>/` | **명세 정본** (spec-kit 산출물, 커밋) |
| `spec-docs/` | 아키텍처·마이그레이션 노트 (레거시, 보존) |
| `conductor/` | 제품·코드 스타일 가이드 (보존) |
| `.sisyphus/`, `docs/plans/` | 과거 계획 도구 산출물 (보존, 신규 작성 금지) |
| `docs/superpowers/` | brainstorming 임시 초안 (.gitignore — 정본 아님) |

### 에이전트 자산은 팀 공유가 기본

`.agents/skills/`와 `.claude/`(스킬·서브에이전트·슬래시 명령·훅·`settings.json`)는 커밋되어
팀 전체에 전파된다. 재사용할 워크플로는 개인 디렉터리가 아니라 저장소에 두고 커밋한다.
개인용 권한·메모만 `.claude/settings.local.json`·`CLAUDE.local.md`에 남긴다(무시됨).
