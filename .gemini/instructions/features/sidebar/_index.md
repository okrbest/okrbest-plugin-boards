---
description: 사이드바/카테고리 관련 Q&A
globs: ["server/api/categories*.go", "server/app/category*.go", "webapp/src/components/sidebar/**"]
---

# 사이드바 (Sidebar) 도메인

## 개요

보드를 카테고리별로 정리하는 사이드바를 관리합니다.
사용자별로 개인화된 카테고리 구조를 가집니다.

## 관련 파일

| 영역 | 파일 |
|------|------|
| API | `server/api/categories.go` |
| 비즈니스 로직 | `server/app/category.go`, `category_boards.go` |
| 모델 | `server/model/category.go`, `category_boards.go` |
| 웹앱 | `webapp/src/components/sidebar/` |
| Redux | `webapp/src/store/sidebar.ts` |

## 데이터 모델

### Category

```go
type Category struct {
    ID        string `json:"id"`
    Name      string `json:"name"`
    UserID    string `json:"userID"`
    TeamID    string `json:"teamID"`
    CreateAt  int64  `json:"createAt"`
    UpdateAt  int64  `json:"updateAt"`
    DeleteAt  int64  `json:"deleteAt"`
    Collapsed bool   `json:"collapsed"`
    SortOrder int    `json:"sortOrder"`
    Type      string `json:"type"`  // "custom" | "system"
}
```

### CategoryBoards

```go
type CategoryBoards struct {
    Category
    BoardMetadata []BoardCategoryMetadata `json:"boardMetadata"`
}
```

## 주요 API

- `GET /api/v2/teams/{teamId}/categories` – 카테고리 목록
- `POST /api/v2/teams/{teamId}/categories` – 카테고리 생성
- `PUT /api/v2/teams/{teamId}/categories/{categoryId}` – 카테고리 수정
- `DELETE /api/v2/teams/{teamId}/categories/{categoryId}` – 카테고리 삭제
- `POST /api/v2/teams/{teamId}/categories/{categoryId}/boards` – 보드 추가
- `DELETE /api/v2/teams/{teamId}/categories/{categoryId}/boards/{boardId}` – 보드 제거
- `PUT /api/v2/teams/{teamId}/categories/reorder` – 카테고리 순서 변경

## 카테고리 API

### 카테고리 목록 조회

```
GET /api/v2/teams/{teamId}/categories
```

사용자의 모든 카테고리와 각 카테고리에 속한 보드 목록 반환.

### 카테고리 생성

```
POST /api/v2/teams/{teamId}/categories
```

```json
{
  "name": "내 프로젝트",
  "teamId": "team-123"
}
```

### 카테고리 수정

```
PUT /api/v2/teams/{teamId}/categories/{categoryId}
```

```json
{
  "name": "수정된 이름",
  "collapsed": true
}
```

### 카테고리 삭제

```
DELETE /api/v2/teams/{teamId}/categories/{categoryId}
```

### 보드를 카테고리에 추가

```
POST /api/v2/teams/{teamId}/categories/{categoryId}/boards
```

```json
{
  "boardId": "board-123"
}
```

### 보드를 카테고리에서 제거

```
DELETE /api/v2/teams/{teamId}/categories/{categoryId}/boards/{boardId}
```

### 카테고리 순서 변경

```
PUT /api/v2/teams/{teamId}/categories/reorder
```

```json
{
  "categoryOrder": ["cat-1", "cat-2", "cat-3"]
}
```

## 시스템 카테고리

자동 생성되는 시스템 카테고리:

| 타입 | 이름 | 설명 |
|------|------|------|
| `system` | Boards | 기본 카테고리 (삭제 불가) |

## 사이드바 구조

```
Sidebar
├── Category: 내 프로젝트
│   ├── Board A
│   └── Board B
├── Category: 팀 보드
│   └── Board C
└── Category: Boards (시스템)
    └── (미분류 보드들)
```

## 웹앱 구현

### Redux 상태

```typescript
// store/sidebar.ts
interface SidebarState {
    categories: CategoryBoards[]
    categoryOrder: string[]
}
```

### 컴포넌트 구조

```
sidebar/
├── sidebar.tsx          # 메인 사이드바
├── sidebarCategory.tsx  # 카테고리 아이템
├── sidebarBoardItem.tsx # 보드 아이템
└── addBoardButton.tsx   # 보드 추가 버튼
```

## 드래그앤드롭

### 보드 이동

보드를 다른 카테고리로 드래그:
1. 기존 카테고리에서 제거
2. 새 카테고리에 추가

### 카테고리 순서 변경

카테고리 드래그로 순서 변경:
1. `PUT /categories/reorder` 호출
2. `categoryOrder` 배열 업데이트

## 카테고리 접기/펼치기

```typescript
// 카테고리 접기/펼치기 토글
await mutator.updateCategory({
    ...category,
    collapsed: !category.collapsed
})
```

## WebSocket 이벤트

```typescript
// 카테고리 변경 실시간 동기화
wsClient.addOnChange((categories) => {
    dispatch(updateCategories(categories))
}, 'category')
```

---

## Q&A 목록

> 개발 중 생긴 질문들이 `q-{주제}.md` 파일로 이 폴더에 추가됩니다.

| 질문 | 파일 |
|------|------|
| (새 질문이 생기면 여기에 추가) | |
