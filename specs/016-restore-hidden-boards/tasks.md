---
description: "숨긴 보드 복구 UI 구현 과제 목록"
---

# Tasks: 숨긴 보드를 사이드바에서 되찾는다

**Feature**: `016-restore-hidden-boards` | **Plan**: [plan.md](./plan.md)

**Input**: [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md),
[contracts/](./contracts/), [quickstart.md](./quickstart.md)

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 다른 파일을 건드리고 선행 과제가 없어 병렬 가능
- **[US1]~[US4]**: 명세의 사용자 스토리
- 파일 경로를 반드시 적는다

## Path Conventions

- 화면: `webapp/src/` — 이번 범위는 webapp뿐이다. 서버 과제 없음
- 테스트는 대상 옆에 둔다 — `*.test.ts(x)`
- 스타일은 새 파일을 만들지 않고 `sidebarCategory.scss`·`flashMessages.scss`에 더한다 (원칙 II)

## 테스트는 선택이 아니다

헌법 원칙 IV가 동작 변경에 테스트를 요구하고, 원칙 IX가 `/speckit-implement`에서
`test-driven-development`를 명시 호출하게 한다. **실패를 먼저 본 뒤에만 과제를 완료로
표시한다.** 첫 실행에서 통과한 테스트는 아무것도 증명하지 않는다 — 구현을 되돌려 실패를
확인하거나 `미검증`으로 표시한다.

스냅샷 테스트가 있는 파일(`flashMessages.test.tsx`, `sidebarCategory.test.tsx`,
`sidebarBoardItem.test.tsx`)에 케이스를 더할 때는 describe **끝**에 붙인다. 중간에 끼우면
react-select 인스턴스 id가 밀려 무관한 스냅샷이 깨진다.

---

## Phase 1: Setup

- [X] T001 변경 전 기준선을 재서 `specs/016-restore-hidden-boards/baseline.md`에 남긴다 — `cd webapp && npx jest --ci 2>&1 | grep '^FAIL' | awk '{print $2}' | sort -u` 실패 스위트 목록, `npm run check-types` 오류 목록, `npx eslint <변경 예정 파일>` 지적. 010의 [baseline.md](../010-admin-only-card-properties/baseline.md)와 다른 점만 적어도 된다(2026-09-23 기준 jest는 `sidebarBoardItem.test.tsx` 한 줄만 빠진 57스위트다). 회귀 판정은 개수가 아니라 이 목록의 diff로 한다(헌법 원칙 I)

**Checkpoint**: 기준선이 파일로 남아 있어야 이후 모든 게이트 판정이 가능하다

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 두 스토리(행, 실행 취소)가 함께 쓰는 세 조각 — 알림 확장, 숨김 해제 함수,
숨긴 보드 계산 — 을 먼저 세운다

### 알림 확장 (contracts/unhide-flow.md F-04·F-05, research R3)

- [X] T002 [P] `webapp/src/components/flashMessages.test.tsx` describe 끝에 케이스를 더한다 — ① `action`이 있으면 `action.label`을 접근 가능한 이름으로 가진 버튼이 그려진다, ② 버튼 클릭이 `onClick`을 부르고 알림을 닫으며 컨테이너 클릭으로 번지지 않는다, ③ `durationMs: 500`이면 `milliseconds={200}`이어도 500ms 뒤에 사라진다, ④ `action` 없는 메시지의 마크업은 기존 스냅샷과 같다, ⑤ `durationMs: 5200` 메시지 직후 기본 메시지를 보내면 앞 메시지가 즉시 바뀌고 새 메시지는 `milliseconds` 뒤에 사라진다(앞 타이머가 남지 않는다, F-05·FR-010). 실패를 확인한다
- [X] T003 `webapp/src/components/flashMessages.tsx`의 `FlashMessage`에 `action?: {label: string, onClick: () => void}`·`durationMs?: number`를 더하고 `FlashMessages`가 F-04·F-05대로 동작하게 한다. 버튼 스타일은 `webapp/src/components/flashMessages.scss`의 `.FlashMessages` 블록 안에 `&__action`으로 더한다(CSS 변수만, 하드코딩 금지). T002를 통과시킨다

### 숨김 해제 함수 (contracts/unhide-flow.md F-01·F-02, research R1·R10)

- [X] T004 [P] `webapp/src/mutator.test.ts` describe 끝에 `unhideBoard` 케이스를 더한다 — ① 응답 `ok`면 `updateBoardCategories([{boardID, categoryID, hidden: false}])`를 dispatch 하고 `true` — 실제 리듀서에 통과시켜 그 카테고리 메타데이터의 순서가 그대로인지도 단언한다(SC-004), ② 응답이 `ok`가 아니면 dispatch 없이 `false`, ③ `octoClient.unhideBoard`가 예외를 던지면 `Utils.logError` 뒤 `false`. `octoClient`는 이 파일이 이미 jest.mock 한다. 실패를 확인한다
- [X] T005 `webapp/src/mutator.ts`에 `unhideBoard(categoryID: string, boardID: string): Promise<boolean>`을 더한다. `createBoardMember`처럼 `octoClient` 호출 뒤 `store.dispatch`로 스토어를 갱신한다. undo 등록은 하지 않는다. T004를 통과시킨다

### 숨긴 보드 계산 (research R8, data-model)

- [X] T006 [P] `webapp/src/components/sidebar/categoryBoards.test.ts`에 `getHiddenCategoryBoards` describe를 더한다 — 메타데이터 순서 유지, `hidden`만 포함, 스토어에 없는 보드 제외, 템플릿 제외, `hidden` 0개면 빈 배열. 실패를 확인한다
- [X] T007 `webapp/src/components/sidebar/categoryBoards.ts`에 `getHiddenCategoryBoards(category, boards): Board[]`를 `getVisibleCategoryBoards` 옆에 같은 꼴로 더한다. T006을 통과시킨다

**Checkpoint**: 알림에 버튼을 달 수 있고, 숨김 해제 한 함수가 있고, 숨긴 보드 목록을 셀 수 있다

---

## Phase 3: User Story 1 - 숨긴 보드를 그 자리에서 되찾는다 (Priority: P1) 🎯 MVP

**Goal**: 카테고리 아래 "숨긴 보드 N개" 행을 펼쳐 "다시 표시"로 되찾는다

**Independent Test**: 보드 하나를 숨긴 뒤 카테고리 아래 행을 펼쳐 "다시 표시"를 누르면
보드가 목록에 돌아오고 행이 사라진다

### Tests for User Story 1 (contracts/ui-surfaces.md U-01~U-04, U-09)

- [X] T008 [P] [US1] `webapp/src/components/sidebar/hiddenBoardsRow.test.tsx`를 새로 만든다 — U-01(숨긴 보드 2개 → `숨긴 보드 2개` 헤더, Draggable 아님), U-01a(0개 → 아무것도 안 그림), U-01c(스토어에 없는 보드는 세지 않음), U-02(헤더 클릭으로 펼침/접힘, 다시 그려도 유지), U-03(항목 순서·아이콘·제목·`HideIcon`·`subitem` 클래스, 항목 클릭이 이동하지 않음), U-04(`다시 표시` 버튼 → `mutator.unhideBoard(categoryID, boardID)`), U-09(`unhideBoard`가 `false`면 `sendFlashMessage`가 `severity: 'high'`로 불림). `mutator`·`flashMessages`는 jest.mock. 모듈이 없어 실패함을 확인한다
- [X] T009 [P] [US1] `webapp/src/components/sidebar/sidebarCategory.test.tsx` describe 끝에 U-01b를 더한다 — 펼친 카테고리에서 보드 목록 아래에 행이 있고, 카테고리를 접거나 `forceCollapse`·`draggedItemID`가 이 카테고리면 행이 없다. 실패를 확인한다

### Implementation for User Story 1

- [X] T010 [US1] `webapp/src/components/sidebar/hiddenBoardsRow.tsx`를 만든다 — props `{categoryBoards: CategoryBoards, boards: Board[]}`. `getHiddenCategoryBoards`로 목록을 얻고 0개면 `null`. `useState(false)`로 펼침. 헤더는 `octo-sidebar-item subitem` + `ChevronRight`/`ChevronDown` + `HiddenBoards.count`(react-intl plural). 항목은 `octo-sidebar-item subitem` + 보드 아이콘(`sidebarBoardItem.tsx`처럼 `board.icon`을 `EmojiIcon`으로, 없으면 `CompassIcon product-boards`)·제목 + `HideIcon` + `IconButton`(`ShowIcon`, `title`=`HiddenBoards.show`) → `mutator.unhideBoard`, 실패 시 `sendFlashMessage({content: HiddenBoards.showFailed, severity: 'high'})`. T008을 통과시킨다
- [X] T011 [US1] `webapp/src/components/sidebar/sidebarCategory.scss`의 `.SidebarCategory` 블록 안에 `.HiddenBoardsRow`를 더한다 — 항목의 `IconButton`은 `sidebarBoardItem.scss:102-112`의 `.MenuWrapper` 패턴처럼 hover/focus-within 때만 `display: block`. `@media (hover: none)`(터치 화면)에서는 항상 보이게 한다(FR-005). 색·간격은 같은 파일의 CSS 변수와 값을 쓴다. 새 SCSS 파일 금지(원칙 II)
- [X] T012 [US1] `webapp/src/components/sidebar/sidebarCategory.tsx`에서 `</Droppable>` 닫힘 직후, 모달들 앞에 `<HiddenBoardsRow>`를 그린다. 표시 조건은 보드 목록과 같은 식 `!(collapsed || props.forceCollapse || snapshot.isDragging || props.draggedItemID === props.categoryBoards.id)`을 재사용한다 (R4). T009를 통과시킨다
- [X] T013 [P] [US1] `webapp/i18n/ko.json`에 `HiddenBoards.count`(`숨긴 보드 {count}개`), `HiddenBoards.show`(`다시 표시`), `HiddenBoards.showFailed`(`보드를 다시 표시하지 못했습니다`)를 더한다 (R7)
- [X] T014 [US1] `cd webapp && npx jest src/components/sidebar/sidebarBoardDnd.test.tsx --coverage=false`를 돌려 3건이 그대로 통과함을 확인하고 출력을 남긴다 (U-10, SC-005)

**Checkpoint**: 숨긴 보드가 행에 보이고 하나씩 되찾을 수 있다. 끌어 놓기는 그대로다

---

## Phase 4: User Story 2 - 잘못 숨긴 직후 되돌린다 (Priority: P1)

**Goal**: 숨기기 직후 "실행 취소" 알림으로 그 자리에서 되돌린다

**Independent Test**: 보드를 숨긴 직후 "실행 취소"를 누르면 보드가 제자리로 돌아오고
알림이 사라진다

### Tests for User Story 2 (contracts/ui-surfaces.md U-07·U-08·U-09)

- [X] T015 [US2] `webapp/src/components/sidebar/sidebarBoardItem.test.tsx` describe 끝에 케이스를 더한다 — ① `보드 숨기기` 클릭 뒤 `sendFlashMessage`가 보드 제목이 든 `content`, `action.label`(=`HideBoard.undo`), `durationMs: 5200`으로 불린다(`../flashMessages` jest.mock), ② 그 `action.onClick()`을 부르면 `mutator.unhideBoard(categoryID, boardID)`가 불리고 경로는 바뀌지 않는다, ③ `unhideBoard`가 `false`면 `HiddenBoards.showFailed` 알림(high)이 뜬다. 실패를 확인한다

### Implementation for User Story 2

- [X] T016 [US2] `webapp/src/components/sidebar/sidebarBoardItem.tsx`의 `handleHideBoard` 끝(현재 보드 이동 처리 뒤)에 `sendFlashMessage({content, severity: 'low', durationMs: 5200, action: {label, onClick}})`를 더한다. `onClick`은 `mutator.unhideBoard`를 부르고 실패면 `showFailed` 알림. 화면 이동은 하지 않는다 (R9, FR-009). T015를 통과시킨다
- [X] T017 [P] [US2] `webapp/i18n/ko.json`에 `HideBoard.hiddenNotice`(`'{title}' 보드를 숨겼습니다`), `HideBoard.undo`(`실행 취소`)를 더한다 (R7)

**Checkpoint**: US1과 US2가 각각 독립으로 동작한다. 둘 다 같은 `mutator.unhideBoard`를 쓴다

---

## Phase 5: User Story 3 - 전부 숨긴 카테고리가 이유를 말한다 (Priority: P2)

**Goal**: 보이는 보드가 없고 숨긴 보드가 있으면 "보드가 존재하지 않음" 대신 행만 보인다

**Independent Test**: 카테고리의 보드를 전부 숨긴 뒤 펼쳐 보면 "보드가 존재하지 않음"
문구가 없고 숨긴 보드 행만 있다

### Tests for User Story 3 (contracts/ui-surfaces.md U-06)

- [X] T018 [US3] `webapp/src/components/sidebar/sidebarCategory.test.tsx` describe 끝에 U-06 세 케이스를 더한다 — ① 보이는 0·숨긴 1 → `Sidebar.no-boards-in-category` 문구 없음, 행 있음, ② 보이는 0·숨긴 0 → 문구 있음, ③ `isNew` 카테고리 → 끌어다 놓기 안내 그대로. 실패를 확인한다. 그리고 `webapp/src/components/sidebar/sidebar.test.tsx`의 기존 테스트 `dont show hidden boards`(178행, 숨긴 보드 1개일 때 "No boards inside" 1개를 기대)는 이 기능이 기대를 뒤집으므로 기대를 "문구 없음·`숨긴 보드 1개` 행 있음"으로 고치고 스냅샷을 갱신한다. 삭제하지 않는다

### Implementation for User Story 3

- [X] T019 [US3] `webapp/src/components/sidebar/sidebarCategory.tsx`의 `visibleBlocks.length === 0` 분기에서 `!props.categoryBoards.isNew` 문구 조건에 "숨긴 보드 0개"를 더한다(`getHiddenCategoryBoards(props.categoryBoards, props.boards).length === 0`). `isNew` 분기는 건드리지 않는다. T018과, 기대를 고친 기존 테스트를 통과시킨다

**Checkpoint**: 전부 숨긴 카테고리가 오해를 부르지 않는다

---

## Phase 6: User Story 4 - 한 번에 모두 되찾는다 (Priority: P3)

**Goal**: 행 헤더의 "모두 표시"로 카테고리의 숨긴 보드를 한 번에 되찾는다

**Independent Test**: 보드 3개를 숨긴 뒤 "모두 표시"를 누르면 셋 다 돌아오고 행이 사라진다

### Tests for User Story 4 (contracts/ui-surfaces.md U-05, unhide-flow F-03)

- [X] T020 [US4] `webapp/src/components/sidebar/hiddenBoardsRow.test.tsx` describe 끝에 케이스를 더한다 — ① 펼침·숨긴 보드 2개 이상이면 `모두 표시` 버튼이 있고 클릭 시 `mutator.unhideBoard`가 메타데이터 순서로 차례로 불린다(`invocationCallOrder`), ② 둘 중 하나가 `false`면 `sendFlashMessage`(high)가 정확히 한 번 불린다, ③ 숨긴 보드 1개면 버튼이 없다. 실패를 확인한다

### Implementation for User Story 4

- [X] T021 [US4] `webapp/src/components/sidebar/hiddenBoardsRow.tsx` 헤더에 `Button` 위젯(`webapp/src/widgets/buttons/button.tsx`)으로 `모두 표시`를 더한다. `for...of`로 순차 호출, 실패를 모아 끝에 알림 한 번 (F-03). T020을 통과시킨다
- [X] T022 [P] [US4] `webapp/i18n/ko.json`에 `HiddenBoards.showAll`(`모두 표시`)을 더한다 (R7)

**Checkpoint**: 네 스토리가 모두 독립으로 동작한다

---

## Phase 7: Polish & 검증

- [X] T023 `cd webapp && npm run i18n-extract`로 `webapp/i18n/en.json`을 갱신하고, 키 6개(`HiddenBoards.count/show/showAll/showFailed`, `HideBoard.hiddenNotice/undo`)가 en·ko 양쪽에 있는지 대조한다 (원칙 V). en 문구는 research R7 표를 따른다
- [X] T024 `webapp/src/components/__snapshots__/flashMessages.test.tsx.snap`·`webapp/src/components/sidebar/__snapshots__/sidebarCategory.test.tsx.snap`·`webapp/src/components/sidebar/__snapshots__/sidebarBoardItem.test.tsx.snap`·`webapp/src/components/sidebar/__snapshots__/sidebar.test.tsx.snap`의 변경을 하나씩 열어 의도한 변경(알림 버튼, 카테고리 아래 행)만인지 확인한 뒤에 `npm run updatesnapshot`을 그 파일에만 돌린다. 무관한 스냅샷이 깨졌으면 T002·T009·T015·T018을 describe 끝에 붙였는지부터 본다
- [X] T025 품질 게이트 — `cd webapp && npm run check`, `npm run test`, `npm run check-types`를 따로 돌려 실패 목록이 T001 기준선(`specs/016-restore-hidden-boards/baseline.md`)과 같은지 diff로 보이고 결과를 그 파일에 덧붙인다 (개수 비교는 근거가 아니다). 새 지적은 억누르지 않고 고친다(원칙 III)
- [X] T026 종단 검증 — `make webapp && make deploy-from-watch` 뒤 브라우저를 하드 리프레시하고 [quickstart.md](./quickstart.md) 시나리오 1~7을 실제 계정으로 훑어 절별 결과를 이 파일 끝 "검증 결과"에 기록한다. **시나리오 6(실패 알림)과 7(끌어 놓기)을 빠뜨리지 않는다** — 전자는 SC-006, 후자는 SC-005다. 카테고리에 실제로 속한 보드로 한다 (R11)
- [X] T027 SC 검증 — `specs/016-restore-hidden-boards/spec.md`의 SC-001~SC-006을 하나씩 실측해 충족 여부를 이 파일(`specs/016-restore-hidden-boards/tasks.md`) 끝 "검증 결과"에 기록한다. 명세의 수치가 추정이었으면 실측값으로 명세를 갱신한다

---

## Dependencies & Execution Order

```
Phase 1 (기준선)
   └─▶ Phase 2 (알림 확장 ∥ 숨김 해제 함수 ∥ 숨긴 보드 계산)   ← 세 묶음은 서로 독립
          ├─▶ Phase 3: US1 (접힘 행)  🎯 MVP
          │      └─▶ Phase 5: US3 (빈 문구 — 행 컴포넌트와 계산 함수를 쓴다)
          │      └─▶ Phase 6: US4 (모두 표시 — 행 컴포넌트를 확장한다)
          └─▶ Phase 4: US2 (실행 취소 — Phase 2만 있으면 된다)
                 └─▶ Phase 7 (게이트 + 실계정 검증)  ← 모든 스토리 뒤
```

- **US1과 US2는 서로 독립이다** — 둘 다 Phase 2의 `mutator.unhideBoard`를 쓰지만 서로를 부르지 않는다. 사람이 둘이면 동시에 간다
- **US3·US4는 US1 뒤다** — 행 컴포넌트가 있어야 한다
- **Phase 2의 세 묶음은 병렬이다** — 파일이 겹치지 않는다

### 병렬 기회

| 묶음 | 과제 |
|---|---|
| Phase 2 테스트 | T002·T004·T006 (파일 셋) |
| Phase 2 구현 | T003·T005·T007 (각자 자기 테스트 뒤) |
| US1 테스트 | T008·T009 |
| US1 i18n | T013 (구현과 무관) |
| US1 ∥ US2 | Phase 3 전체와 Phase 4 전체 |
| US2 i18n | T017 |
| US4 i18n | T022 |

---

## Implementation Strategy

### MVP

**Phase 1 + 2 + 3**이 MVP다. 숨긴 보드가 어디 있는지 보이고 거기서 되찾는다. 이 지점에서
실행 취소는 없지만 되찾는 길은 열려 있다.

### 증분

1. **MVP** — 접힘 행 (T001~T014)
2. **실수 즉시 되돌리기** — 실행 취소 알림 (T015~T017)
3. **오해 제거** — 전부 숨긴 카테고리 문구 (T018·T019)
4. **편의** — 모두 표시 (T020~T022)
5. **믿을 수 있게** — i18n·스냅샷·게이트·실계정 검증 (T023~T027)

각 단계 끝에서 멈춰도 앞 단계가 깨지지 않는다.

### 가장 흔한 실패 방식

- **행을 Droppable 안에 넣는다(T012)** → 드래그 중 자리표시자가 흔들리고 드롭 위치가 어긋난다. T014가 이것만 잡는다
- **알림 버튼 클릭이 컨테이너로 번진다(T003)** → 실행 취소가 실행되기 전에 알림이 닫히거나 두 번 닫힌다. T002 ②가 이것만 잡는다
- **`action` 없는 알림의 마크업을 바꾼다(T003)** → 기존 스냅샷 셋이 깨지고 무관한 회귀로 보인다. T002 ④가 이것만 잡는다
- **응답 `ok`를 안 본다(T005)** → 실패가 조용히 사라진다. T004 ②가 이것만 잡는다
- **스토어에 없는 보드를 센다(T007)** → 지워진 보드가 "숨긴 보드 1개"로 남아 되찾을 수 없다. T006이 이것만 잡는다
- **`sidebar.test.tsx`의 기존 `dont show hidden boards` 테스트를 그대로 둔다(T018)** → 이 기능이 그 테스트의 기대("No boards inside")를 바꾸므로 반드시 붉어진다. 삭제하지 말고 기대를 고친다

---

## 검증 결과 (2026-09-23)

### 품질 게이트 — 기준선([baseline.md](./baseline.md)) 대비

| 게이트 | 결과 |
|---|---|
| jest 전체 (`npx jest --ci`, 최종 코드) | 실패 스위트 57개, 기준선 목록과 diff 없음 |
| tsc | 파일별 오류 수 기준선과 동일 |
| eslint (변경 파일 13개) | 새 지적 없음 (resolver 환경 오류·기존 `generatePath`·기존 `any` 경고만) |
| stylelint (scss 2개) | 깨끗 |
| 스냅샷 | `sidebar.test.tsx.snap` 의도한 항목 1개만 갱신 |

새 테스트 33건(alerts 5, mutator 3, categoryBoards 2, hiddenBoardsRow 10, sidebarCategory 4,
sidebarBoardItem 3, sidebar 기대 수정 1 등)이 모두 **실패를 먼저 보인 뒤** 통과했다.

### 종단 검증 — [quickstart.md](./quickstart.md)

`make webapp && make deploy-from-watch`로 배포하고 서빙 번들에 `HiddenBoardsRow__header`가
있음을 확인했다. 계정은 로컬 모드 소켓으로 만든 임시 비관리자 `qa-hidden-boards`
(팀 상한 50→80 임시 상향, 검증 뒤 비활성화·원복). 화면 로케일은 영어였다(로컬 모드에
사용자 patch API가 없어 못 바꿈). 한국어 문구는 ko.json 키 대조(T023)로 확인했다.
카테고리에 실제로 속한 보드는 API로 3개를 등록해 썼다 (R11).

| 시나리오 | 결과 | 근거 |
|---|---|---|
| 1 숨기고 바로 되돌린다 (US2) | 통과 | 알림 `“FY27 KKV 정규업무” was hidden` + Undo. 숨긴 동안 행 `1 hidden board`. Undo 뒤 원래 자리(3번째)로 복귀, 행·알림 소멸, URL 불변. 알림을 기다리면 사라지고 보드는 숨김 유지 |
| 2 접힘 행에서 되찾는다 (US1) | 통과 | 행 펼침 → 흐린 항목 + 눈 꺼짐 아이콘(`016-s2-row-expanded.png`). hover 뒤 Show → 2번째 자리로 복귀, 행 소멸, 실패 알림 없음 |
| 3 전부 숨긴 카테고리 (US3) | 통과 | `QA 숨김`(2개 전부 숨김): "No boards inside" 없음, 행 `2 hidden boards`만. 새로 고쳐도 유지. 대조군 `QA 빈`은 "No boards inside" 그대로. 카테고리 접으면 행도 사라지고 펼치면 돌아옴(FR-002) |
| 4 모두 표시 (US4) | 통과 | 펼친 행에 Show all 보임 → 둘 다 원래 순서(수명업무, 정규업무)로 복귀, 행 소멸 |
| 5 다른 탭 반영 (FR-014) | 통과 | 탭1 Show → 탭2 행 소멸·보드 표시. 탭2 Hide → 탭1 행 `1 hidden board` 등장 |
| 6 실패 알림 (SC-006) | 통과 | `/unhide` 요청을 차단하고 Show → `Couldn't show the board`(class `high`), 항목은 행에 그대로 |
| 7 끌어 놓기 (SC-005) | 통과 | Boards에 숨긴 보드 1개를 둔 채 `OKR Best 개요`를 맨 위로 끌어 놓음 → 순서 반영, 오류 화면 0, 행 유지. 새로 고쳐도 순서와 행 유지 |

### SC 대조

| SC | 판정 | 실측 |
|---|---|---|
| SC-001 클릭 두 번으로 되찾기 | 충족 | 행 펼치기 1 + Show 1 (시나리오 2) |
| SC-002 직후 클릭 한 번으로 되돌리기 | 충족 | Undo 1회 (시나리오 1) |
| SC-003 오해 문구 없음 | 충족 | 시나리오 3 |
| SC-004 원래 순서 100% | 충족 | 시나리오 1·2·4 모두 원래 인덱스로 복귀. 단위 테스트(mutator ①)도 순서 단언 |
| SC-005 끌어 놓기 불변 | 충족 | 시나리오 7 + `sidebarBoardDnd.test.tsx` 3건 |
| SC-006 실패 100% 알림 | 충족 | 시나리오 6 + U-09·F-03 테스트 |

### 종단에서 드러난 것

- ICU MessageFormat에서 곧은 작은따옴표는 이스케이프 문자다. `'{title}'`이 자리표시자로
  풀리지 않아 굽은따옴표로 바꿨다(research R7에 기록).
- `npm run i18n-extract`는 en.json을 통째로 재생성해 무관한 키 380줄을 바꾼다. 키는 손으로
  넣었다(baseline.md T023).
