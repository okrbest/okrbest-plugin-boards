# Phase 0 연구: 표 뷰 개인 화면 제어 분리

2026-10-23. 코드 실측을 바탕으로 설계 결정을 확정한다. Technical Context에 NEEDS CLARIFICATION은 없었고, 아래는 구현 방식을 가르는 결정들이다.

## 현행 구조 실측

- 그룹 접기: [tableGroupHeaderRow.tsx:79](../../webapp/src/components/table/tableGroupHeaderRow.tsx#L79)의 버튼이 `props.hideGroup`을 호출하고, [table.tsx:130-149](../../webapp/src/components/table/table.tsx#L130-L149)가 `collapsedOptionIds`를 바꾼 뷰 사본을 `mutator.updateBlock`으로 서버에 저장한다. `mutator.performAsUndoGroup`으로 undo 스택에도 들어간다.
- 열 너비: [table.tsx:110-128](../../webapp/src/components/table/table.tsx#L110-L128)의 `resizeColumn`이 같은 방식으로 `columnWidths`를 저장한다. 드래그 UI는 [tableColumnResizeContext.tsx](../../webapp/src/components/table/tableColumnResizeContext.tsx)의 `ColumnResizeProvider`가 담당하고, 확정 시 `onResizeColumn`(= `resizeColumn`)을 부른다.
- 전파: 서버가 블록 patch마다 [blocks.go:575](../../server/app/blocks.go#L575)에서 팀 전체에 websocket 방송하고, webapp은 [store/views.ts:39-40](../../webapp/src/store/views.ts#L39-L40)에서 수신해 뷰를 갱신한다.
- 소비자: `collapsedOptionIds`·`columnWidths`를 읽는 컴포넌트는 전부 table.tsx가 내려보내는 `activeView` prop 또는 `ColumnResizeProvider` 컨텍스트를 통해 읽는다. **table.tsx 밖에서 두 필드를 읽는 화면 코드는 없다** (mutator의 `changeViewGroupById`가 groupBy 변경 시 두 필드를 초기화하는 것이 유일한 외부 쓰기이며, 이는 공유 구성 변경의 일부다).
- 읽기 전용 차단: 접기 버튼은 `props.readonly`면 무시하고, 열 너비 그립([tableHeader.tsx:90](../../webapp/src/components/table/tableHeader.tsx#L90))은 `readonly`면 렌더되지 않는다. 이때 `readonly`에는 보드 편집 권한이 섞여 있다 ([table.tsx:355](../../webapp/src/components/table/table.tsx#L355)).

## 결정 1: 저장 위치 — Redux 슬라이스 + localStorage

- **Decision**: 신규 Redux 슬라이스 `viewLocalState`에 담고, 변경 시 `UserSettings`(localStorage)에 기록해 재방문 시 복원한다.
- **Rationale**: constitution 원칙 II가 webapp 상태를 Redux Toolkit 슬라이스로 관리하라고 명시한다. 슬라이스로 두면 병합 로직을 selector 단위로 테스트할 수 있고, 나중에 다른 뷰 유형으로 확장할 때 재사용된다. localStorage 지속은 `UserSettings`의 `LastViewId`(뷰별 JSON 맵) 선례를 그대로 따른다.
- **Alternatives considered**:
  - table.tsx 안의 `useState` + localStorage 훅: 파일 수는 적지만 상태 관리 패턴(원칙 II)에서 벗어나고 병합 로직 테스트가 컴포넌트 테스트에 묶인다.
  - 서버 user preference API: 기기 간 동기화가 되지만 서버·API 변경이 필요하고, spec의 가정(기기 단위 유지)을 넘어선다. 필요해지면 슬라이스 뒤의 저장소만 바꾸면 된다.

## 결정 2: 키는 사용자 × 뷰

- **Decision**: 저장 키를 `${userId}:${viewId}`로 구성한다. userId는 스토어의 현재 사용자에서 얻는다.
- **Rationale**: FR-008이 사용자 × 뷰 조합을 요구한다. localStorage는 브라우저 프로필 단위라 같은 브라우저에서 계정을 바꾸면 상태가 섞이는데, 키에 userId를 넣으면 비용 없이 분리된다.
- **Alternatives considered**: viewId 단독 키 — 구현은 단순하지만 계정 전환 시 다른 사용자의 화면 조정이 이어진다. userId 추가 비용이 거의 없어 기각.

## 결정 3: 병합은 table.tsx에서 뷰 사본으로

- **Decision**: table.tsx에서 `activeView`에 개인 상태를 덮어쓴 사본(`useMemo`)을 만들어 하위 컴포넌트·`ColumnResizeProvider`·`hideGroup`이 모두 그 사본을 쓰게 한다.
- **Rationale**: 두 필드의 소비자가 전부 table.tsx 아래에 있으므로, 이 한 지점만 바꾸면 자식 컴포넌트(`tableGroup`, `tableRows`, `tableRowExpandable`, `tableGroupHeaderRow`, `calculationRow`)는 수정이 필요 없다. websocket으로 공유 뷰가 갱신돼도 개인 상태는 별도 슬라이스에 있으므로 덮어써지지 않는다 (spec Edge Case).
- **Alternatives considered**:
  - `store/views.ts`의 selector에서 병합: 모든 뷰 소비자에게 영향이 가고, 공유 구성 편집 화면(뷰 설정 메뉴 등)이 개인 값을 공유 값으로 오인해 저장할 위험이 있다. 기각.
  - 각 자식 컴포넌트에서 개별 구독: 접점이 늘어나고 누락 위험이 커진다. 기각.

## 결정 4: 병합 규칙과 시드

- **Decision**:
  - 접힘: 개인 목록이 **있으면 전체를 대체**, 없으면 공유 값 사용. 첫 토글 때 공유 값을 복사한 뒤 수정해 개인 목록을 만든다.
  - 열 너비: **열 단위 덮어쓰기** — `{...공유, ...개인}`. 조절한 열만 개인 값을 쓰고 나머지는 공유 기본값을 따른다.
- **Rationale**: 접힘은 "현재 화면 전체의 접힘 상태"라는 하나의 스냅샷이므로 전체 대체가 자연스럽다. 열 너비는 열마다 독립적이므로 부분 덮어쓰기가 사용자 기대(조절 안 한 열은 보드 기본값 유지)와 맞는다.
- **Alternatives considered**: 접힘도 그룹 단위 3-상태(펼침/접힘/미지정) 병합 — 공유 기본값 변경이 미지정 그룹에 계속 반영되는 장점이 있으나 모델이 복잡해지고, 공유 기본값은 사실상 고정이라(Assumptions) 이득이 없다. 기각.

## 결정 5: 읽기 전용 허용 범위

- **Decision**: 접기 버튼은 `readonly` 여부와 무관하게 항상 동작시킨다. 열 너비 그립은 렌더 조건에서 보드 편집 권한을 떼어내 항상 렌더한다. 정렬·그룹 숨김·속성 메뉴 등 공유 구성 컨트롤의 권한 게이트는 그대로 둔다.
- **Rationale**: 두 조작이 더 이상 보드 데이터를 바꾸지 않으므로 권한으로 막을 이유가 없다 (FR-006). 공유 링크·아카이브 등 모든 읽기 전용 맥락에서 로컬 조작은 안전하다.
- **Alternatives considered**: 로그인 사용자에게만 허용 — 구분 비용만 들고 이득이 없다. 비로그인(공유 링크) 사용자는 userId가 없으므로 지속 없이 세션 내 동작만 하면 된다.

## 결정 6: undo·이력에서 제외

- **Decision**: `mutator`를 거치지 않으므로 undo 스택·보드 변경 이력에 남지 않는다. 기존 `performAsUndoGroup` 래핑은 제거한다.
- **Rationale**: FR-003. 화면 조정은 데이터 변경이 아니므로 Ctrl+Z의 대상이 아니다. 이는 로컬 `useState`인 서브카드 행 펼치기와 같은 취급이다.

## 결정 7: localStorage 실패와 고아 데이터 처리

- **Decision**: localStorage 접근은 try/catch로 감싸고 실패 시 조용히 메모리 상태로만 동작한다(시크릿 모드 대응, spec Edge Case). 삭제된 그룹 옵션 ID가 개인 목록에 남아도 무시된다(렌더 시 조회 실패가 곧 무시). 저장 맵은 `LastViewId` 선례처럼 상한 없이 두되, 항목이 커지지 않도록 뷰당 두 필드만 저장한다.
- **Rationale**: 기존 `UserSettings` 모듈이 같은 방식으로 동작한다. 고아 ID는 화면 동작에 영향이 없고 능동 청소는 복잡도만 더한다.

## 회귀 위험 지점

- [store/views.ts:39-40](../../webapp/src/store/views.ts#L39-L40)의 참조 동일성 최적화는 그대로 두어도 된다 — 공유 값 변경 감지일 뿐 개인 상태와 무관하다.
- `mutator.changeViewGroupById`(groupBy 변경)는 공유 `collapsedOptionIds`를 초기화한다. groupBy가 바뀌면 그룹 옵션 ID 체계가 통째로 바뀌므로 개인 목록의 기존 ID는 자연히 매칭되지 않는다. 추가 처리 불필요.
- 기존 table 테스트 중 "뷰의 collapsedOptionIds가 접힘을 결정한다"는 전제의 테스트는 시드 규칙(개인 상태 없음 → 공유 값 사용) 덕분에 그대로 통과해야 한다. 깨지면 병합 로직 버그다.
