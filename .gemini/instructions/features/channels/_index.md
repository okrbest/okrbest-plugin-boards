---
description: Mattermost 채널 연동 관련 Q&A
globs: ["server/api/channels*.go", "webapp/src/components/rhsChannel*", "webapp/src/components/boardsUnfurl/**"]
---

# 채널 연동 (Channels) 도메인

## 개요

Mattermost 채널과 보드를 연동합니다.
채널에서 보드를 생성하고, RHS(Right Hand Side)에서 보드를 표시합니다.

## 관련 파일

| 영역 | 파일 |
|------|------|
| API | `server/api/channels.go` |
| 포스트 훅 | `server/boards/post.go` |
| RHS 컴포넌트 | `webapp/src/components/rhsChannelBoards.tsx` |
| RHS 보드 항목 | `webapp/src/components/rhsChannelBoardItem.tsx` |
| Unfurl | `webapp/src/components/boardsUnfurl/` |

## 기능

### 1. 채널에서 보드 생성

채널 헤더에서 "Boards" 버튼 클릭 → 새 보드 생성:

```go
board := &model.Board{
    Title:     "새 보드",
    TeamID:    teamID,
    ChannelID: channelID,  // 채널 연결
}
```

### 2. RHS 보드 목록

채널에 연결된 보드들을 RHS에 표시:

```typescript
// rhsChannelBoards.tsx
const channelBoards = boards.filter(b => b.channelId === channelId)
```

### 3. 보드 링크 미리보기 (Unfurl)

메시지에 보드/카드 링크 삽입 시 미리보기 표시:

```go
// server/boards/post.go
type BoardsEmbed struct {
    OriginalPath string `json:"originalPath"`
    TeamID       string `json:"teamID"`
    ViewID       string `json:"viewID"`
    BoardID      string `json:"boardID"`
    CardID       string `json:"cardID"`
    ReadToken    string `json:"readToken,omitempty"`
}
```

## 주요 API

- `GET /api/v2/teams/{teamId}/channels/{channelId}/boards` – 채널 보드 목록

## 채널 연동 API

### 채널 보드 목록

```
GET /api/v2/teams/{teamId}/channels/{channelId}/boards
```

### 채널에 보드 연결

보드 생성/수정 시 `channelId` 설정:

```json
{
  "title": "채널 보드",
  "teamId": "team-123",
  "channelId": "channel-456"
}
```

### 채널 연결 해제

```json
{
  "channelId": ""
}
```

## Unfurl 플로우

```
1. 사용자가 보드/카드 링크 포함 메시지 전송
2. Mattermost에서 MessageHasBeenPosted 훅 호출
3. Boards 플러그인이 링크 파싱
4. BoardsEmbed 구조체로 메타데이터 추출
5. 프론트엔드에서 미리보기 렌더링 (boardsUnfurl/)
```

### 링크 형식

```
# 보드 링크
/boards/team/{teamId}/{boardId}

# 카드 링크
/boards/team/{teamId}/{boardId}/{viewId}/{cardId}

# 공유 링크
/boards/shared/{teamId}/{boardId}?r={token}
```

## 채널 권한 연동

채널에 연결된 보드의 경우:
- 채널 멤버는 보드에 자동 접근 가능 (보드 타입에 따라)
- 채널 관리자는 보드 관리 권한 획득

```go
// 채널 멤버 권한 확인
channelMember, _ := s.api.GetChannelMember(channelID, userID)
if channelMember != nil {
    // 채널 멤버이면 보드 접근 허용
}
```

## 웹앱 구현

### RHS 컴포넌트

```typescript
// rhsChannelBoards.tsx
const RHSChannelBoards: React.FC = () => {
    const channelId = useAppSelector(getChannelId)
    const boards = useAppSelector((state) => 
        getBoardsForChannel(state, channelId)
    )
    
    return (
        <div className='RHSChannelBoards'>
            {boards.map(board => (
                <RHSChannelBoardItem key={board.id} board={board} />
            ))}
        </div>
    )
}
```

### Unfurl 컴포넌트

```typescript
// boardsUnfurl/boardsUnfurl.tsx
// 메시지 내 보드/카드 링크 미리보기 렌더링
```

---

## Q&A 목록

> 개발 중 생긴 질문들이 `q-{주제}.md` 파일로 이 폴더에 추가됩니다.

| 질문 | 파일 |
|------|------|
| (새 질문이 생기면 여기에 추가) | |
