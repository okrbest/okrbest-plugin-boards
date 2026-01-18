# BlockSuite 마이그레이션 및 빌드 현황

> 📅 **최종 업데이트**: 2026-01-19
> 🎯 **목표**: 기존 Block 시스템을 BlockSuite(Yjs) 기반으로 전환하고, 빌드 시스템을 최신화(Vite)함.

## 1. 구현 현황 요약

| 영역 | 상태 | 설명 |
|------|------|------|
| **백엔드 API** | ✅ 완료 | 스냅샷 저장/로드 (`/api/v2/cards/{id}/blocksuite`) |
| **DB 스키마** | ✅ 완료 | Yjs 바이너리 저장 지원 |
| **데이터 모델** | ✅ 완료 | 레거시 블록 → Yjs 문서 자동 변환 로직 |
| **에디터 통합** | ✅ 완료 | `CardDetail` 내 BlockSuite 에디터 연동 |
| **빌드 시스템** | ✅ 완료 | Webpack → **Vite** 전환 및 스타일 주입 최적화 |

---

## 2. 아키텍처 및 데이터 전략

### 2.1 데이터 저장 방식
BlockSuite는 CRDT(Conflict-free Replicated Data Type) 기반의 **Yjs**를 사용합니다.
- **기존**: 각 블록이 DB의 `blocks` 테이블에 개별 행(Row)으로 저장됨.
- **변경**: 문서 전체의 **Yjs 스냅샷(Binary JSON)**을 하나의 덩어리로 저장.

### 2.2 Lazy Migration (지연 마이그레이션)
서버에서 일괄 변환하지 않고, **사용자가 카드를 열 때(On-Demand)** 클라이언트에서 변환을 수행합니다.

1. **Check**: 해당 카드의 Yjs 스냅샷이 존재하는가?
2. **If No**:
   - 레거시 블록 API(`GET /blocks`) 호출.
   - 클라이언트에서 Yjs 포맷으로 변환 (`convertLegacyBlocksToYjs`).
   - 변환된 스냅샷 서버에 저장 (`PUT /blocksuite/content`).
3. **Load**: 에디터 로딩.

### 2.3 이미지 및 파일 처리
- Yjs 문서 내에는 **파일 메타데이터(ID, 이름)**만 저장합니다.
- 실제 바이너리는 기존 Focalboard의 파일 API(`/api/v2/files/...`)를 그대로 사용하여 저장소 효율성을 유지합니다.

---

## 3. 빌드 시스템 (Vite) 및 트러블슈팅

Webpack에서 Vite로 전환하며 발생한 주요 이슈와 해결된 기술적 결정 사항입니다.

### 3.1 스타일(CSS) 처리 전략
Mattermost 서버의 정적 파일 서빙(`MIME type`) 이슈를 우회하기 위해 **JS 번들 내 인라인 주입** 방식을 채택했습니다.

- **문제**: `.css` 파일을 서버가 `text/plain`으로 응답하여 브라우저가 로드 거부.
- **해결**: `plugin_entry.ts`에서 CSS를 문자열로 가져와(`?inline`) 런타임에 `<style>` 태그로 주입.
  ```typescript
  // plugin_entry.ts
  import mainStyle from './styles/main.scss?inline'
  injectStyle(mainStyle); // <head>에 주입
  ```

### 3.2 주요 트러블슈팅 로그

| 이슈 | 원인 | 해결책 |
|------|------|--------|
| **`x.jsxDEV` Error** | React Runtime 충돌 | `vite.config.ts`: `jsxRuntime: 'classic'` 설정. |
| **Bundle 404** | 파일명 해시 불일치 | 빌드 파일명을 `focalboard_bundle.js`로 고정하고 `plugin.json`과 동기화. |
| **`process` Error** | Node.js 전역 객체 참조 | `vite.config.ts`: `define` 옵션으로 `process` 폴리필 주입. |
| **Limits API 500** | API 엔드포인트 누락 | `server/api/config.go`: 더미 `/limits` 핸들러 복구. |
| **아이콘 깨짐** | 폰트 우선순위 문제 | CSS에 `.CompassIcon { font-family: 'compass-icons' !important; }` 추가. |

---

## 4. 향후 계획 (Phase 2)

현재 구현(Phase 1)은 **단일 사용자 편집 및 저장**에 초점을 맞췄습니다. 향후 **실시간 협업**을 위해 다음 작업이 필요합니다.

1. **WebSocket 연동**: Yjs 업데이트(Delta)를 실시간으로 브로드캐스팅.
2. **Awareness**: 다른 사용자의 커서 및 선택 영역 표시.
3. **Offline Support**: `y-indexeddb`를 활용한 오프라인 저장소 연동.

---

## 부록: 주요 경로

- **진입점**: `webapp/src/plugin_entry.ts`
- **마이그레이션 로직**: `webapp/src/utils/blockSuiteUtils.ts`
- **API 핸들러**: `server/api/blocksuite.go`
- **Vite 설정**: `webapp/vite.config.ts`