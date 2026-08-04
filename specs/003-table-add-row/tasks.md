---

description: "Task list for 표 보기 카드 추가 진입점"
---

# Tasks: 표 보기 카드 추가 진입점

**Input**: Design documents from `/specs/003-table-add-row/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/)

**Tests**: 테스트 과제를 **포함한다**. constitution 원칙 IV(동작 변경 시 테스트 동반)가 요구하고, superpowers `test-driven-development`가 런타임에 실패 테스트 우선을 집행하며, contracts에 계약 테스트 18항목(T-01~T-18)이 정의돼 있다.

**Organization**: 과제를 사용자 스토리별로 묶어 각 스토리를 독립적으로 구현·검증할 수 있게 한다.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 병렬 실행 가능 (다른 파일, 미완료 과제에 의존하지 않음)
- **[Story]**: 대응하는 사용자 스토리 (US1~US3)
- 설명에 정확한 파일 경로를 포함한다

## Path Conventions

- 웹앱만 변경한다. 서버 과제가 없다
- 컴포넌트: `webapp/src/components/table/`, `webapp/src/components/`
- 문자열: `webapp/i18n/{en,ko}.json`
- 테스트는 대상 옆에 colocated (`*.test.tsx`)

---

## Phase 1: Setup (공유 컴포넌트)

**Purpose**: 세 진입점 중 두 곳이 함께 쓰는 추가 줄 컴포넌트를 만든다

- [ ] T001 [P] 추가 줄 컴포넌트 계약 테스트 T-01~T-04를 `webapp/src/components/table/tableAddRow.test.tsx`에 먼저 작성 — 라벨 표시, 클릭 시 `onClick` 호출, `ManageBoardCards` 없으면 미렌더, `indented`가 클래스에 반영 (contracts §5)
- [ ] T002 추가 줄 컴포넌트를 `webapp/src/components/table/tableAddRow.tsx`에 구현 — props는 `label`·`onClick`·`indented`. 기존 `.octo-table-footer` / `.octo-table-cell`을 쓰고 **새 클래스를 정의하지 않는다**. `BoardPermissionGate permissions={[Permission.ManageBoardCards]}`로 감싼다 (contracts §1)
- [ ] T003 들여쓰기 규칙을 `webapp/src/components/table/table.scss`에 추가 — **신규 SCSS 파일을 만들지 않는다.** 색상·간격은 기존 값과 CSS 변수만 쓴다
- [ ] T004 [P] 신규 문자열 3개를 `webapp/i18n/en.json`과 `webapp/i18n/ko.json`에 동시 추가 — `TableComponent.plus-new-card`·`TableComponent.plus-new-subcard`·`CardActionsMenu.addSubCard` (data-model.md §3, constitution 원칙 V)

**Checkpoint**: 추가 줄 컴포넌트가 존재하고 문자열이 준비됐다. 아직 어디에도 배치되지 않았다

---

## Phase 2: Foundational (차단 선행 작업)

**Purpose**: US2·US3가 의존하는 하위 카드 생성 배선. **US1은 이 단계를 기다리지 않는다** — 기존 `addCard`만 쓴다

**⚠️ 주의**: US2·US3는 이 단계가 끝나기 전에 시작할 수 없다

- [ ] T005 `addSubCard` 배선 테스트 T-15·T-16을 `webapp/src/components/centerPanel.test.tsx`에 먼저 작성 — `mutator.createSubCard` 호출과 성공 시 포커스 대상 지정, 실패 시 flash message (contracts §2 C-02·C-03·C-04)
- [ ] T006 `addSubCard(parentCard)` 콜백을 `webapp/src/components/centerPanel.tsx`에 구현 — 깊이 한도 확인(C-01), `mutator.createSubCard(board.id, parentCard.id, '', afterRedo)`, `afterRedo`에서 `dispatch(addSubCard(...))`와 `setCardIdToFocusOnRender(...)`, 실패 시 `sendFlashMessage`. **카드 상세를 열지 않는다**(C-07). 빈 `catch` 금지 (constitution 원칙 III)
- [ ] T007 중복 클릭 차단을 `webapp/src/components/centerPanel.tsx`의 `addSubCard`에 추가 — 처리 중 두 번째 호출을 무시한다 (C-06, FR-015). `cardDetail/subCards.tsx`의 `isAdding`과 같은 방식
- [ ] T008 `addSubCard`를 표 컴포넌트 계층으로 전달 — `webapp/src/components/table/table.tsx` → `tableGroup.tsx` → `tableRows.tsx` → `tableRowExpandable.tsx`. 기존 `addCard`와 같은 경로를 따르고 새 Context를 만들지 않는다 (contracts §2)

**Checkpoint**: 하위 카드를 만들 수 있는 콜백이 표 행까지 닿는다. 아직 부르는 UI가 없다

---

## Phase 3: User Story 1 - 그룹 목록 끝에서 카드를 이어 만든다 (Priority: P1) 🎯 MVP

**Goal**: 속성으로 묶인 표에서 그룹마다 목록 끝에 추가 줄을 놓아, 방금 만든 카드 바로 아래에서 다음 카드를 이어 만들게 한다

**Independent Test**: 속성으로 묶인 표에서 한 그룹의 목록 끝 추가 줄을 눌러 카드가 그 그룹에 생기는지, 제목을 바로 입력할 수 있는지 확인한다

### Tests for User Story 1 ⚠️ 구현 전에 작성하고 실패를 확인한다

- [ ] T009 [P] [US1] 그룹 추가 줄 계약 테스트 T-05~T-08을 `webapp/src/components/table/tableGroup.test.tsx`에 작성 — 카드 있는 그룹 끝에 추가 줄 1개, 카드 0개 그룹에도 표시, 접힌 그룹엔 미표시, 클릭 시 `addCard(group.option.id)` (contracts §5)

### 구현

- [ ] T010 [US1] 그룹 끝에 추가 줄을 `webapp/src/components/table/tableGroup.tsx`에 배치 — `TableRows` 뒤에 `TableAddRow`. `group.cards.length > 0` 조건은 `TableRows`에만 남겨 **빈 그룹에도 추가 줄이 나오게** 한다 (FR-002). 접힘(`isCollapsed`)일 때는 둘 다 그리지 않는다 (FR-003)
- [ ] T011 [US1] 추가 줄 클릭을 `webapp/src/components/table/tableGroup.tsx`에서 `props.addCard(group.option.id)`에 연결 — 그룹 속성값 채움과 제목 인라인 포커스는 기존 `addCard`가 이미 한다 (FR-004, FR-012, research.md R1)
- [ ] T012 [US1] 그룹 없는 보기의 기존 푸터와 그룹 머리글 `+`가 그대로인지 `webapp/src/components/table/table.test.tsx`에서 확인 — 이 기능은 그 둘을 바꾸지 않는다 (FR-005, FR-006)
- [ ] T013 [US1] 표 스냅샷을 갱신한다 — 추가 줄이 생기므로 변화가 정당하다. 변경 의도를 확인한 뒤 갱신하고, 갱신 전후로 그 스위트의 실패 **개수**가 같은지 확인한다 (constitution 원칙 IV)

**Checkpoint**: 그룹으로 묶은 표에서 목록 끝 추가 줄로 카드를 이어 만들 수 있다. **여기까지가 MVP다**

---

## Phase 4: User Story 2 - 하위 카드를 표에서 바로 만든다 (Priority: P2)

**Goal**: 펼친 하위 카드 목록 끝에 추가 줄을 놓아, 카드 상세를 열지 않고 하위 카드를 더하게 한다

**Independent Test**: 하위 카드가 있는 카드를 펼쳐 목록 끝 추가 줄을 누르고, 하위 카드가 그 카드 아래에 생기는지 확인한다

### Tests for User Story 2 ⚠️ 구현 전에 작성하고 실패를 확인한다

- [ ] T014 [P] [US2] 하위 추가 줄 계약 테스트 T-09~T-11을 `webapp/src/components/table/tableSubCardRows.test.tsx`에 작성 — 하위 목록 끝에 추가 줄, 부모 깊이가 한도에 닿으면 미표시, 클릭 시 `addSubCard(parentCard)` (contracts §5)
- [ ] T015 [P] [US2] 하위 카드 포커스 전달 테스트 T-18을 `webapp/src/components/table/tableSubCardRows.test.tsx`에 추가 — `cardIdToFocusOnRender`가 하위 행까지 닿는다 (research.md R4)

### 구현

- [ ] T016 [US2] `TableSubCardRows` props에 `parentCard`·`addSubCard`·`cardIdToFocusOnRender`를 추가하고 `webapp/src/components/table/tableRowExpandable.tsx`에서 전달 — 지금 `cardIdToFocusOnRender`가 `TableRowExpandable`에서 멈춘다 (contracts §4, data-model.md §2.1)
- [ ] T017 [US2] 하위 목록 끝에 추가 줄을 `webapp/src/components/table/tableSubCardRows.tsx`에 배치 — `TableAddRow indented`. 부모 깊이가 한도 미만일 때만 그린다 (FR-007, FR-011)
- [ ] T018 [US2] 추가 줄 클릭을 `webapp/src/components/table/tableSubCardRows.tsx`에서 `props.addSubCard(parentCard)`에 연결 (FR-012)

**Checkpoint**: 하위 카드가 있는 카드는 표 안에서 하위 카드를 늘릴 수 있다. 하위가 0개인 카드는 아직 진입점이 없다

---

## Phase 5: User Story 3 - 하위 카드가 없는 카드에서 첫 하위 카드를 만든다 (Priority: P3)

**Goal**: 하위 카드가 하나도 없어 목록이 없는 카드에, 행의 ⋯ 메뉴로 첫 하위 카드를 만들 진입점을 준다

**Independent Test**: 하위 카드가 없는 카드의 더 많은 행동 메뉴에서 하위 카드 추가를 고르고, 그 카드가 펼쳐지며 새 하위 카드가 보이는지 확인한다

### Tests for User Story 3 ⚠️ 구현 전에 작성하고 실패를 확인한다

- [ ] T019 [P] [US3] ⋯ 메뉴 항목 계약 테스트 T-12~T-14를 `webapp/src/components/table/tableRow.test.tsx`에 추가 — 하위 0개·깊이 여유면 항목 있음, 하위 ≥ 1이면 없음, 깊이 한도면 없음 (contracts §5)
- [ ] T020 [P] [US3] 자동 펼침 테스트 T-17을 `webapp/src/components/table/tableRow.test.tsx`에 추가 — 하위 개수가 0 → 1이 되면 부모가 펼쳐진다 (FR-010, data-model.md §2.2)

### 구현

- [ ] T021 [US3] ⋯ 메뉴 항목을 `webapp/src/components/table/tableRow.tsx`에 주입 — `CardActionsMenu`의 `children`으로 `Menu.Text` 하나. 하위 0개·깊이 여유·읽기 전용 아님일 때만. **`CardActionsMenu` 자체는 수정하지 않는다** (FR-008, FR-009, contracts §3)
- [ ] T022 [US3] 하위 개수 0 → 1 전이 시 자동 펼침을 `webapp/src/components/table/tableRowExpandable.tsx`에 구현 — 기존 `hasSubCards` `useEffect`를 넓힌다. 위에서 별도 신호를 내려보내지 않는다 (FR-010, data-model.md §2.2)
- [ ] T023 [US3] 다른 보기(보드·갤러리·캘린더)의 ⋯ 메뉴에 항목이 새지 않는지 `webapp/src/components/cardActionsMenu/cardActionsMenu.test.tsx`에서 확인 — 표 행에서만 주입하므로 나오지 않아야 한다

**Checkpoint**: 하위 카드 유무와 무관하게 표 안에서 하위 카드를 만들 수 있다. 세 사용자 스토리가 모두 동작한다

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: 여러 스토리에 걸친 마무리

- [ ] T024 [P] 세 진입점의 권한·읽기 전용 게이트를 한 번에 검증 — 권한 없는 사용자와 읽기 전용 보기에서 어느 것도 보이지 않는다 (FR-013, SC-003). data-model.md §4의 표시 조건표가 기준이다
- [ ] T025 [P] UI 일관성을 확인한다 — `webapp/src/components/table/`에서 신규 SCSS 파일 0개, 하드코딩된 색상 0건, 추가 줄이 기존 푸터와 같아 보이는지 (constitution 원칙 II, plan.md Constraints)
- [ ] T026 `make webapp-ci`를 실행하고 출력을 완료 근거로 제시 — baseline 대비 **신규 실패 0건**. 개수가 아니라 실패 스위트 목록을 diff 한다 (constitution 원칙 I, quickstart.md)
- [ ] T027 [quickstart.md](quickstart.md)의 수동 검증 시나리오 1~6과 회귀 확인표를 배포된 플러그인에서 검증
- [ ] T028 브랜치를 `develop`에 선형 병합할 수 있도록 정리 (rebase 기반, constitution 원칙 VIII)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: 의존 없음, 즉시 시작
- **Foundational (Phase 2)**: Setup 완료에 의존. **US2·US3만 차단한다 — US1은 차단하지 않는다**
- **US1 (Phase 3)**: Setup(T002)에만 의존. Foundational을 기다리지 않는다
- **US2 (Phase 4)**: Setup + Foundational 완료에 의존
- **US3 (Phase 5)**: Setup + Foundational 완료에 의존. US2와 병렬 가능하나 T022는 US2의 T016과 같은 파일(`tableRowExpandable.tsx`)을 건드리므로 순차
- **Polish (Phase 6)**: 원하는 스토리가 모두 끝난 뒤

### 스토리 간 의존 (이 기능의 특수 사정)

**US1은 하위 카드와 무관하다.** 기존 `addCard`만 쓰므로 Foundational 없이 완결된다. 템플릿 기본형과 달리 Phase 2가 전체를 차단하지 않는다.

**US3는 US2를 완성하는 조각이다.** 둘 다 하위 카드 생성 배선을 공유하고, US2만 배포하면 "하위 카드가 있는 카드만 표에서 하위를 늘릴 수 있다"는 어정쩡한 상태가 된다. **함께 배포하는 것을 권한다.**

### Within Each User Story

- 테스트를 먼저 작성하고 **실패를 확인한 뒤** 구현한다 (superpowers TDD)
- 배치 → 클릭 연결 → 회귀 확인 순

### Parallel Opportunities

- **Phase 1**: T001·T004 병렬. T002는 T001 후, T003은 T002와 같은 시각 자산이라 T002 후
- **Phase 2**: T005 → T006 → T007 순차 (같은 파일). T008은 T006 후
- **Phase 3 테스트**: T009 단독
- **Phase 4 테스트**: T014·T015 병렬 (같은 파일이지만 서로 다른 케이스라 한 번에 작성 가능)
- **Phase 5 테스트**: T019·T020 병렬
- **US1과 US2·US3**: Setup만 끝나면 US1을 Foundational과 병렬로 진행할 수 있다
- **Phase 6**: T024·T025 병렬. T026~T028은 순차

---

## Parallel Example: 초기 착수

```
# Setup에서 두 갈래로 시작
T001  tableAddRow.test.tsx        ∥  T004  i18n en/ko

# T002(컴포넌트) 완료 후 두 갈래
US1 갈래:          T009 → T010 → T011 → T012 → T013
Foundational 갈래: T005 → T006 → T007 → T008 → (US2) T014 ∥ T015 → T016 → T017 → T018
                                                → (US3) T019 ∥ T020 → T021 → T022 → T023
```

---

## Implementation Strategy

### MVP 범위

**US1(Phase 1 + Phase 3)이 MVP다.** 그룹으로 묶은 표에서 카드를 이어 만드는 것이 이 기능이 해결하려는 가장 잦은 불편이고, 하위 카드 배선 없이 완결된다.

Phase 2를 건너뛰고 US1만 먼저 내보낼 수 있다 — 다른 기능들과 달리 이 기능의 Foundational은 US1을 차단하지 않는다.

### 권장 배포 단위

| 배포 | 포함 | 상태 |
|---|---|---|
| 1차 | Phase 1 + 3 (US1) | 그룹 보기에서 카드 이어 만들기 완성 |
| 2차 | Phase 2 + 4 + 5 (US2 + US3) | 표에서 하위 카드 만들기 완성 |
| 3차 | Phase 6 | 마무리·검증 |

US2와 US3는 나눠 배포하지 않는다. 위 "스토리 간 의존" 참조.

### 점진 전달

1. Phase 1을 끝내고 추가 줄 컴포넌트 테스트가 통과하는지 확인한다 — 화면 변화 없음
2. Phase 3을 끝내고 그룹 보기에서 카드를 이어 만들어 본다 → **1차 배포**
3. Phase 2·4·5를 끝내고 하위 카드 두 진입점을 확인한다 → **2차 배포**
4. Phase 6 → **3차 배포**
