---
description: 보드(Board) 관련 Q&A
globs: ["server/api/boards*.go", "server/app/boards*.go", "webapp/src/**/board*.tsx"]
---

# 보드 (Boards) 도메인

## 개요

보드는 카드와 뷰를 담는 최상위 컨테이너입니다.
팀과 채널에 연결되어 권한 관리의 기본 단위가 됩니다.

## 관련 파일

| 영역 | 파일 |
|------|------|
| API | `server/api/boards.go`, `boards_and_blocks.go` |
| 비즈니스 로직 | `server/app/boards.go` |
| 모델 | `server/model/board.go` |
| 웹앱 | `webapp/src/components/boardSelector/` |
| Redux | `webapp/src/store/boards.ts` |

## 보드 모델

```go
type Board struct {
    ID             string                   `json:"id"`
    TeamID         string                   `json:"teamId"`
    ChannelID      string                   `json:"channelId"`
    CreatedBy      string                   `json:"createdBy"`
    ModifiedBy     string                   `json:"modifiedBy"`
    Type           BoardType                `json:"type"`           // "O" (Open) | "P" (Private)
    MinimumRole    BoardRole                `json:"minimumRole"`
    Title          string                   `json:"title"`
    Description    string                   `json:"description"`
    Icon           string                   `json:"icon"`
    Properties     map[string]interface{}   `json:"properties"`
    CardProperties []map[string]interface{} `json:"cardProperties"`
    CreateAt       int64                    `json:"createAt"`
    UpdateAt       int64                    `json:"updateAt"`
    DeleteAt       int64                    `json:"deleteAt"`
}
```

### 보드 타입

| 타입 | 코드 | 설명 |
|------|------|------|
| Open | `"O"` | 팀 멤버 누구나 접근 가능 |
| Private | `"P"` | 명시적으로 추가된 멤버만 접근 가능 |

## 주요 API

- `GET /api/v2/boards` – 보드 목록
- `POST /api/v2/boards` – 보드 생성
- `GET /api/v2/boards/{boardId}` – 보드 상세 조회
- `PATCH /api/v2/boards/{boardId}` – 보드 수정
- `DELETE /api/v2/boards/{boardId}` – 보드 삭제
- `POST /api/v2/boards/{boardId}/duplicate` – 보드 복제

### 보드 목록 조회

```
GET /api/v2/boards
```

### 보드 생성

```
POST /api/v2/boards
```

```json
{
  "title": "새 보드",
  "teamId": "team-123",
  "type": "O",
  "cardProperties": [...]
}
```

### 보드 상세 조회

```
GET /api/v2/boards/{boardId}
```

### 보드 수정

```
PATCH /api/v2/boards/{boardId}
```

### 보드 삭제

```
DELETE /api/v2/boards/{boardId}
```

### 보드 복제

```
POST /api/v2/boards/{boardId}/duplicate
```

- `asTemplate`: 템플릿으로 복제
- `toTeam`: 다른 팀으로 복제

### 보드 아카이브 내보내기

```
GET /api/v2/boards/{boardId}/archive/export
```

### 보드 아카이브 가져오기

```
POST /api/v2/boards/import
Content-Type: multipart/form-data
```

## CardProperties

보드에서 카드가 가질 수 있는 프로퍼티(필드)를 정의합니다:

```json
{
  "cardProperties": [
    {
      "id": "prop-1",
      "name": "상태",
      "type": "select",
      "options": [
        {"id": "opt-1", "value": "To Do", "color": "propColorRed"},
        {"id": "opt-2", "value": "Done", "color": "propColorGreen"}
      ]
    },
    {
      "id": "prop-2",
      "name": "담당자",
      "type": "person"
    }
  ]
}
```

## 보드와 뷰 관계

```
Board
├── View 1 (Kanban)
│   ├── Card A
│   ├── Card B
│   └── Card C
├── View 2 (Table)
│   └── (같은 카드들을 다른 방식으로 표시)
└── View 3 (Calendar)
    └── (같은 카드들을 캘린더에 표시)
```

## 채널 연동

보드를 특정 채널에 연결하면:
- 채널 RHS에서 보드 목록 표시
- 채널 멤버에게 보드 접근 권한 부여

```go
board.ChannelID = "channel-123"
```

---

## Q&A 목록

> 개발 중 생긴 질문들이 `q-{주제}.md` 파일로 이 폴더에 추가됩니다.

| 질문 | 파일 |
|------|------|
| (새 질문이 생기면 여기에 추가) | |
