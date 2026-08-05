---

description: "Task list for 004-table-drag-reorder"
---

# Tasks: 표 보기 드래그 재정렬·중첩

**Input**: Design documents from `/specs/004-table-drag-reorder/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/drop-target.md](contracts/drop-target.md), [quickstart.md](quickstart.md)

**Tests**: 포함한다. 헌법 원칙 IV(동작 변경 시 테스트 동반)가 요구하고, [contracts/drop-target.md](contracts/drop-target.md)가 필수 케이스를 명시한다. 순서는 **테스트 먼저**다 — 판정 규칙이 이 기능의 전부이고, 규칙을 테스트로 못 박기 전에 구현하면 무엇이 맞는지 코드가 정의해버린다.

**Organization**: 사용자 스토리별로 묶어 각 단계가 독립적으로 검증 가능한 증분이 되게 했다.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 병렬 가능 (다른 파일, 미완 작업에 의존하지 않음)
- **[Story]**: 소속 사용자 스토리 (US1~US5)
- 파일 경로를 반드시 적는다

## Path Conventions

이 저장소는 webapp/server 2패키지 구조다. **이번 기능은 `webapp/`만 건드린다.**

- 표 컴포넌트: `webapp/src/components/table/`
- 훅: `webapp/src/hooks/`
- 스토어: `webapp/src/store/`
- 테스트는 대상 옆에 colocated (`*.test.ts` / `*.test.tsx`)

---

## Phase 1: Setup

**Purpose**: 회귀 판정 기준선을 잡는다. 이 저장소는 깨끗한 상태에서도 실패하는 테스트가 있어 **실패 개수로는 회귀를 판정할 수 없다.**

- [X] T001 브랜치 분기점 `24e4ca46`에서 worktree를 떼어 `npx jest --coverage=false --silent`를 돌리고 실패 스위트 목록을 `/tmp/fail-before.txt`에 저장한다 ([quickstart.md](quickstart.md)의 절차)

**Checkpoint**: 회귀 판정 기준선 확보

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 모든 스토리가 딛는 토대. **현행 결함 3건(B1~B3) 수정이 여기 들어간다** — 이걸 고치지 않으면 US1조차 데이터를 어긋나게 만든다.

**⚠️ 이 단계를 마치기 전에는 어떤 사용자 스토리도 시작하지 않는다.**

### 상수·슬롯

- [X] T002 [P] 들여쓰기 눈금 22를 `webapp/src/constants.ts`에 `tableSubCardIndentPx`로 올리고, `webapp/src/components/table/tableRow.tsx:183`의 하드코딩을 이 상수 참조로 바꾼다 (research R4 — 판정과 렌더가 같은 값을 봐야 선과 결과가 일치한다)
- [X] T003 [P] `webapp/src/styles/_z-index.scss`에 `table-drop-indicator` 슬롯을 `table-row-action-cell: 100`보다 위 값으로 추가한다 (research R6)

### B3 — 하위 카드가 저장 순서를 따르게 (FR-020, FR-021)

- [X] T004 `webapp/src/store/cards.test.ts`에 실패 테스트를 추가한다: `getCurrentBoardSubCardsByParent`가 각 부모의 자식을 `activeView.fields.cardOrder` 순서로 반환한다
- [X] T005 `webapp/src/store/cards.ts:266`의 `getCurrentBoardSubCardsByParent`가 자식 배열을 `cardOrder` 기준으로 정렬해 반환하도록 고친다 (T004 통과)

### B1 — cardOrder 시드에서 하위 카드가 빠지는 문제

- [X] T006 `webapp/src/components/table/table.test.tsx`에 실패 테스트를 추가한다: 하위 카드를 가진 보드에서 순서를 바꿀 때 `changeViewCardOrder`에 넘어가는 배열에 하위 카드 id가 포함된다
- [X] T007 `webapp/src/components/table/table.tsx:213`의 `cardOrder` 시드를 최상위 카드 목록이 아니라 **보드 전체 카드**로 채우도록 고친다 (T006 통과)

### B2 — 되돌리기 그룹이 갈라지는 문제 (FR-028)

- [X] T008 `webapp/src/components/table/table.test.tsx`에 실패 테스트를 추가한다: 그룹과 순서가 함께 바뀌는 드롭에서 `performAsUndoGroup`이 **한 번만** 호출된다
- [X] T009 `webapp/src/components/table/table.tsx:148`·`:234`의 갈라진 `performAsUndoGroup` 두 개를 하나로 합친다. 안쪽 mutator 호출은 다시 감싸지 않는다 (research R1 — 중첩 그룹은 지원되지 않고, 하위 호출은 열린 그룹에 스스로 참여한다) (T008 통과)

### 서브트리 수집

- [X] T010 [P] `webapp/src/components/table/subtree.test.ts`를 만들어 실패 테스트를 쓴다: 카드 맵에서 `subtreeIds`(부모 → 깊이우선 자손)와 `subtreeHeight`를 구한다. 자손 없음 / 1단 / 3단 / 형제 다수 케이스. **접힘 여부와 무관하게 자손이 포함된다**는 케이스를 포함한다 — 수집 함수는 펼침 상태를 모르므로 저비용이고, 이것이 FR-018의 자동 검증이다
- [X] T011 `webapp/src/components/table/subtree.ts`에 수집 함수를 구현한다 (T010 통과, research R7)

**Checkpoint**: 저장 데이터가 어긋나지 않는 토대 완성. 이 시점에서 하위 카드 순서 이동이 새로고침 후에도 유지된다.

---

## Phase 3: User Story 1 - 순서를 바꾸고 어디 놓일지 보면서 놓는다 (Priority: P1) 🎯 MVP

**Goal**: 핸들로만 드래그하고, 놓일 경계에 선을 그리고, 같은 깊이에서 순서를 바꾼다.

**Independent Test**: 표에서 핸들을 잡아 다른 행 위로 끌었을 때 선이 그 행의 위 또는 아래에 나타나고, 놓으면 선이 있던 자리로 카드가 이동한다. 계층은 바뀌지 않는다.

### 판정 모듈 (테스트 먼저)

- [X] T012 [P] [US1] `webapp/src/components/table/tableDropTarget.test.ts`를 만들어 경계 계산 케이스를 쓴다: 첫 행 위쪽 절반 → `boundaryIndex 0`, 마지막 행 아래쪽 절반 → 마지막 경계, 행 중앙 기준 앞/뒤 전환(FR-006), `rows` 비어 있으면 `null` ([contracts/drop-target.md](contracts/drop-target.md) 필수 케이스)
- [X] T013 [US1] `webapp/src/components/table/tableDropTarget.ts`에 `computeDropIntent`를 구현한다. 이 단계에서는 깊이를 항상 0으로 두고 경계만 계산한다 (T012 통과)

### 표 단위 상태

- [X] T014 [P] [US1] `webapp/src/components/table/tableDragContext.test.tsx`를 만들어 쓴다: `registerRow`/`unregisterRow`가 메트릭을 순서대로 유지하고, 드래그 종료 시 `intent`가 `null`로 돌아가며, **접힌 그룹의 행(`display: none`)은 `rows`에 들어가지 않는다** (FR-024)
- [X] T015 [US1] `webapp/src/components/table/tableDragContext.tsx`를 구현한다. `reportCursor`는 ref에만 적고 판정·상태 갱신은 `requestAnimationFrame`에서 프레임당 1회 수행한다 (T014 통과, research R5). **접힌 행은 등록하지 않는다** — `display: none` 요소의 `getBoundingClientRect()`가 전부 0이라 등록하면 경계 계산이 무너진다 (research R3, [contracts/drop-target.md](contracts/drop-target.md) §2)

### 인디케이터

- [X] T016 [P] [US1] `webapp/src/components/table/tableDropIndicator.test.tsx`를 만들어 쓴다: `intent`가 `null`이면 아무것도 렌더하지 않고, 있으면 `anchorTop`·`indentOffsetPx`가 스타일에 반영된다
- [X] T017 [US1] `webapp/src/components/table/tableDropIndicator.tsx`를 구현한다 (T016 통과, FR-005)
- [X] T018 [US1] `webapp/src/components/table/tableDropTarget.test.ts`에 **표시와 결과를 잇는 단언**을 추가한다: 어떤 커서 좌표에서든 `intent.indentOffsetPx === intent.depth × Constants.tableSubCardIndentPx`. 인디케이터 들여쓰기와 실제 배치 깊이가 같은 상수에서 파생됨을 못 박는다 (FR-007, SC-001). 이 단언이 없으면 둘이 어긋나도 T016·T032가 각각 통과한다
- [X] T019 [US1] `webapp/src/components/table/table.scss`에 인디케이터 블록을 추가한다. `.Table` 기준 `position: absolute`, 색상은 CSS 변수 사용, z-index는 T003 슬롯 (헌법 원칙 II — 신규 SCSS 파일을 만들지 않는다)

### 행 배선

- [X] T020 [P] [US1] `webapp/src/hooks/useTableRowDrag.test.ts`를 만들어 쓴다: 드래그 소스 ref와 드롭 타깃 ref가 **서로 다른 요소**에 붙는다
- [X] T021 [US1] `webapp/src/hooks/useTableRowDrag.ts`를 구현한다. `drag(handleRef)`, `drop(rowRef)`로 분리하고 `hover`에서 좌표를 컨텍스트로 보고한다 (T020 통과). **`webapp/src/hooks/sortable.tsx`는 건드리지 않는다** — 칸반이 쓴다 (FR-030)
- [ ] T022 [US1] `webapp/src/components/table/tableRow.test.tsx`를 고쳐 검증한다: 드래그 ref가 **핸들에만** 붙고, 편집 권한이 없으면 핸들이 렌더되지 않는다 (FR-002, FR-004)
- [ ] T023 [US1] `webapp/src/components/table/tableRow.tsx`의 `useSortable`을 `useTableRowDrag`로 바꾸고, 좌측 ⠿ `IconButton`에 드래그 ref를 붙인다(FR-001). 행에 걸린 `.dragover` 클래스 부여를 제거한다 (T022 통과)

### 적용

- [ ] T024 [P] [US1] `webapp/src/components/table/applyTableDrop.test.ts`를 만들어 순서 전용 케이스를 쓴다: 부모가 안 바뀌면 `linkCardAsSubCard`·`unlinkSubCard`를 호출하지 않고 `changeViewCardOrder`만 호출한다. `performAsUndoGroup` 호출은 1회 ([contracts/drop-target.md](contracts/drop-target.md))
- [ ] T025 [US1] 같은 파일에 **다중 선택 회귀 케이스**를 쓴다: `selectedCardIds`가 여럿인 상태로 순서 이동하면 선택된 카드가 **각자의 서브트리와 함께** 전부 이동한다 (FR-031). 현행 `table.tsx:138`의 `selectedCardIds ∪ {srcCard.id}` 동작을 잃지 않는지 확인하는 것이 목적이다
- [ ] T026 [US1] `webapp/src/components/table/applyTableDrop.ts`를 구현한다. 서브트리 id를 통째로 빼서 목표 경계에 끼워 넣는다(FR-017 — 자손이 순서·상대 계층을 유지한다). `DragItem.selectedCardIds`를 받아 순서 이동일 때 함께 옮긴다 (T024·T025 통과, [data-model.md](data-model.md) 다중 선택 절)
- [ ] T027 [US1] `webapp/src/components/table/table.tsx`를 `TableDragContext`로 감싸고 `TableDropIndicator`를 렌더한다. 드롭 핸들러를 `applyTableDrop`으로 연결한다

### 수동 검증

- [ ] T028 [US1] 플러그인을 배포하고 [quickstart.md](quickstart.md)의 **A1~A8**을 수행한다. 특히 A7(제목 글자 드래그 시 행이 안 끌림)은 이번 변경의 부수 효과라, A8(표를 스크롤하며 드래그해도 선이 목표 경계에 붙어 있음, FR-009)은 자동 테스트가 없는 유일한 확인 경로라 반드시 확인한다

**Checkpoint**: US1 단독으로 배포 가능. 순서 이동과 드롭 인디케이터가 동작한다.

---

## Phase 4: User Story 2 - 드래그로 하위에 넣고 다시 빼낸다 (Priority: P1)

**Goal**: 같은 제스처에 깊이 축을 얹는다. 커서 가로 위치가 계층을 정한다.

**Independent Test**: 최상위 카드를 끌어 윗 카드의 하위로 들어가고, 하위 카드를 끌어 최상위로 나온다. 선의 들여쓰기가 결과와 일치한다.

**Dependency**: Phase 3 완료 필요 (같은 판정 모듈·인디케이터·적용 모듈에 얹힌다)

### 판정 모듈에 깊이 축 (테스트 먼저)

- [ ] T029 [P] [US2] `webapp/src/components/table/tableDropTarget.test.ts`에 깊이 케이스를 추가한다: 커서 x를 오른쪽으로 밀면 상한까지 오르고 멈춘다, 왼쪽으로 당기면 하한까지 내리고 멈춘다, 상한 = `위 행 depth + 1`, 하한 = `아래 행 depth` (FR-010, FR-011)
- [ ] T030 [US2] 같은 파일에 금지 케이스를 추가한다: 자기 자신 앞/뒤 경계 → `null`, 자손 사이 경계 → `null` (FR-013)
- [ ] T031 [US2] 같은 파일에 부모 판정 케이스를 추가한다: 클램프된 깊이에서 위로 거슬러 `depth === 목표 − 1`인 가장 가까운 행이 `parentCardId`가 되고, 깊이 0이면 `''`
- [ ] T032 [US2] `webapp/src/components/table/tableDropTarget.ts`에 깊이 후보 계산·클램프·부모 판정을 구현한다 (T029~T031 통과, [contracts/drop-target.md](contracts/drop-target.md) 판정 순서 3~5)

### 적용에 계층·그룹

- [ ] T033 [P] [US2] `webapp/src/components/table/applyTableDrop.test.ts`에 케이스를 추가한다: 최상위 → 하위면 `linkCardAsSubCard`, 하위 → 최상위면 `unlinkSubCard`, 다른 그룹의 하위면 **끄는 카드에만** `changePropertyValue`를 호출하고 자손에는 호출하지 않는다 (FR-014, FR-015, FR-022, FR-023)
- [ ] T034 [US2] 같은 파일에 실패 케이스를 추가한다: 서버가 거부하면 `sendFlashMessage`가 `severity: 'high'`로 호출된다 (FR-029)
- [ ] T035 [US2] `webapp/src/components/table/applyTableDrop.ts`에 계층·그룹 단계를 구현한다. **`try/catch`를 `performAsUndoGroup`에 넘기는 콜백 안쪽에 둔다** (T033·T034 통과, research R2 — 바깥에 두면 예외가 삼켜져 도달하지 않는다)
- [ ] T036 [US2] FR-016(새 부모가 펼쳐진 상태로 보임)이 **기존 코드로 이미 충족되는지 먼저 확인한다.** `webapp/src/components/table/tableRowExpandable.tsx:38-40`의 `useEffect(() => setExpanded(hasSubCards), [hasSubCards])`가 첫 하위 카드를 얻을 때 자동으로 펼친다. quickstart B2로 확인해 충족되면 **이 태스크는 코드 변경 없이 닫는다.** 충족되지 않을 때만 보완한다

### 수동 검증

- [ ] T037 [US2] [quickstart.md](quickstart.md)의 **B1~B7**과 **D1~D3**(그룹)을 수행한다

**Checkpoint**: 순서와 계층을 한 제스처로 바꿀 수 있다.

---

## Phase 5: User Story 3 - 하위 카드를 거느린 카드를 통째로 옮긴다 (Priority: P1)

**Goal**: 서브트리 높이를 깊이 제한에 반영하고, 함께 움직일 카드를 눈에 보이게 한다.

**Independent Test**: 하위 2개를 거느린 카드를 옮기면 하위가 순서·계층을 유지한 채 따라온다. 3단 서브트리는 깊이 4가 될 자리에 놓이지 않는다.

**Dependency**: **T038·T039만 Phase 4에 의존한다**(깊이 클램프에 얹힌다). T040·T041(반투명 표시)는 Phase 3만 끝나면 병렬로 진행할 수 있다. 서브트리 수집(T010·T011)과 연속 배치(T026)는 Phase 2·3에서 이미 끝났다 — US1도 서브트리가 함께 움직여야 데이터가 어긋나지 않기 때문이다.

- [ ] T038 [P] [US3] `webapp/src/components/table/tableDropTarget.test.ts`에 서브트리 높이 케이스를 추가한다: 높이 2면 상한이 `5 − 2 = 3`으로 잘린다, 아래 행 depth 4 + 높이 2 → 상한 3 < 하한 4 → `null` (FR-012, spec Edge Cases)
- [ ] T039 [US3] `webapp/src/components/table/tableDropTarget.ts`의 상한 계산에 `maxDepth − item.subtreeHeight`를 반영한다 (T038 통과)
- [ ] T040 [P] [US3] `webapp/src/components/table/tableDragContext.test.tsx`에 케이스를 추가한다: 드래그 중 `draggingSubtree`가 서브트리 전체를 담고, 종료 시 빈 집합으로 돌아간다
- [ ] T041 [US3] `webapp/src/components/table/tableRow.tsx`와 `tableRow.scss`에서 `draggingSubtree`에 속한 행 전체를 반투명 처리한다. 지금은 `opacity: 0.5`가 드래그한 행 하나에만 걸린다 (FR-019, T040 통과)
- [ ] T042 [US3] [quickstart.md](quickstart.md)의 **C1~C6**을 수행한다. **C6은 새로고침 후 확인**한다 — B3 회귀 확인 지점이다

**Checkpoint**: 계층이 깨지지 않고 서브트리째 움직인다.

---

## Phase 6: User Story 4 - 드래그할 수 있다는 걸 눈으로 알아챈다 (Priority: P2)

**Goal**: 핸들을 잡을 수 있는 물건처럼 보이게 한다.

**Independent Test**: 행에 마우스를 올렸을 때 핸들이 카드 제목 글자보다 흐리지 않고, 핸들 위에서 커서가 바뀐다.

**Dependency**: Phase 3 완료 필요 (핸들이 실제 드래그 소스여야 의미가 있다)

- [ ] T043 [P] [US4] `webapp/src/components/table/tableRow.scss`의 핸들 스타일을 고친다: hover 시 크기·대비를 키우고 `cursor: grab`, 호버 배경을 준다. 색상은 CSS 변수로 (FR-003, 헌법 원칙 II — 하드코딩 금지)
- [ ] T044 [P] [US4] 드래그 중 `cursor: grabbing`, 놓을 수 없는 자리에서 `cursor: no-drop`이 되도록 `webapp/src/components/table/table.scss`에 상태별 커서를 정의한다 (FR-008)
- [ ] T045 [US4] [quickstart.md](quickstart.md)의 **A1·A2**와 **F1**(권한 없는 계정에 핸들 미표시)을 수행한다

**Checkpoint**: 기능이 발견 가능해진다.

---

## Phase 7: User Story 5 - 정렬이 걸린 표에서도 순서를 바꾼다 (Priority: P3)

**Goal**: 막다른 길을 없앤다. 정렬 중 드롭에 전환을 제안한다.

**Independent Test**: 속성 정렬을 켠 표에서 카드를 놓으면 확인 대화가 뜨고, 승인하면 정렬이 풀리고 이동하며, 거부하면 아무것도 안 바뀐다.

**Dependency**: Phase 3 완료 필요

- [ ] T046 [P] [US5] `webapp/i18n/en.json`과 `webapp/i18n/ko.json`에 정렬 전환 확인 대화 문자열을 **동시에** 추가한다 (헌법 원칙 V)
- [ ] T047 [P] [US5] `webapp/src/components/table/table.test.tsx`에 케이스를 추가한다: 정렬이 켜진 상태의 드롭은 확인 대화를 띄우고, 거부하면 `changeViewSortOptions`·`changeViewCardOrder` 어느 것도 호출되지 않는다 (FR-025, FR-027)
- [ ] T048 [US5] `webapp/src/components/table/table.tsx`에 기존 `ConfirmationDialogBox`로 확인 대화를 붙이고, 승인 시 `mutator.changeViewSortOptions(boardId, viewId, old, [])` 후 `applyTableDrop`을 실행한다 (T047 통과, FR-026)
- [ ] T049 [US5] 드래그 활성 조건에서 `isManualSort || isGrouped` 제약을 걷어낸다. 정렬 중에도 핸들이 보이고 드래그가 시작된다 `webapp/src/components/table/tableRow.tsx`
- [ ] T050 [US5] [quickstart.md](quickstart.md)의 **E1~E4**를 수행한다

**Checkpoint**: 전 스토리 완료.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [ ] T051 `make webapp-ci`를 돌린다. lint·타입·테스트 결과를 기록한다
- [ ] T052 T001의 `/tmp/fail-before.txt`와 현재 실패 스위트 목록을 diff한다. **차이가 없어야 한다.** 칸반 스위트가 새로 등장하면 FR-030 위반이다
- [ ] T053 [quickstart.md](quickstart.md)의 **G1·G2**(칸반 무회귀)를 수동으로 확인한다
- [ ] T054 [P] 신규 파일 전체에 `Copyright (c) 2015-present Mattermost, Inc.` 라이선스 헤더가 있는지 확인한다 (헌법 원칙 VI)
- [ ] T055 [P] `as any`·`@ts-ignore`·`@ts-expect-error`·빈 `catch`가 신규 코드에 없는지 확인한다 (헌법 원칙 III)
- [ ] T056 SC-006(처음 쓰는 사람이 핸들을 스스로 찾아내는가)을 확인할지 결정하고, 확인하지 않기로 했다면 그 판단을 [checklists/requirements.md](checklists/requirements.md)에 남긴다 — 사람을 관찰해야 하는 항목이라 자동 게이트로 만들 수 없다

---

## Dependencies & Execution Order

```
Phase 1 (Setup)
   │
   ▼
Phase 2 (Foundational) ── B1·B2·B3 수정 + 서브트리 수집 + 상수
   │                       ⚠️ 여기를 건너뛰면 US1부터 데이터가 어긋난다
   ▼
Phase 3 (US1) 🎯 MVP ── 핸들 분리 + 경계 판정 + 인디케이터 + 순서 적용
   │
   ├──────────────┬──────────────┐
   ▼              ▼              ▼
Phase 4 (US2)  Phase 6 (US4)  Phase 7 (US5)
계층 축         핸들 스타일     정렬 전환
   │
   ▼
Phase 5 (US3) ── 서브트리 높이 클램프 + 반투명
   │
   ▼
Phase 8 (Polish)
```

**스토리 독립성에 대한 솔직한 기재.** 템플릿은 각 스토리가 독립 증분이길 요구하지만, 이 기능에서 US1~US3은 **같은 제스처의 세 축**이라 완전히 독립적이지 않다.

- US2·US3은 US1의 판정 모듈·인디케이터·적용 모듈 위에 얹힌다. US1 없이는 붙일 곳이 없다.
- 반대로 US1만으로도 배포 가능한 가치가 있다 — 순서 이동과 드롭 인디케이터는 그 자체로 지금의 시행착오를 없앤다.
- 서브트리 연속 배치(T026)는 US3이 아니라 Phase 2·3에 있다. **US1에서도 하위 카드를 거느린 카드를 옮길 수 있고, 그때 자손이 따라가지 않으면 저장 순서가 어긋나기 때문이다.** US3에 남은 것은 깊이 클램프의 높이 반영과 반투명 표시다.
- US4·US5는 US1에만 의존하고 서로 독립이다.

## Parallel Example: Phase 3 (US1)

서로 다른 파일이라 함께 쓸 수 있다.

```
T012 (tableDropTarget.test.ts)
T014 (tableDragContext.test.tsx)
T016 (tableDropIndicator.test.tsx)
T020 (useTableRowDrag.test.ts)
T024 (applyTableDrop.test.ts)
```

`[P]`가 안 붙은 테스트 태스크는 위 파일 중 하나를 공유하므로 해당 파일 담당자가 이어서 쓴다 — T018은 T012와, T025는 T024와 같은 파일이다.

구현은 의존이 있어 순차다: T013 → T015 → T017 → T021 → T023 → T026 → T027.

## Parallel Example: Phase 4 (US2)

```
T029 (tableDropTarget.test.ts)  ─ 이어서 T030, T031 (같은 파일)
T033 (applyTableDrop.test.ts)   ─ 이어서 T034       (같은 파일)
```

두 파일은 서로 독립이라 병렬이고, 각 파일 안에서는 순차다. 구현은 T032 → T035 → T036 순.

## Implementation Strategy

**MVP는 Phase 1~3이다.** 여기까지 하면 핸들로 끌어 순서를 바꾸고 놓일 자리를 선으로 본다. 사용자가 겪던 "놓아 보고 아니면 다시" 가 사라진다.

증분 배포 순서를 권한다.

1. **Phase 1~3** — MVP. 배포하고 A1~A7로 확인한다.
2. **Phase 4~5** — 계층 이동. 요청의 핵심이지만 판정 규칙이 가장 까다로운 구간이라 MVP가 안정된 뒤에 얹는다.
3. **Phase 6** — 핸들 가시성. 독립적이라 언제든 끼워 넣을 수 있다.
4. **Phase 7** — 정렬 전환. 겪는 빈도가 낮다.
5. **Phase 8** — 게이트와 무회귀 확인.

## Notes

- **테스트를 먼저 쓴다.** 판정 규칙이 이 기능의 전부다. 구현부터 하면 "코드가 하는 일"이 규격이 되어버리고, [contracts/drop-target.md](contracts/drop-target.md)의 케이스 표가 사후 정당화로 전락한다.
- **`webapp/src/hooks/sortable.tsx`를 고치지 않는다.** 칸반이 같은 훅을 쓴다. 공용 훅에 손대면 이번 변경의 성패가 칸반 검증에 묶인다 (plan.md Complexity Tracking).
- **서버는 한 줄도 고치지 않는다.** 계층 이동 API·깊이 재귀 갱신·순환 검증이 이미 있다. `make server-lint`·`make server-test`는 이번 변경의 게이트가 아니다.
- **`webpack.config.js`는 건드리지 않지만**, 혹시 고치게 되면 watch를 재시작해야 반영된다.
- 완료 선언 전에 게이트 출력을 근거로 제시한다 (헌법 원칙 I).
