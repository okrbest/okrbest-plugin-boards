# BlockSuite 마이그레이션 및 빌드 현황

> 📅 **최종 업데이트**: 2026-01-19
> 🎯 **목표**: 기존 Block 시스템을 BlockSuite(Yjs) 기반으로 전환

## 1. 구현 현황 요약

| 영역 | 상태 | 설명 |
|------|------|------|
| **백엔드 API** | ✅ 완료 | 스냅샷 저장/로드 (`/api/v2/cards/{id}/blocksuite`) |
| **DB 스키마** | ✅ 완료 | Yjs 바이너리 저장 지원 |
| **데이터 모델** | ✅ 완료 | 레거시 블록 → Yjs 문서 자동 변환 로직 |
| **에디터 통합** | ✅ 완료 | `CardDetail` 내 BlockSuite 에디터 연동 |
| **Feature Flag** | ✅ 완료 | 기본 활성화 (항상 BlockSuite 사용) |
| **빌드 시스템** | ✅ 완료 | Webpack (ESM 모듈 호환 설정 포함) |
| **자동 저장** | ✅ 완료 | 2초 디바운스 기반 자동 저장 |
| **이미지 마이그레이션** | ✅ 완료 | 레거시 이미지 → BlockSuite Blob 자동 변환 |
| **테마 연동** | ✅ 완료 | Mattermost CSS 변수와 동기화 |

---

## 2. 아키텍처 개요

### 2.1 컴포넌트 구조

```
webapp/src/components/blockSuite/
├── BlockSuiteEditor.tsx    # 메인 에디터 컴포넌트 (진입점)
├── EditorProvider.tsx      # 에디터 상태 관리 (Context + 자동 저장)
├── EditorContainer.tsx     # DOM 마운트, 드래그&드롭, 클립보드 처리
├── BlockSuiteEditor.scss   # 에디터 스타일 (Mattermost 테마 매핑)
└── editor/
    ├── editor.ts           # 에디터 초기화 로직 (initEditor, loadEditorData)
    └── context.ts          # React Context 정의

webapp/src/utils/
└── blockSuiteUtils.ts      # 마이그레이션 및 변환 유틸리티
```

### 2.2 데이터 흐름

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CardDetail.tsx                               │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │                   BlockSuiteEditor                          │   │
│   │  ┌───────────────────────────────────────────────────────┐  │   │
│   │  │              EditorProvider                           │  │   │
│   │  │  - initEditor() → createEmptyDoc().init()             │  │   │
│   │  │  - loadEditorData() → 서버 스냅샷 or 마이그레이션     │  │   │
│   │  │  - 자동 저장 (Yjs spaceDoc.on('update'))              │  │   │
│   │  │  ┌─────────────────────────────────────────────────┐  │  │   │
│   │  │  │            EditorContainer                      │  │  │   │
│   │  │  │  - AffineEditorContainer DOM 마운트             │  │  │   │
│   │  │  │  - 드래그 앤 드롭 / 붙여넣기 이미지 업로드      │  │  │   │
│   │  │  │  - 로딩/저장 상태 표시                          │  │  │   │
│   │  │  └─────────────────────────────────────────────────┘  │  │   │
│   │  └───────────────────────────────────────────────────────┘  │   │
│   └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.3 데이터 저장 방식

BlockSuite는 CRDT(Conflict-free Replicated Data Type) 기반의 **Yjs**를 사용합니다.

| 구분 | 기존 방식 | BlockSuite 방식 |
|------|----------|-----------------|
| 저장 단위 | 각 블록이 DB의 `blocks` 테이블에 개별 행 | 문서 전체의 **JSON 스냅샷** 단일 저장 |
| 데이터 형식 | Block 객체 배열 | Yjs 문서 스냅샷 (JSON) |
| API 엔드포인트 | `/api/v2/blocks` | `/api/v2/cards/{id}/blocksuite/content` |

---

## 3. Lazy Migration (지연 마이그레이션)

서버에서 일괄 변환하지 않고, **사용자가 카드를 열 때(On-Demand)** 클라이언트에서 변환을 수행합니다.

### 3.1 마이그레이션 흐름

```
loadData(card, doc)
    │
    ├─→ getBlockSuiteInfo(cardId)
    │       │
    │       ├─→ [있음] getBlockSuiteContent(cardId)
    │       │           │
    │       │           ├─→ [콘텐츠 있음] job.snapshotToDoc() → 로드 완료
    │       │           │
    │       │           └─→ [콘텐츠 없음] attemptMigration()
    │       │
    │       └─→ [없음] attemptMigration()
    │
    └─→ attemptMigration(card, doc)
            │
            ├─→ getAllBlocks(boardId)
            ├─→ filter by parentId === cardId
            ├─→ convertAndApplyBlocks()
            │       │
            │       └─→ 블록 타입별 변환 (text, image, checkbox, h1-h3, list 등)
            │
            ├─→ saveSnapshot(doc) → job.docToSnapshot()
            └─→ saveBlockSuiteContent(cardId, snapshot)
```

### 3.2 블록 타입 매핑

| 레거시 타입 | BlockSuite 변환 | 비고 |
|------------|-----------------|------|
| `text` | `affine:paragraph` | 기본 텍스트 |
| `h1`, `h2`, `h3` | `affine:paragraph` + `type` | heading 타입 지정 |
| `checkbox` | `affine:list` + `type: 'todo'` | 체크 상태 보존 |
| `list-item` | `affine:list` | `bulleted` / `numbered` |
| `image` | `affine:image` | Blob storage로 이미지 다운로드 후 저장 |
| `quote` | `affine:paragraph` + `type: 'quote'` | 인용문 |
| `divider` | `affine:divider` | 구분선 |
| `attachment` | `affine:attachment` | 파일 첨부 |
| `video` | `affine:embed` + `type: 'video'` | 비디오 |

### 3.3 이미지 마이그레이션

레거시 이미지 블록은 다음 과정을 거쳐 변환됩니다:

1. 기존 파일 API에서 이미지 다운로드 (`/api/v2/files/teams/{teamId}/{boardId}/{fileId}`)
2. Blob으로 변환
3. DocCollection의 BlobSync에 저장
4. `affine:image` 블록 생성 (sourceId = blobId)

```typescript
// blockSuiteUtils.ts - 이미지 마이그레이션 핵심 로직
async function convertBlock(block: Block, boardId: string, parentId: string, doc: Doc) {
    if (block.type === 'image' && block.fields?.fileId) {
        const blob = await downloadImageAsBlob(boardId, block.fields.fileId)
        if (blob && doc.collection) {
            const blobId = await storeBlobInCollection(doc.collection, blob, filename)
            doc.addBlock('affine:image', { sourceId: blobId, ... }, parentId)
        }
    }
}
```

---

## 4. 자동 저장 시스템

### 4.1 동작 방식

EditorProvider에서 Yjs 문서의 변경을 감지하여 자동 저장합니다.

```typescript
// EditorProvider.tsx - 자동 저장 로직
useEffect(() => {
    if (!doc || readOnly || isLoading) return

    const handleUpdate = () => {
        clearTimeout(timeout)
        setSaveStatus('saving')

        timeout = setTimeout(async () => {
            const snapshot = await saveSnapshot(doc)
            await octoClient.saveBlockSuiteContent(card.id, snapshot)
            setSaveStatus('saved')
        }, 2000)  // 2초 디바운스
    }

    doc.spaceDoc.on('update', handleUpdate)
    return () => doc.spaceDoc.off('update', handleUpdate)
}, [doc, card.id, readOnly, isLoading])
```

### 4.2 저장 상태 표시

| 상태 | UI 표시 | 설명 |
|------|---------|------|
| `null` | (없음) | 변경 없음 |
| `saving` | "Saving..." | 저장 중 (파란색) |
| `saved` | "Saved" | 저장 완료 (녹색, 3초 후 사라짐) |
| `error` | "Save failed" | 저장 실패 (빨간색, 5초 후 사라짐) |

---

## 5. 테마 통합

### 5.1 Mattermost CSS 변수 매핑

BlockSuiteEditor.scss에서 Mattermost의 CSS 변수를 BlockSuite의 CSS 변수로 매핑합니다:

```scss
.blocksuite-editor-wrapper {
    /* 배경색 */
    --affine-background-primary-color: var(--center-channel-bg);
    
    /* 텍스트 색상 */
    --affine-text-primary-color: var(--center-channel-color);
    --affine-text-secondary-color: rgba(var(--center-channel-color-rgb), 0.65);
    
    /* 브랜드/강조 색상 */
    --affine-brand-color: var(--button-bg);
    --affine-primary-color: var(--button-bg);
    
    /* 테두리/구분선 */
    --affine-border-color: rgba(var(--center-channel-color-rgb), 0.12);
    --affine-divider-color: rgba(var(--center-channel-color-rgb), 0.08);
    
    /* 선택 영역 */
    --affine-selection-color: rgba(var(--button-bg-rgb), 0.25);
}
```

### 5.2 한국어 플레이스홀더

빈 문단에 한국어 플레이스홀더가 표시됩니다:

```scss
.affine-paragraph-placeholder::before {
    content: '내용을 입력하세요... ("/" 입력하면 블록 추가)';
}
```

---

## 6. API 명세

### 6.1 클라이언트 API (octoClient.ts)

| 메서드 | 엔드포인트 | 설명 |
|--------|-----------|------|
| `getBlockSuiteInfo(cardId)` | `GET /api/v2/cards/{id}/blocksuite/info` | 스냅샷 존재 여부 확인 |
| `getBlockSuiteContent(cardId)` | `GET /api/v2/cards/{id}/blocksuite/content` | JSON 스냅샷 로드 |
| `saveBlockSuiteContent(cardId, content)` | `PUT /api/v2/cards/{id}/blocksuite/content` | JSON 스냅샷 저장 |

### 6.2 데이터 형식

**요청/응답 Content-Type**: `application/octet-stream`

클라이언트에서 JSON 객체를 UTF-8 인코딩된 바이트 배열로 변환하여 전송합니다:

```typescript
// octoClient.ts
async saveBlockSuiteContent(cardId: string, content: any): Promise<void> {
    const jsonStr = JSON.stringify(content)
    const encoder = new TextEncoder()
    const bodyData = encoder.encode(jsonStr)
    
    await fetch(path, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: bodyData
    })
}
```

---

## 7. 빌드 및 배포

### 7.1 빌드 명령어

```bash
# 개발 빌드 (현재 OS/아키텍처만)
MM_DEBUG=true make dist

# 프로덕션 빌드 (모든 플랫폼)
make dist

# 배포
./build/bin/pluginctl deploy focalboard dist/boards-*.tar.gz

# 실시간 개발 (파일 변경 감지)
make watch-plugin
```

### 7.2 Webpack ESM 설정

BlockSuite는 ESM 모듈을 사용하므로 webpack.config.js에 다음 설정이 필요합니다:

```javascript
resolve: {
    mainFields: ['browser', 'module', 'main'],
},
module: {
    rules: [{
        test: /\.m?js/,
        resolve: { fullySpecified: false }
    }]
}
```

---

## 8. 트러블슈팅

### 8.1 알려진 이슈 (무시 가능)

| 이슈 | 원인 | 영향 |
|------|------|------|
| **Yjs `Invalid access` 경고** | `createEmptyDoc().init()` 내부 동작 | 에디터 작동에 영향 없음 |
| **`@emotion/react` 중복 로드 경고** | Mattermost와 플러그인이 각각 로드 | 기능에 영향 없음 |
| **`Lit is in dev mode` 경고** | BlockSuite 내부 Lit 라이브러리 | 프로덕션 빌드에서 해결됨 |

### 8.2 해결된 이슈

| 이슈 | 원인 | 해결책 |
|------|------|--------|
| **카드 라우팅 중복 `/boards` 경로** | Vite 빌드 시스템의 모듈 로딩 타이밍 | Webpack으로 롤백 |
| **yjs ESM 모듈 빌드 오류** | Webpack의 ESM 처리 부족 | `resolve.mainFields`, `fullySpecified` 설정 |
| **`ajv` 모듈 누락** | CSS 처리 의존성 | `npm install ajv --save-dev` |
| **에디터가 화면에 안 보임** | `CardDetail--fullwidth` 스타일 누락 | SCSS에 스타일 추가 |

### 8.3 디버깅 팁

콘솔에서 다음 로그 프리픽스로 필터링하면 관련 로그를 쉽게 확인할 수 있습니다:

- `[BlockSuite Migration]` - 마이그레이션 과정
- `[EditorProvider]` - 에디터 초기화 및 데이터 로드
- `[AutoSave]` - 자동 저장
- `[Convert]` - 블록 변환
- `[API]` - API 호출
- `[Image]` - 이미지 처리

---

## 9. 향후 계획 (Phase 2)

| 기능 | 우선순위 | 설명 |
|------|---------|------|
| 실시간 협업 | 높음 | WebSocket을 통한 Yjs 동기화 |
| 블록 타입 확장 | 중간 | 코드 블록, 테이블 등 추가 지원 |
| 역마이그레이션 | 낮음 | BlockSuite → 레거시 블록 변환 (롤백 지원) |
| 성능 최적화 | 중간 | 대용량 문서 처리 개선 |

---

## 부록: 주요 파일 경로

| 용도 | 경로 |
|------|------|
| 에디터 진입점 | `webapp/src/components/blockSuite/BlockSuiteEditor.tsx` |
| 상태 관리 (Provider) | `webapp/src/components/blockSuite/EditorProvider.tsx` |
| DOM 컨테이너 | `webapp/src/components/blockSuite/EditorContainer.tsx` |
| 에디터 초기화 | `webapp/src/components/blockSuite/editor/editor.ts` |
| React Context | `webapp/src/components/blockSuite/editor/context.ts` |
| 스타일 (테마 매핑) | `webapp/src/components/blockSuite/BlockSuiteEditor.scss` |
| 마이그레이션 로직 | `webapp/src/utils/blockSuiteUtils.ts` |
| API 클라이언트 | `webapp/src/octoClient.ts` (BlockSuite Methods 섹션) |
| API 핸들러 (서버) | `server/api/blocksuite.go` |
| Webpack 설정 | `webapp/webpack.config.js` |
| 카드 상세 (통합점) | `webapp/src/components/cardDetail/cardDetail.tsx` |
