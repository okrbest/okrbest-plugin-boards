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
| **Feature Flag** | ✅ 완료 | `newBoardsEditor` 플래그로 활성화 제어 |
| **빌드 시스템** | ✅ 완료 | Webpack (ESM 모듈 호환 설정 포함) |

---

## 2. Feature Flag 설정

BlockSuite 에디터는 `newBoardsEditor` feature flag로 활성화됩니다.

### 2.1 서버 설정
`server/boards/boardsapp_util.go`의 `parseFeatureFlags` 함수에서 기본값이 설정됩니다:

```go
func parseFeatureFlags(configFeatureFlags map[string]string) map[string]string {
    featureFlags := make(map[string]string)
    
    // Default feature flags for plugin mode
    featureFlags["newBoardsEditor"] = "true"
    
    // ... 기존 로직
}
```

### 2.2 클라이언트 확인
`webapp/src/components/cardDetail/cardDetail.tsx`:

```typescript
const clientConfig = useAppSelector<ClientConfig>(getClientConfig)
const newBoardsEditor = clientConfig?.featureFlags?.newBoardsEditor || false

// newBoardsEditor가 true면 BlockSuite 에디터, false면 기존 에디터
{newBoardsEditor && <BlockSuiteEditor ... />}
{!newBoardsEditor && <CardDetailContents ... />}
```

---

## 3. 아키텍처 및 데이터 전략

### 3.1 데이터 저장 방식
BlockSuite는 CRDT(Conflict-free Replicated Data Type) 기반의 **Yjs**를 사용합니다.
- **기존**: 각 블록이 DB의 `blocks` 테이블에 개별 행(Row)으로 저장됨.
- **변경**: 문서 전체의 **Yjs 스냅샷(JSON)**을 하나의 덩어리로 저장.

### 3.2 Lazy Migration (지연 마이그레이션)
서버에서 일괄 변환하지 않고, **사용자가 카드를 열 때(On-Demand)** 클라이언트에서 변환을 수행합니다.

1. **Check**: 해당 카드의 Yjs 스냅샷이 존재하는가?
2. **If No**:
   - 레거시 블록 API(`GET /blocks`) 호출.
   - 클라이언트에서 Yjs 포맷으로 변환.
   - 변환된 스냅샷 서버에 저장 (`PUT /blocksuite/content`).
3. **Load**: 에디터 로딩.

### 3.3 이미지 및 파일 처리
- Yjs 문서 내에는 **파일 메타데이터(ID, 이름)**만 저장합니다.
- 실제 바이너리는 기존 Focalboard의 파일 API(`/api/v2/files/...`)를 그대로 사용하여 저장소 효율성을 유지합니다.

---


### 4. 빌드 명령어

```bash
# 개발 빌드 (현재 OS/아키텍처만)
MM_DEBUG=true make dist

# 프로덕션 빌드
make dist

# 배포
./build/bin/pluginctl deploy focalboard dist/boards-*.tar.gz
```

---

## 5. 주요 컴포넌트 구조

```
webapp/src/components/blockSuite/
├── BlockSuiteEditor.tsx    # 메인 에디터 컴포넌트
├── EditorProvider.tsx      # 에디터 상태 관리 (Context)
├── EditorContainer.tsx     # DOM 마운트 및 이벤트 처리
├── BlockSuiteEditor.scss   # 에디터 스타일 (Mattermost 테마 매핑)
└── editor/
    ├── editor.ts           # 에디터 초기화 로직
    └── context.ts          # React Context 정의
```

### 5.1 초기화 흐름
1. `CardDetail`에서 `BlockSuiteEditor` 렌더링
2. `EditorProvider`가 `initEditor()` 호출 → `createEmptyDoc().init()` 실행
3. `EditorContainer`가 `AffineEditorContainer`를 DOM에 마운트
4. `loadEditorData()`로 서버에서 스냅샷 로드 또는 레거시 블록 마이그레이션

---

## 6. 트러블슈팅

### 6.1 알려진 이슈

| 이슈 | 원인 | 해결책/상태 |
|------|------|--------|
| **Yjs `Invalid access` 경고** | `createEmptyDoc().init()` 내부 동작 | 에디터 작동에 영향 없음 (무시 가능) |
| **`@emotion/react` 중복 로드 경고** | Mattermost와 플러그인이 각각 로드 | 기능에 영향 없음 |
| **`Lit is in dev mode` 경고** | BlockSuite 내부 Lit 라이브러리 | 프로덕션 빌드에서 해결됨 |

### 6.2 해결된 이슈

| 이슈 | 원인 | 해결책 |
|------|------|--------|
| **카드 라우팅 중복 `/boards` 경로** | Vite 빌드 시스템의 모듈 로딩 타이밍 | Webpack으로 롤백 |
| **yjs ESM 모듈 빌드 오류** | Webpack의 ESM 처리 부족 | `resolve.mainFields`, `fullySpecified` 설정 |
| **`ajv` 모듈 누락** | CSS 처리 의존성 | `npm install ajv --save-dev` |
| **에디터가 화면에 안 보임** | `CardDetail--fullwidth` 스타일 누락 | SCSS에 스타일 추가 |

---

## 7. 향후 계획 (Phase 2)

현재 구현(Phase 1)은 **단일 사용자 편집 및 저장**에 초점을 맞췄습니다. 향후 **실시간 협업**을 위해 다음 작업이 필요합니다.

1. **WebSocket 연동**: Yjs 업데이트(Delta)를 실시간으로 브로드캐스팅.
2. **Awareness**: 다른 사용자의 커서 및 선택 영역 표시.
3. **Offline Support**: `y-indexeddb`를 활용한 오프라인 저장소 연동.
4. **성능 최적화**: 대용량 문서 처리 및 청크 로딩

---

## 부록: 주요 경로

| 용도 | 경로 |
|------|------|
| 에디터 진입점 | `webapp/src/components/blockSuite/BlockSuiteEditor.tsx` |
| 에디터 초기화 | `webapp/src/components/blockSuite/editor/editor.ts` |
| 마이그레이션 로직 | `webapp/src/utils/blockSuiteUtils.ts` |
| Feature Flag 설정 | `server/boards/boardsapp_util.go` |
| API 핸들러 | `server/api/blocksuite.go` |
| Webpack 설정 | `webapp/webpack.config.js` |
| 카드 상세 | `webapp/src/components/cardDetail/cardDetail.tsx` |
