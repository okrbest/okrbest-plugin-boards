# Mattermost Boards Plugin - Project Context

## Overview
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

## Contribution Guidelines
*   **Language**: All code comments and documentation responses should be in **Korean** (as per `project.md`).
*   **Code Style**: Follow the patterns in existing code. Avoid over-engineering.
*   **Testing**: Add tests for all new features or bug fixes (`*_test.go` for server, `*.test.tsx` for webapp).
