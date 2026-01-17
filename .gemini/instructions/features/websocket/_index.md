---
description: WebSocket 실시간 동기화 관련 Q&A
globs: ["server/ws/**", "webapp/src/wsclient.ts"]
---

# WebSocket 실시간 동기화 도메인

## 개요

WebSocket을 통해 보드, 블록, 멤버 변경 사항을 실시간으로 동기화합니다.
Mattermost의 WebSocket 인프라를 활용합니다.

## 관련 파일

| 영역 | 파일 |
|------|------|
| 서버 어댑터 | `server/ws/plugin_adapter.go` |
| 서버 인터페이스 | `server/ws/server.go` |
| 클라이언트 | `webapp/src/wsclient.ts` |
| 플러그인 훅 | `server/plugin.go` (OnWebSocketConnect 등) |

## 아키텍처

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  웹앱           │     │  Mattermost     │     │  Boards Plugin  │
│  (WSClient)     │────▶│  WebSocket      │────▶│  Plugin Adapter │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                         │
                                                         ▼
                                                ┌─────────────────┐
                                                │  App 비즈니스    │
                                                │  로직           │
                                                └─────────────────┘
```

## 서버 측 (Plugin Adapter)

### 인터페이스

```go
type PluginAdapterInterface interface {
    OnWebSocketConnect(webConnID, userID string)
    OnWebSocketDisconnect(webConnID, userID string)
    WebSocketMessageHasBeenPosted(webConnID, userID string, req *mm_model.WebSocketRequest)
    BroadcastBlockChange(teamID string, block *model.Block)
    BroadcastBoardChange(teamID string, board *model.Board)
    BroadcastMemberChange(teamID, boardID string, member *model.BoardMember)
    BroadcastCategoryChange(category model.Category)
}
```

### 변경 브로드캐스트

데이터 변경 시 App에서 호출:

```go
// 블록 변경
a.wsAdapter.BroadcastBlockChange(teamID, block)

// 보드 변경
a.wsAdapter.BroadcastBoardChange(teamID, board)

// 멤버 변경
a.wsAdapter.BroadcastMemberChange(teamID, boardID, member)
```

### 클러스터 지원

고가용성 환경에서 모든 노드로 이벤트 전파:

```go
// plugin.go
func (p *Plugin) OnPluginClusterEvent(ctx *plugin.Context, event model.PluginClusterEvent) {
    p.boardsApp.OnPluginClusterEvent(ctx, event)
}
```

## 클라이언트 측 (WSClient)

### 팀 구독

```typescript
// 팀의 모든 변경 사항 구독
wsClient.subscribeToTeam(teamId)
```

### 이벤트 핸들러 등록

```typescript
// 블록 변경 이벤트
wsClient.addOnChange((blocks) => {
    // Redux 스토어 업데이트
    dispatch(updateBlocks(blocks))
}, 'block')

// 보드 변경 이벤트
wsClient.addOnChange((boards) => {
    dispatch(updateBoards(boards))
}, 'board')

// 멤버 변경 이벤트
wsClient.addOnChange((members) => {
    dispatch(updateMembers(members))
}, 'member')
```

### 이벤트 타입 상수

```typescript
export const ACTION_UPDATE_BOARD = 'UPDATE_BOARD'
export const ACTION_UPDATE_BLOCK = 'UPDATE_BLOCK'
export const ACTION_DELETE_BLOCK = 'DELETE_BLOCK'
export const ACTION_UPDATE_MEMBER = 'UPDATE_MEMBER'
export const ACTION_DELETE_MEMBER = 'DELETE_MEMBER'
export const ACTION_UPDATE_CATEGORY = 'UPDATE_CATEGORY'
export const ACTION_UPDATE_SUBSCRIPTION = 'UPDATE_SUBSCRIPTION'
export const ACTION_REORDER_CATEGORIES = 'REORDER_CATEGORIES'
```

## 이벤트 페이로드

### UPDATE_BOARD

```json
{
  "action": "UPDATE_BOARD",
  "teamId": "team-123",
  "board": {
    "id": "board-456",
    "title": "Updated Title",
    ...
  }
}
```

### UPDATE_BLOCK

```json
{
  "action": "UPDATE_BLOCK",
  "teamId": "team-123",
  "block": {
    "id": "block-789",
    "boardId": "board-456",
    "type": "text",
    "title": "Updated content",
    ...
  }
}
```

## 디버깅

### 서버 로그

```go
a.logger.Debug("Broadcasting block change",
    mlog.String("teamID", teamID),
    mlog.String("blockID", block.ID),
)
```

### 클라이언트 로그

브라우저 개발자 도구에서 WebSocket 메시지 확인:
- Network 탭 → WS 필터
- Mattermost WebSocket 연결 선택
- Messages 탭에서 Boards 관련 이벤트 확인

## 주의사항

1. **인증**: WebSocket 연결은 Mattermost 세션으로 인증됨
2. **권한**: 팀/보드 권한에 따라 이벤트 필터링
3. **성능**: 대량 변경 시 `disable_notify` 파라미터 사용
4. **재연결**: 연결 끊김 시 자동 재연결 로직 내장

---

## Q&A 목록

> 개발 중 생긴 질문들이 `q-{주제}.md` 파일로 이 폴더에 추가됩니다.

| 질문 | 파일 |
|------|------|
| (새 질문이 생기면 여기에 추가) | |
