---
description: 카드(Card) 관련 Q&A
globs: ["server/api/cards*.go", "server/app/cards*.go", "webapp/src/components/cardDetail/**", "webapp/src/components/cardDialog*"]
---

# 카드 (Cards) 도메인

## 개요

카드는 보드 내의 개별 작업/항목을 나타냅니다.
Block 타입 중 하나이며, 프로퍼티와 콘텐츠 블록을 포함합니다.

## 관련 파일

| 영역 | 파일 |
|------|------|
| API | `server/api/cards.go` |
| 비즈니스 로직 | `server/app/cards.go` |
| 모델 | `server/model/block.go` (type: "card") |
| 웹앱 상세 | `webapp/src/components/cardDetail/` |
| 다이얼로그 | `webapp/src/components/cardDialog.tsx` |
| Redux | `webapp/src/store/cards.ts` |

## 카드 구조

```typescript
{
  id: string
  boardId: string
  parentId: string  // 기본 뷰 ID
  type: "card"
  title: string
  icon: string      // 이모지 아이콘
  fields: {
    properties: {
      [propertyId: string]: value
    }
    contentOrder: string[]  // 콘텐츠 블록 순서
    isTemplate: boolean     // 카드 템플릿 여부
  }
  createAt: number
  updateAt: number
}
```

## 주요 API

- `POST /api/v2/cards` – 카드 생성
- `GET /api/v2/cards/{cardId}` – 카드 상세 조회
- `PATCH /api/v2/cards/{cardId}` – 카드 수정

### 카드 생성

```
POST /api/v2/cards
```

```json
{
  "boardId": "board-123",
  "title": "새 카드",
  "properties": {
    "prop-status": "opt-todo"
  }
}
```

### 카드 상세 조회

```
GET /api/v2/cards/{cardId}
```

### 카드 수정

```
PATCH /api/v2/cards/{cardId}
```

```json
{
  "title": "수정된 제목",
  "properties": {
    "prop-status": "opt-done"
  }
}
```

## 카드 프로퍼티

카드의 프로퍼티 값은 보드에서 정의한 `cardProperties`에 따라 저장됩니다:

```typescript
// 보드에서 정의
cardProperties: [
  { id: "prop-1", name: "상태", type: "select", options: [...] },
  { id: "prop-2", name: "담당자", type: "person" }
]

// 카드에서 값 저장
card.fields.properties = {
  "prop-1": "opt-1",        // select: 옵션 ID
  "prop-2": ["user-123"],   // person: 사용자 ID 배열
}
```

## 콘텐츠 블록 순서

카드 내 콘텐츠 블록의 순서는 `contentOrder` 배열로 관리:

```typescript
card.fields.contentOrder = [
  "block-text-1",
  "block-image-1",
  "block-checkbox-1"
]
```

드래그앤드롭으로 순서 변경 시:
1. `POST /content-blocks/{blockId}/moveto/{where}/{dstBlockId}`
2. 서버에서 `contentOrder` 재정렬
3. 카드 PATCH로 저장

## 카드 상세 에디터

카드 상세 페이지에서:

1. **헤더**: 제목, 아이콘
2. **프로퍼티 패널**: 각 프로퍼티 표시/편집
3. **콘텐츠 영역**: 텍스트, 이미지, 체크박스 등

### BlockSuite 에디터 통합 (개선 중)

기존 블록 기반 에디터에서 BlockSuite 에디터로 마이그레이션 진행 중.
자세한 내용은 `spec-docs/blocksuite-migration.md` 참조.

## 카드 템플릿

`isTemplate: true`인 카드는 템플릿으로 사용:

```typescript
// 템플릿에서 새 카드 생성
await mutator.duplicateCard(templateCard.id, boardId, false)
```

---

## Q&A 목록

> 개발 중 생긴 질문들이 `q-{주제}.md` 파일로 이 폴더에 추가됩니다.

| 질문 | 파일 |
|------|------|
| (새 질문이 생기면 여기에 추가) | |
