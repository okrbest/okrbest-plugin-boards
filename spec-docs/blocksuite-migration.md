# BlockSuite Yjs 마이그레이션 가이드

> 📋 **문서 상태**: 설계 및 구현 완료
> 
> | 구분 | 상태 | 위치 |
> |------|------|------|
> | **백엔드 API** | ✅ 구현 완료 | `server/api/blocksuite.go` |
> | **데이터 모델** | ✅ 구현 완료 | `server/model/blocksuite_doc.go` |
> | **DB 레이어** | ✅ 구현 완료 | `server/services/store/sqlstore/blocksuite.go` |
> | **프론트엔드 유틸리티** | ✅ 구현 완료 | `webapp/src/utils/blockSuiteUtils.ts` |
> | **BlockSuite 에디터 통합** | ✅ 구현 완료 | `webapp/src/components/cardDetail/cardDetail.tsx` |

## 개요

이 문서는 기존 Focalboard 블록 시스템에서 BlockSuite 기반 Yjs 문서 구조로 마이그레이션하는 이유와 방법을 설명합니다.

---

## 1. 왜 Yjs로 마이그레이션해야 하는가?

### 1.1 BlockSuite 에디터 호환성

BlockSuite는 Notion과 유사한 블록 기반 에디터로, 내부적으로 **Yjs**를 데이터 레이어로 사용합니다.
따라서 BlockSuite 에디터를 사용하려면 기존 블록 데이터를 Yjs 형식으로 변환해야 합니다.

```
┌──────────────────────────────────────────────────────────────┐
│  BlockSuite Architecture                                      │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐      │
│   │  UI Layer   │ -> │  Doc Model  │ -> │  Job API    │      │
│   │  (Editor)   │    │  (Blocks)   │    │ (Snapshot)  │      │
│   └─────────────┘    └─────────────┘    └─────────────┘      │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

### 1.2 기존 방식의 한계

- 각 블록이 독립적인 DB 레코드로 저장됨
- BlockSuite 에디터가 내부적으로 Yjs를 사용하므로 데이터 변환 필요
- 블록 간 관계와 순서 관리가 복잡함

### 1.3 구현 현황

```
┌─────────────────────────────────────────────────────────────┐
│  Phase 1: BlockSuite 스냅샷 저장 (완료)                      │
├─────────────────────────────────────────────────────────────┤
│  ✅ 백엔드 API (4개 엔드포인트)                               │
│  ✅ DB 테이블 및 CRUD (PostgreSQL, MySQL, SQLite)            │
│  ✅ BlockSuite JSON 스냅샷 저장/로드 (Job API 활용)           │
│  ✅ 프론트엔드 BlockSuite 에디터 통합 (`CardDetail`)          │
│  ✅ 기존 블록 → BlockSuite 자동 마이그레이션 로직              │
└─────────────────────────────────────────────────────────────┘
```

> 📝 Phase 1 구현이 완료되었습니다. 
> 프론트엔드 로직은 `webapp/src/utils/blockSuiteUtils.ts`에 정의되어 있으며, `CardDetail` 컴포넌트에서 사용됩니다.

### 1.4 향후 확장 가능성 (Phase 2)

Yjs는 CRDT(Conflict-free Replicated Data Type) 기반이므로, 향후 실시간 협업 기능 추가가 가능합니다:

```
┌─────────────────────────────────────────────────────────────┐
│  Phase 2: 실시간 협업 (향후)                                 │
├─────────────────────────────────────────────────────────────┤
│  • 자동 충돌 해결: 여러 사용자가 동시에 편집해도 자동 병합    │
│  • 오프라인 지원: 오프라인에서 편집 후 온라인 시 자동 동기화  │
│  • 히스토리 관리: 변경 이력 추적 및 언두/리두 지원           │
│  • 효율적 동기화: 변경된 부분만 전송 (delta sync)            │
│  → WebSocket 기반 y-websocket 연동 필요                      │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. 데이터 구조

### 2.1 기존 블록 구조 (DB 레코드)

```json
{
  "id": "block-123",
  "type": "text",
  "title": "Hello World",
  "parentId": "card-456",
  "fields": {
    "value": false
  }
}
```

### 2.2 BlockSuite Yjs 구조

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

### 2.3 블록 타입 매핑

기존 Focalboard 블록 타입이 BlockSuite 타입으로 어떻게 변환되는지:

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

---

## 3. 마이그레이션 흐름

### 3.1 Smart Load 플로우

사용자가 카드 에디터를 열 때, BlockSuite 문서 존재 여부에 따라 다르게 동작합니다:

```
┌─────────────────────────────────────────────────────────────────┐
│                    Smart Load Flow                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌─────────────┐                                               │
│   │  Start      │                                               │
│   └──────┬──────┘                                               │
│          ▼                                                       │
│   ┌──────────────────────┐                                      │
│   │ GET /blocksuite/info │  BlockSuite 문서 존재 확인            │
│   └──────────┬───────────┘                                      │
│              │                                                   │
│      ┌───────┴───────┐                                          │
│      ▼               ▼                                          │
│  ┌────────┐    ┌─────────┐                                      │
│  │ 200 OK │    │ 404     │                                      │
│  └───┬────┘    └────┬────┘                                      │
│      │              │                                            │
│      ▼              ▼                                            │
│  ┌────────────┐  ┌────────────────────┐                         │
│  │ Load Yjs   │  │ Fetch Legacy Blocks│                         │
│  │ Document   │  │ (GET /blocks)      │                         │
│  └─────┬──────┘  └─────────┬──────────┘                         │
│        │                   │                                     │
│        │                   ▼                                     │
│        │         ┌────────────────────┐                         │
│        │         │ Convert to Yjs     │                         │
│        │         │ BlockSuite Format  │                         │
│        │         └─────────┬──────────┘                         │
│        │                   │                                     │
│        │                   ▼                                     │
│        │         ┌────────────────────┐                         │
│        │         │ Auto-save to Server│                         │
│        │         │ (PUT /content)     │                         │
│        │         └─────────┬──────────┘                         │
│        │                   │                                     │
│        └───────────┬───────┘                                    │
│                    ▼                                             │
│            ┌──────────────┐                                      │
│            │ Editor Ready │                                      │
│            └──────────────┘                                      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 시나리오별 동작

#### 시나리오 1: 첫 접근 (마이그레이션 필요)

```
1. 사용자가 카드 에디터 열기
2. GET /blocksuite/info → 404 (문서 없음)
3. GET /blocks → 기존 블록들 조회
4. convertLegacyBlocksToYjs() → Yjs 문서 생성
5. PUT /blocksuite/content → 변환된 문서 저장
6. 에디터에서 편집 시작
```

#### 시나리오 2: 재접근 (이미 마이그레이션됨)

```
1. 사용자가 카드 에디터 열기
2. GET /blocksuite/info → 200 OK
3. GET /blocksuite/content → JSON 스냅샷 로드
4. Job.snapshotToDoc(snapshot) → 문서 복원
5. 에디터에서 편집 시작
```

---

## 4. API 엔드포인트

### 4.1 BlockSuite 문서 API (✅ 구현 완료)

> 📍 구현 위치: `server/api/blocksuite.go`

| Method | Endpoint | 설명 |
|--------|----------|------|
| `GET` | `/cards/{cardID}/blocksuite/content` | JSON 스냅샷 로드 |
| `PUT` | `/cards/{cardID}/blocksuite/content` | JSON 스냅샷 저장 |
| `GET` | `/cards/{cardID}/blocksuite/info` | 문서 메타데이터 조회 |
| `DELETE` | `/cards/{cardID}/blocksuite` | 문서 삭제 |

### 4.2 기존 블록 API (레거시)

> 📍 구현 위치: `server/api/blocks.go`
> 
> 마이그레이션 시 기존 블록을 조회할 때 사용합니다.

| Method | Endpoint | 설명 |
|--------|----------|------|
| `GET` | `/boards/{boardID}/blocks?parent_id={cardID}` | 카드의 하위 블록 조회 |
| `POST` | `/boards/{boardID}/blocks` | 블록 생성 |
| `PATCH` | `/boards/{boardID}/blocks/{blockID}` | 블록 수정 |
| `DELETE` | `/boards/{boardID}/blocks/{blockID}` | 블록 삭제 |

### 4.3 저장 형식

```
Content-Type: application/octet-stream

┌────────────────────────────────────────┐
│  BlockSuite JSON Snapshot (Binary)      │
│  (Job.docToSnapshot(doc) → Bytes)       │
├────────────────────────────────────────┤
│  • JSON 데이터를 바이너리(UTF-8)로 변환   │
│  • 백엔드는 opaque binary로 취급         │
│  • 저장 시 Uint8Array로 변환하여 전송     │
└────────────────────────────────────────┘
```

#### 저장 및 로드 세부 로직

- **저장 시**: `Job.docToSnapshot(doc)`으로 생성된 JSON 객체를 `Uint8Array` 또는 `Blob`으로 변환하여 `PUT` 요청을 보냅니다.
- **로드 시**: `GET` 요청으로 받은 `ArrayBuffer`를 `TextDecoder`를 사용해 문자열로 변환한 뒤, `JSON.parse()`를 거쳐 `Job.snapshotToDoc(snapshot)`에 전달합니다.

---

## 5. 이미지/파일 처리

### 5.1 기존 파일 API 재사용

이미지, 비디오, 첨부파일은 **기존 Focalboard 파일 API를 그대로 사용**합니다.
Yjs 문서에는 파일 메타데이터(fileId, filename 등)만 저장하고, 실제 파일은 기존 저장소에 유지됩니다.

```
┌─────────────────────────────────────────────────────────────────┐
│  파일 저장 구조                                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   [기존 Block]                   [Yjs Document]                 │
│   ┌─────────────┐               ┌─────────────┐                 │
│   │ type: image │               │ type:       │                 │
│   │ fields: {   │      →        │  affine:    │                 │
│   │   fileId    │   매핑        │  image      │                 │
│   │   filename  │               │ props: {    │                 │
│   │   width     │               │   sourceId  │  ← fileId       │
│   │ }           │               │   filename  │                 │
│   └─────────────┘               │ }           │                 │
│         │                       └──────┬──────┘                 │
│         │                              │                        │
│         └──────────┬───────────────────┘                        │
│                    ▼                                             │
│   ┌────────────────────────────────────┐                        │
│   │  기존 파일 저장소 (변경 없음)        │                        │
│   │  /files/teams/{teamID}/{boardID}/  │                        │
│   └────────────────────────────────────┘                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 파일 API 엔드포인트

| Method | Endpoint | 설명 |
|--------|----------|------|
| `POST` | `/teams/{teamID}/{boardID}/files` | 파일 업로드 (multipart/form-data) |
| `GET` | `/files/teams/{teamID}/{boardID}/{fileId}` | 파일 다운로드 |
| `GET` | `/files/teams/{teamID}/{boardID}/{fileId}/info` | 파일 메타정보 조회 |

### 5.3 이미지 블록 변환 예시

```javascript
// 기존 image 블록
{
  "type": "image",
  "fields": {
    "fileId": "7abc123def456.png",
    "filename": "screenshot.png",
    "width": 800,
    "height": 600
  }
}

// → BlockSuite Yjs 형식으로 변환
{
  "type": "affine:image",
  "originalType": "image",
  "props": {
    "sourceId": "7abc123def456.png",  // fileId → sourceId
    "filename": "screenshot.png",
    "width": 800,
    "height": 600
  }
}
```

### 5.4 이미지 로드 시 URL 생성

```javascript
// Preview에서 이미지 로드
const imageUrl = `${apiBase}/files/teams/${teamId}/${boardId}/${sourceId}`;

// fetch로 이미지 로드 (인증 포함)
const response = await fetch(imageUrl, {
    credentials: 'include',
    headers: getApiHeaders(),
});
const blob = await response.blob();
const blobUrl = URL.createObjectURL(blob);
```

### 5.5 왜 이미지를 Yjs에 직접 저장하지 않는가?

| 이유 | 설명 |
|------|------|
| 파일 크기 | 이미지를 Yjs에 저장하면 문서 크기가 급격히 증가 |
| 동기화 효율 | CRDT 동기화 시 큰 바이너리 전송은 비효율적 |
| 기존 인프라 | Mattermost 파일 저장소/CDN 재사용 가능 |
| 권한 관리 | 기존 보드 권한으로 파일 접근 제어 |
| 중복 방지 | 같은 파일을 여러 문서에서 참조 가능 |

### 5.6 텍스트 편집 시 이미지 블록 보존

현재 textarea 기반 에디터에서는 텍스트 편집 시 이미지 블록이 유실될 수 있어 보존 로직이 필요합니다:

```javascript
// 1. 문서 로드 시 이미지 블록을 전역 저장소에 보존
let preservedImageBlocks = new Map();

function saveImageBlocksToGlobal() {
    const yBlocks = yDoc.getMap('blocks');
    yBlocks.forEach((yBlock, blockId) => {
        const type = yBlock.get('type');
        if (type === 'affine:image' || 
            type === 'affine:embed' || 
            type === 'affine:attachment') {
            preservedImageBlocks.set(blockId, cloneBlock(yBlock));
        }
    });
}

// 2. 텍스트에서는 플레이스홀더로 표시
// "[Image: screenshot.png]"
// "[Video: demo.mp4]"
// "[Attachment: document.pdf]"

// 3. 저장 시 플레이스홀더와 보존된 블록 매칭하여 복원
```

> **참고**: 실제 BlockSuite 에디터 사용 시에는 이 보존 로직이 필요 없습니다.
> 현재는 textarea 기반 테스트 에디터이기 때문에 필요한 임시 로직입니다.

---

## 6. 핵심 함수 설명

### 6.1 `convertLegacyBlocksToYjs(blocks, card, ydoc)`

기존 블록 배열을 Yjs 문서로 변환합니다:

```javascript
function convertLegacyBlocksToYjs(blocks, card, ydoc) {
    const yBlocks = ydoc.getMap('blocks');  // 블록 저장소
    const yMeta = ydoc.getMap('meta');      // 메타데이터

    // contentOrder에 따라 블록 정렬
    const contentOrder = card.fields?.contentOrder || [];
    const sortedBlocks = [...blocks].sort((a, b) => {
        const aIndex = contentOrder.indexOf(a.id);
        const bIndex = contentOrder.indexOf(b.id);
        if (aIndex === -1 && bIndex === -1) return 0;
        if (aIndex === -1) return 1;
        if (bIndex === -1) return -1;
        return aIndex - bIndex;
    });

    // 메타데이터 저장
    yMeta.set('blockOrder', sortedBlocks.map(b => b.id));
    yMeta.set('cardId', card.id);
    yMeta.set('cardTitle', card.title || '');

    // 각 블록을 Yjs Map으로 변환
    sortedBlocks.forEach(block => {
        const yBlock = new Y.Map();
        const converted = convertBlockToYjs(block);
        Object.entries(converted).forEach(([key, value]) => {
            yBlock.set(key, value);
        });
        yBlocks.set(block.id, yBlock);
    });
}
```

### 6.2 `convertBlockToYjs(block)`

단일 블록을 BlockSuite 호환 형식으로 변환:

```javascript
function convertBlockToYjs(block) {
    const type = block.type;
    const result = {
        id: block.id,
        originalType: type,  // 원본 타입 보존 (역마이그레이션 가능)
        createdAt: block.createAt || Date.now(),
        updatedAt: block.updateAt || Date.now(),
    };

    switch (type) {
        case 'text':
            result.type = 'affine:paragraph';
            result.props = { type: 'text' };
            result.text = block.title;
            break;
        case 'checkbox':
            result.type = 'affine:list';
            result.props = { 
                type: 'todo',
                checked: block.fields?.value || false 
            };
            result.text = block.title;
            break;
        case 'image':
            result.type = 'affine:image';
            result.props = {
                sourceId: block.fields?.fileId || '',
                filename: block.fields?.filename || 'image',
                width: block.fields?.width || 0,
                height: block.fields?.height || 0,
            };
            break;
        // ... 기타 타입들
    }
    return result;
}
```

---

## 7. 주의사항

### 7.1 원본 데이터 보존 (설계 제안)

- Yjs 문서 내부에 `originalType` 필드로 기존 블록 타입을 저장 (프론트엔드 로직)
- 백엔드는 Yjs 바이너리를 그대로 저장하므로 이 필드를 인식하지 않음
- 필요시 역마이그레이션 가능하도록 설계

> ⚠️ 이 필드는 테스트 코드(`public/blocksuite-editor.html`)에만 구현되어 있습니다.
> 프론트엔드 통합 시 구현 여부를 결정하세요.

### 7.2 블록 순서 유지

- `card.fields.contentOrder` 배열 참조
- `yMeta.blockOrder`에 순서 저장

### 7.3 마이그레이션 시점

- 사용자가 에디터를 열 때 자동으로 마이그레이션 (Lazy Migration)
- 서버에서 일괄 마이그레이션하지 않음

---

## 8. 결론

### Phase 1 현황

| 구분 | 상태 | 설명 |
|------|------|------|
| 백엔드 API | ✅ 완료 | 4개 엔드포인트 구현 (`server/api/blocksuite.go`) |
| DB 레이어 | ✅ 완료 | PostgreSQL, MySQL, SQLite 지원 |
| 데이터 모델 | ✅ 완료 | `BlockSuiteDoc`, `BlockSuiteDocInfo` |
| 프론트엔드 통합 | ✅ 완료 | `CardDetail` 컴포넌트에 `BlockSuiteEditor` 적용 |
| 마이그레이션 로직 | ✅ 완료 | `blockSuiteUtils.ts`에 자동 변환 로직 구현 완료 |

> **다음 단계**: Phase 2에서 실시간 협업 기능 도입 시 WebSocket 및 Yjs Provider 도입 검토 필요.

### Phase 2 (향후 확장)

⏳ **실시간 협업** - WebSocket + y-websocket으로 CRDT 동기화
⏳ **오프라인 지원** - y-indexeddb로 로컬 저장 후 동기화
⏳ **충돌 해결** - CRDT 기반 자동 충돌 해결
⏳ **Awareness** - 다른 사용자 커서 위치 표시

Phase 2 구현을 위해서는 백엔드에 WebSocket 엔드포인트와 Yjs 업데이트 브로드캐스팅 로직이 필요합니다.

---

## 부록: 주요 구현 파일

### 백엔드 (Go)
| 파일 | 설명 |
|------|------|
| `server/api/blocksuite.go` | API 핸들러 (4개 엔드포인트) |
| `server/app/blocksuite.go` | 비즈니스 로직 및 스냅샷 처리 |
| `server/model/blocksuite_doc.go` | 데이터 모델 정의 |
| `server/services/store/sqlstore/blocksuite.go` | DB CRUD 구현 |

### 프론트엔드 (TypeScript/React)
| 파일 | 설명 |
|------|------|
| `webapp/src/utils/blockSuiteUtils.ts` | 마이그레이션 및 데이터 로드 유틸리티 |
| `webapp/src/components/blockSuite/BlockSuiteEditor.tsx` | BlockSuite 에디터 래퍼 컴포넌트 |
| `webapp/src/components/cardDetail/cardDetail.tsx` | 에디터가 통합된 카드 상세 페이지 |
| `webapp/src/octoClient.ts` | BlockSuite 관련 API 클라이언트 메서드 |
| `webapp/src/utils/blockSuiteUtils.test.ts` | 마이그레이션 로직 테스트 코드 |
