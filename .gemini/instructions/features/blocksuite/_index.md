---
description: BlockSuite 에디터 관련 Q&A
globs: ["server/api/blocksuite*.go", "server/app/blocksuite*.go", "server/model/blocksuite*.go", "webapp/src/components/blocksEditor/**", "public/blocksuite*.html"]
---

# BlockSuite 에디터 도메인

## 개요

BlockSuite는 카드 상세 편집에 사용되는 노션 스타일의 블록 에디터입니다.
내부적으로 **Yjs** (CRDT)를 데이터 레이어로 사용합니다.

## 구현 상태

| 구분 | 상태 | 위치 |
|------|------|------|
| 백엔드 API | ✅ 구현 완료 | `server/api/blocksuite.go` |
| 데이터 모델 | ✅ 구현 완료 | `server/model/blocksuite_doc.go` |
| DB 레이어 | ✅ 구현 완료 | `server/services/store/sqlstore/blocksuite.go` |
| 프론트엔드 | ⏳ 테스트 코드만 존재 | `public/blocksuite-editor.html` |
| 에디터 통합 | ❌ 미구현 | - |

## 관련 파일

| 영역 | 파일 |
|------|------|
| API | `server/api/blocksuite.go` |
| 비즈니스 로직 | `server/app/blocksuite.go` |
| 모델 | `server/model/blocksuite_doc.go` |
| Store | `server/services/store/sqlstore/blocksuite.go` |
| 테스트 HTML | `public/blocksuite-editor.html` |

## 주요 API

- `GET /api/v2/cards/{cardId}/blocksuite/content` – Yjs 스냅샷 로드
- `PUT /api/v2/cards/{cardId}/blocksuite/content` – Yjs 스냅샷 저장
- `GET /api/v2/cards/{cardId}/blocksuite/info` – 문서 메타데이터 조회
- `DELETE /api/v2/cards/{cardId}/blocksuite` – 문서 삭제

| Method | Endpoint | 설명 |
|--------|----------|------|
| `GET` | `/cards/{cardID}/blocksuite/content` | Yjs 바이너리 스냅샷 로드 |
| `PUT` | `/cards/{cardID}/blocksuite/content` | Yjs 바이너리 스냅샷 저장 |
| `GET` | `/cards/{cardID}/blocksuite/info` | 문서 메타데이터 조회 |
| `DELETE` | `/cards/{cardID}/blocksuite` | 문서 삭제 |

### 저장 형식

```
Content-Type: application/octet-stream

Yjs Binary Snapshot (Y.encodeStateAsUpdate(yDoc))
• 압축된 바이너리 형식
• 전체 문서 상태 포함
• 증분 업데이트 지원 가능
```

## Smart Load 플로우

사용자가 카드 에디터를 열 때, BlockSuite 문서 존재 여부에 따라 다르게 동작합니다.

### 시나리오 1: 첫 접근 (마이그레이션 필요)

```
1. 사용자가 카드 에디터 열기
2. GET /blocksuite/info → 404 (문서 없음)
3. GET /blocks → 기존 블록들 조회
4. convertLegacyBlocksToYjs() → Yjs 문서 생성
5. PUT /blocksuite/content → 변환된 문서 저장
6. 에디터에서 편집 시작
```

### 시나리오 2: 재접근 (이미 마이그레이션됨)

```
1. 사용자가 카드 에디터 열기
2. GET /blocksuite/info → 200 OK
3. GET /blocksuite/content → Yjs 스냅샷 로드
4. Y.applyUpdate(yDoc, snapshot) → 문서 복원
5. 에디터에서 편집 시작
```

## 블록 타입 매핑

기존 Focalboard 블록 타입 → BlockSuite 타입 변환:

| 기존 타입 | BlockSuite 타입 | props |
|-----------|-----------------|-------|
| `text` | `affine:paragraph` | `{ type: "text" }` |
| `h1` | `affine:paragraph` | `{ type: "h1" }` |
| `h2` | `affine:paragraph` | `{ type: "h2" }` |
| `h3` | `affine:paragraph` | `{ type: "h3" }` |
| `checkbox` | `affine:list` | `{ type: "todo", checked: boolean }` |
| `list` | `affine:list` | `{ type: "bulleted" }` |
| `numbered-list` | `affine:list` | `{ type: "numbered" }` |
| `quote` | `affine:paragraph` | `{ type: "quote" }` |
| `divider` | `affine:divider` | `{}` |
| `image` | `affine:image` | `{ sourceId, filename, width, height }` |
| `video` | `affine:embed` | `{ type: "video", sourceId, filename }` |
| `attachment` | `affine:attachment` | `{ sourceId, filename, size }` |

## Yjs 데이터 구조

```javascript
Y.Doc {
  blocks: Y.Map {
    "block-123": Y.Map {
      id: "block-123",
      type: "affine:paragraph",
      props: { type: "text" },
      text: "Hello World"
    }
  },
  meta: Y.Map {
    blockOrder: ["block-123", ...],
    cardId: "card-456",
    cardTitle: "Card Title"
  }
}
```

## 이미지/파일 처리

이미지는 **기존 Focalboard 파일 API를 그대로 사용**합니다.
Yjs 문서에는 파일 메타데이터(fileId, filename 등)만 저장합니다.

```javascript
// 기존 image 블록
{
  "type": "image",
  "fields": { "fileId": "abc123.png", "filename": "screenshot.png" }
}

// → BlockSuite Yjs 형식으로 변환
{
  "type": "affine:image",
  "props": { "sourceId": "abc123.png", "filename": "screenshot.png" }
}
```

## 향후 확장 가능성 (Phase 2)

Yjs는 CRDT 기반이므로 실시간 협업 기능 추가 가능:

- **자동 충돌 해결**: 여러 사용자가 동시에 편집해도 자동 병합
- **오프라인 지원**: 오프라인에서 편집 후 온라인 시 자동 동기화
- **히스토리 관리**: 변경 이력 추적 및 언두/리두 지원
- **Awareness**: 다른 사용자 커서 위치 표시

## 참고 문서

- `spec-docs/editor-api.md` - 에디터 API 상세
- `spec-docs/blocksuite-migration.md` - 마이그레이션 가이드

---

## Q&A 목록

> 개발 중 생긴 질문들이 `q-{주제}.md` 파일로 이 폴더에 추가됩니다.

| 질문 | 파일 |
|------|------|
| (새 질문이 생기면 여기에 추가) | |
