# Mattermost Boards Plugin - Project Context

## Overview
Always use Context7 MCP when I need library/API documentation, code generation, setup or configuration steps without me having to explicitly ask.

Please print all of AI's answers in Korean.

**Mattermost Boards** (formerly Focalboard) is a project management and task tracking plugin for Mattermost. It serves as an alternative to Trello, Notion, or Asana, integrated directly into the Mattermost platform.

*   **Plugin ID**: `focalboard`
*   **Version**: 9.2.1
*   **Min Server Version**: 10.7.0
*   **Repo**: `okrbest-plugin-newboards`

## ⚠️ Important Agent Instructions
Detailed project rules and context have been migrated to the `.gemini/instructions` directory.
**You must consult these files for specific domain logic:**
*   **Project Overview**: `.gemini/instructions/project.md`
*   **Server (Go)**: `.gemini/instructions/server.md`
*   **Webapp (React/TS)**: `.gemini/instructions/webapp.md`
*   **Features**: `.gemini/instructions/features/` (contains specific rules for boards, cards, blocks, etc.)

**Always check `.gemini/instructions/features/` when working on a specific feature.**

## Tech Stack
*   **Server**: Go 1.24+ (API, Business Logic, WebSocket)
*   **Webapp**: TypeScript, React 17, Redux Toolkit, SCSS
*   **Database**: PostgreSQL, MySQL, SQLite (via Mattermost Server)
*   **Build System**: Makefile + npm + Webpack

## Key Directories
*   `/server`: Go backend source code.
    *   `/api`: REST API handlers.
    *   `/app`: Business logic.
    *   `/model`: Data models.
    *   `/ws`: WebSocket adapter.
*   `/webapp`: Frontend source code.
    *   `/src/components`: React components.
    *   `/src/store`: Redux slices.
    *   `/src/blocks`: Block type definitions.
*   `/spec-docs`: Architectural documentation.
*   `/build`: Build scripts and manifest tools.

## Development & Build

### Common Commands (Run from root)
*   `make dist`: Build the plugin for production (Server + Webapp).
*   `make deploy`: Build and deploy to a local Mattermost server.
*   `make test`: Run all tests (Server + Webapp).
*   `make check-style`: Run linters (Go + JS/TS).
*   `make watch-plugin`: Watch for changes and redeploy (requires `modd`).

### Webapp Specific
*   `cd webapp && npm install`: Install dependencies.
*   `cd webapp && npm run test`: Run frontend tests.

### Server Specific
*   `make server-test`: Run backend tests.

## Workflow (spec-kit + superpowers)

기능 개발은 spec-kit 파이프라인을 따른다:
`specify → (clarify) → plan → tasks → (analyze) → implement`. 명세 정본은
`specs/<NNN-feature>/`이며 한국어로 작성한다. 프로젝트 규칙은
`.specify/memory/constitution.md`, 팀 가이드는 `SPEC_KIT_GUIDE.md`.

*   **단순/명확한 작업**: 브레인스토밍 없이 바로 명세 작성.
*   **복잡한 기능**: 브레인스토밍으로 의도·요구사항·설계를 정리한 뒤 명세로 넘긴다.
    전환은 **반드시 사용자가 명시적으로 선택**한다 (① 명세로 진행 ② 더 다듬기 ③ 보류).
*   구현 중 규율: 실패 테스트 우선 → 검증 명령 출력 확인 → 완료 선언. 땜질 전에
    근본 원인 조사.
*   Gemini CLI에는 spec-kit 스킬이 설치돼 있지 않다. 명세 산출물 생성은 Claude
    Code(`/speckit-*`)·Codex(`$speckit-*`)·Cursor에서 수행하고, Gemini는 그
    산출물(`specs/<NNN-feature>/`)을 읽어 따른다.

## Contribution Guidelines
*   **Language**: 코드 주석·문서·응답은 **한국어**로 쓴다.

    한국어 개발 블로그·기술 문서 문체. 짧은 문장, 능동태, 단정적 서술.
    *   **번역투 금지** — "~하는 것을 확실히", "~에 직면하다", "~를 가지다",
        "~되어질 수 있다", 불필요한 "~적인·~를 통해"
    *   **명사화 금지** — "증거 요구 없음" → "증거를 요구하지 않는다"
    *   **영어 은유 직역 금지** — bridge·lever·hub 계열은 동사로 푼다
    *   **소제목에 관형절("~하는 X") 금지** — 서술문이나 의문문으로
    *   주어 남발 금지. 응답은 과한 존댓말·사과 없이 본론부터

    전문은 `.specify/memory/constitution.md`의 "개발 워크플로 > 한국어 문체".
    코드 식별자·파일 경로·셸 명령·FR/SC 식별자는 원형 유지.
*   **Code Style**: Follow the patterns in existing code. Avoid over-engineering.
*   **TDD (Test-Driven Development)**: 
    *   새로운 기능 구현 시 테스트 코드를 먼저 작성하는 TDD 방식을 강력히 권장합니다.
*   **Testing**: Add tests for all new features or bug fixes (`*_test.go` for server, `*.test.tsx` for webapp).
