# SERVER (GO BACKEND)

## OVERVIEW

Go 1.24+ backend. Layered architecture: Plugin → BoardsApp → Server → API → App → Store.

## STRUCTURE

```
server/
├── main.go           # plugin.ClientMain() entry
├── plugin.go         # Mattermost plugin hooks
├── api/              # HTTP handlers (28 files)
├── app/              # Business logic (43 files)
├── model/            # Domain models (37 files)
├── boards/           # Plugin app initialization
├── services/
│   ├── store/        # Data access layer
│   │   ├── store.go      # Interface definition
│   │   └── sqlstore/     # SQL implementation (Squirrel)
│   ├── permissions/  # RBAC (Mattermost integrated)
│   ├── notify/       # @mentions, subscriptions
│   ├── metrics/      # Prometheus
│   └── audit/        # Audit logging
├── ws/               # WebSocket (real-time sync)
└── utils/            # Helpers
```

## WHERE TO LOOK

| Task | Primary | Secondary |
|------|---------|-----------|
| New API | `api/{feature}.go` | Register in `api/api.go` |
| Business logic | `app/{feature}.go` | - |
| New model | `model/{entity}.go` | - |
| DB queries | `services/store/sqlstore/{entity}.go` | - |
| Migrations | `services/store/sqlstore/migrations/` | - |
| WebSocket events | `ws/plugin_adapter.go` | - |
| Permissions | `services/permissions/mmpermissions/` | - |

## REQUEST FLOW

```
Client → plugin.ServeHTTP → Mux Router → API Handler
    → a.sessionRequired() (auth middleware)
    → a.app.{Method}() (business logic)
    → a.store.{Method}() (data access)
    → JSON Response
```

## CONVENTIONS

### Handler Pattern
```go
func (a *API) handleGetBoard(w http.ResponseWriter, r *http.Request) {
    boardID := mux.Vars(r)["boardID"]
    userID := getUserID(r)
    
    // Permission check
    if !a.permissions.HasPermissionToBoard(userID, boardID, model.PermissionViewBoard) {
        a.errorResponse(w, r, model.NewErrForbidden("access denied"))
        return
    }
    
    // Business logic
    board, err := a.app.GetBoard(boardID)
    if err != nil {
        a.errorResponse(w, r, err)
        return
    }
    
    // Response
    data, _ := json.Marshal(board)
    jsonBytesResponse(w, http.StatusOK, data)
}
```

### Error Types
```go
model.NewErrBadRequest("message")      // 400
model.NewErrUnauthorized("message")    // 401
model.NewErrForbidden("message")       // 403
model.NewErrNotFound("message")        // 404
```

### Logging
```go
a.logger.Debug("message", mlog.String("key", value))
a.logger.Error("failed", mlog.Err(err))
```

## KEY MODELS

| Model | File | Key Fields |
|-------|------|------------|
| Board | `model/board.go` | ID, TeamID, ChannelID, Type, Title, CardProperties |
| Block | `model/block.go` | ID, ParentID, BoardID, Type, Title, Fields |
| Card | `model/card.go` | Block + card-specific fields |
| BoardMember | `model/board.go` | BoardID, UserID, SchemeAdmin/Editor/Viewer |

## STORE INTERFACE

`services/store/store.go` defines all DB operations. SQLStore implements it.

Key methods:
- `GetBoard(id)` / `InsertBoard()` / `PatchBoard()`
- `GetBlocksForBoard(boardID)` / `InsertBlock()` / `PatchBlock()`
- `GetMembersForBoard(boardID)` / `SaveMember()`

## WEBSOCKET

`ws/plugin_adapter.go` broadcasts changes:
```go
a.wsAdapter.BroadcastBlockChange(teamID, block)
a.wsAdapter.BroadcastBoardChange(teamID, board)
a.wsAdapter.BroadcastCategoryChange(category)
```

## ANTI-PATTERNS

- Skip layers (API → Store directly)
- Return generic errors (always use model.NewErr*)
- Forget permission checks
- Hardcode SQL (use Squirrel builder)

## TESTS

```bash
make server-test                      # All server tests
go test -v ./server/app/...           # Specific package
go test -v -run TestName ./server/... # Specific test
```

Mock generation:
```bash
cd server && go generate ./...
```
