---
description: 콘텐츠 블록(Content Block) 관련 Q&A
globs: ["server/api/blocks*.go", "server/api/content_blocks*.go", "webapp/src/components/content/**", "webapp/src/blocks/**"]
---

# 콘텐츠 블록 (Content Blocks) 도메인

## 개요

콘텐츠 블록은 카드 내부의 콘텐츠(텍스트, 이미지, 체크박스 등)를 나타냅니다.

## 블록 타입

| 타입 | 설명 |
|------|------|
| text | 텍스트/마크다운 |
| h1, h2, h3 | 제목 |
| image | 이미지 |
| divider | 구분선 |
| checkbox | 체크박스 |
| video | 비디오 |
| list | 목록 |
| numbered-list | 번호 목록 |
| quote | 인용문 |
| attachment | 첨부파일 |

## 관련 파일

| 영역 | 파일 |
|------|------|
| API | `server/api/blocks.go`, `content_blocks.go` |
| 비즈니스 로직 | `server/app/blocks.go`, `content_blocks.go` |
| 모델 | `server/model/block.go` |
| 웹앱 렌더링 | `webapp/src/components/content/` |
| 블록 정의 | `webapp/src/blocks/` |
| Redux | `webapp/src/store/contents.ts` |

## 주요 API

- `GET /api/v2/boards/{boardId}/blocks` – 블록 목록
- `POST /api/v2/boards/{boardId}/blocks` – 블록 생성
- `PATCH /api/v2/boards/{boardId}/blocks/{blockId}` – 블록 수정
- `DELETE /api/v2/boards/{boardId}/blocks/{blockId}` – 블록 삭제
- `POST /api/v2/content-blocks/{blockId}/moveto/{where}/{dstBlockId}` – 블록 이동

### 블록 조회

```
GET /api/v2/boards/{boardID}/blocks
```

| 파라미터 | 필수 | 설명 |
|---------|------|------|
| parent_id | 선택 | 부모 블록 ID (카드 ID) |
| type | 선택 | 블록 타입 필터 |
| all | 선택 | 보드의 모든 블록 조회 |

### 블록 생성

```
POST /api/v2/boards/{boardID}/blocks
```

배열로 여러 블록 동시 생성 가능. `disable_notify` 파라미터로 알림 비활성화.

### 블록 수정

```
PATCH /api/v2/boards/{boardID}/blocks/{blockID}
```

사용 예:
- 텍스트 내용 수정
- 체크박스 토글
- 카드 제목/아이콘 변경
- contentOrder 순서 업데이트

### 블록 삭제

```
DELETE /api/v2/boards/{boardID}/blocks/{blockID}
```

- 이력에 기록 후 실제 삭제
- 하위 블록도 재귀적으로 삭제

### 블록 복원

```
POST /api/v2/boards/{boardID}/blocks/{blockID}/undelete
```

이력에서 마지막 상태를 조회하여 복원.

### 블록 복제

```
POST /api/v2/boards/{boardID}/blocks/{blockID}/duplicate
```

하위 블록 포함 복제.

### 블록 이동 (드래그앤드롭)

```
POST /api/v2/content-blocks/{blockID}/moveto/{where}/{dstBlockID}
```

- `where`: `before` 또는 `after`
- 부모 카드의 `contentOrder` 배열 순서 재조정

## 블록 이력 관리

모든 블록 변경은 `focalboard_blocks_history` 테이블에 기록됩니다.

| 테이블 | 설명 |
|--------|------|
| `focalboard_blocks` | 현재 블록 상태 |
| `focalboard_blocks_history` | 블록 변경 이력 (모든 변경 기록) |

### INSERT/UPDATE 시

```sql
-- 1. blocks 테이블에 INSERT 또는 UPDATE
-- 2. blocks_history 테이블에 이력 INSERT
INSERT INTO focalboard_blocks_history 
    (id, parent_id, type, title, fields, modified_by, create_at, update_at, ...)
VALUES (...);
```

### DELETE 시

```sql
-- 1. 이력에 삭제 기록 (delete_at에 현재 시간 설정)
-- 2. 파일 정보 삭제 (이미지/첨부파일인 경우)
-- 3. 블록 실제 삭제
-- 4. 하위 블록도 재귀적으로 삭제
```

## 블록 구조

```typescript
{
  id: string
  boardId: string
  parentId: string  // 카드 ID
  type: BlockType   // "text", "image", "checkbox", ...
  title: string     // 텍스트 내용
  fields: {
    value?: boolean       // checkbox용
    fileId?: string       // 이미지/파일용
    filename?: string
    width?: number
    height?: number
  }
  createAt: number
  updateAt: number
}
```

## API 사용 비율

```
blocks.go ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 85%
 ├── GET    /blocks           (블록 조회)
 ├── POST   /blocks           (블록 생성)
 ├── PATCH  /blocks/{blockID} (블록 수정) ⭐ 가장 빈번
 ├── DELETE /blocks/{blockID} (블록 삭제)
 └── POST   .../undelete, duplicate (복원/복제)

content_blocks.go ━━━━ 5%
 └── POST   /content-blocks/{blockID}/moveto/... (드래그앤드롭)
```

---

## Q&A 목록

> 개발 중 생긴 질문들이 `q-{주제}.md` 파일로 이 폴더에 추가됩니다.

| 질문 | 파일 |
|------|------|
| (새 질문이 생기면 여기에 추가) | |
