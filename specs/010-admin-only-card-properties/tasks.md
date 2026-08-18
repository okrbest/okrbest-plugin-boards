---
description: "속성 편집 잠금 구현 과제 목록"
---

# Tasks: 속성 편집을 관리자에게만 열지 보드가 정한다

**Feature**: `010-admin-only-card-properties` | **Plan**: [plan.md](./plan.md)

**Input**: [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md),
[contracts/](./contracts/), [quickstart.md](./quickstart.md)

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 다른 파일을 건드리고 선행 과제가 없어 병렬 가능
- **[US1]~[US4]**: 명세의 사용자 스토리
- 파일 경로를 반드시 적는다

## Path Conventions

- 서버: `server/model/`, `server/api/`
- 화면: `webapp/src/`
- 테스트는 대상 옆에 둔다 — Go는 같은 패키지 `_test.go`, webapp은 `*.test.ts(x)`

## 테스트는 선택이 아니다

헌법 원칙 IV가 동작 변경에 테스트를 요구하고, 원칙 IX가 `/speckit-implement`에서
`test-driven-development`를 명시 호출하게 한다. **실패를 먼저 본 뒤에만 과제를 완료로
표시한다.** 첫 실행에서 통과한 테스트는 아무것도 증명하지 않는다 — 구현을 되돌려 실패를
확인하거나 `미검증`으로 표시한다.

---

## Phase 1: Setup

- [X] T001 변경 전 기준선을 재서 `specs/010-admin-only-card-properties/baseline.md`에 남긴다 — `make server-lint` 지적 목록, `make server-test` 실패 테스트 목록, `cd webapp && npm run test` 실패 스위트 목록, `npm run check-types` 오류 목록. 회귀 판정은 개수가 아니라 이 목록의 diff로 한다(헌법 원칙 I)

**Checkpoint**: 기준선이 파일로 남아 있어야 이후 모든 게이트 판정이 가능하다

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 안전망을 먼저 세우고 설정 읽기를 만든다. 잠그는 길을 만들기 전에 잠그지 않은
길이 안전한지 못 박는다

### 안전망 — 지금 동작을 테스트로 고정한다

- [X] T002 `server/api/boards_test.go`에 잠금이 없는 보드에서 에디터가 `updatedCardProperties`를 보내면 200임을 확인하는 테스트를 더한다 (계약 C-01). **지금 코드에서 통과해야 한다** — 통과하지 않으면 기준선 이해가 틀린 것이다
- [X] T003 `server/api/boards_and_blocks_test.go`에 같은 것을 묶음 경로로 더한다 — 에디터가 `deletedCardProperties`를 보내면 200 (계약 C-02). 테스트 파일이 없으면 새로 만든다
- [X] T004 T002·T003을 실행해 둘 다 통과함을 확인하고 출력을 남긴다. 이 둘은 앞으로 US1 구현이 기존 보드를 깨뜨리면 즉시 붉어지는 그물이다

### 설정 읽기 (data-model.md)

- [X] T005 [P] `server/model/card_property_lock_test.go`를 쓴다 — 키 없음/`false`/`true`, 그리고 boolean이 아닌 값(문자열·숫자·개체·nil)이 전부 꺼짐으로 읽히는지 (FR-001·002·003). 실패를 확인한다
- [X] T006 `server/model/card_property_lock.go`에 `AdminOnlyCardPropertiesKey`와 읽기 함수를 만들어 T005를 통과시킨다. boolean 단언에 실패하면 꺼짐이다
- [X] T007 [P] `webapp/src/blocks/board.ts`에 같은 키를 읽는 헬퍼와 타입을 더한다. 서버와 같은 규율 — boolean일 때만 잠김. 옆에 `*.test.ts`로 같은 경계 케이스를 고정한다

**Checkpoint**: 설정을 양쪽에서 읽을 수 있고, 잠그지 않은 보드의 두 경로가 테스트로 묶였다

---

## Phase 3: User Story 1 - 보드 관리자가 속성 편집을 잠근다 (Priority: P1) 🎯 MVP

**Goal**: 잠금이 켜진 보드에서 에디터의 속성 편집이 서버에서 거절된다

**Independent Test**: 보드 설정에 잠금을 직접 켠 뒤, 에디터로 속성 추가·삭제를 시도하면
거절되고 카드 값 변경은 성공한다

### Tests for User Story 1

- [X] T008 [P] [US1] `server/api/boards_test.go`에 계약 C-03(잠김·에디터·속성 갱신 → 403), C-05(잠김·관리자·속성 갱신 → 200), C-07(잠김·에디터·속성을 안 건드리는 패치 → 200), C-10(저장값이 boolean이 아님·에디터 → 200)을 더한다. 실패를 확인한다
- [X] T009 [P] [US1] `server/api/boards_and_blocks_test.go`에 묶음 경로의 C-04(잠김·에디터·속성 삭제 → 403), C-06(잠김·관리자·속성 삭제 → 200)을 더한다. 실패를 확인한다

### Implementation for User Story 1

- [X] T010 [US1] `server/api/boards.go`에 보드 패치가 카드 속성을 건드리는지 판정하는 헬퍼를 더한다 — 갱신된 카드 속성이 있거나 삭제된 카드 속성이 있으면 참. 같은 패키지의 `patchTouchesPropertyAccess`·`patchTouchesOkrBoard` 옆에 둔다
- [X] T011 [US1] `server/api/boards.go`의 `handlePatchBoard`에 관문을 더한다 — 카드 속성을 건드리고 보드가 잠겨 있으면 Manage 등급을 요구한다. 잠금이 꺼져 있으면 아무것도 하지 않는다 (FR-004·005·006·007). T008을 통과시킨다
- [X] T012 [US1] `server/api/boards_and_blocks.go`의 `handlePatchBoardsAndBlocks`에 같은 관문을 더한다. 이 경로가 **속성 삭제와 유형 변경의 길**이다 (R1). 판정 지점 바로 뒤에 이미 `a.app.GetBoard(boardID)`가 있으므로 설정 조회를 그 자리에 맞춘다. T009를 통과시킨다
- [X] T013 [US1] T002·T003을 다시 실행해 여전히 통과하는지 확인한다. 붉어지면 잠금이 꺼진 보드까지 막고 있는 것이다

**Checkpoint**: 서버가 잠긴 보드의 속성 편집을 두 경로에서 거절하고, 잠그지 않은 보드는 그대로다

---

## Phase 4: User Story 2 - 잠그지 않은 보드는 달라지지 않는다 (Priority: P1)

**Goal**: 이 기능이 기존 보드의 동작을 한 톨도 바꾸지 않았음을 증명한다

**Independent Test**: 잠금을 켠 적 없는 보드에서 에디터로 속성 추가·변경·삭제·옵션 편집이
모두 성공한다

### Tests for User Story 2

- [X] T014 [P] [US2] `server/api/boards_test.go`에 잠금을 켰다가 끈 보드에서 에디터의 속성 편집이 200임을 확인하는 테스트를 더한다 — `false`가 저장된 경우도 꺼짐이다 (US2 수용 시나리오 3)
- [X] T015 [US2] 서버 전체 테스트를 돌려 실패 목록을 T001 기준선과 대조한다. 새 실패가 하나도 없어야 한다

**Checkpoint**: 서버 쪽 회귀가 없음이 목록 대조로 증명됐다

---

## Phase 5: User Story 4 - 스위치는 관리자만 만진다 (Priority: P2)

**Goal**: 잠금 설정 자체를 관리자만 켜고 끈다. 화면에도 관리자에게만 보인다

**Independent Test**: 에디터로 공유 위젯을 열면 토글 섹션이 없고, 요청을 직접 보내도 거절된다

> US3보다 먼저 한다. US3의 수동 검증에 토글이 필요하다

### Tests for User Story 4

- [X] T016 [P] [US4] `server/api/boards_test.go`에 계약 C-08(에디터가 잠금 설정을 켜거나 끄면 403)과 C-09(관리자면 200이고 결과가 보드에 남는다)를 더한다. 실패를 확인한다
- [X] T017 [P] [US4] `webapp/src/components/shareBoard/adminOnlyPropertiesSection.test.tsx`를 쓴다 — 에디터에게 섹션이 없고 보드 관리자에게 있다, 토글이 저장된 상태를 반영한다, 켜고 끄면 각각의 갱신이 호출된다 (U-09, FR-014). 실패를 확인한다

### Implementation for User Story 4

- [X] T018 [US4] `server/api/boards.go`에 잠금 설정 키를 건드리는 패치를 판정하는 헬퍼를 더하고 `handlePatchBoard`에서 Manage 등급을 요구한다 (FR-009). `patchTouchesOkrBoard`와 같은 모양이다. T016을 통과시킨다
- [X] T019 [US4] `webapp/src/mutator.ts`에 잠금을 켜고 끄는 함수를 더한다. `enableOkrBoard`·`disableOkrBoard`와 같은 경로(보드 갱신)를 쓴다 — 되돌리기와 웹소켓 전달이 거기서 온다
- [X] T020 [US4] `webapp/src/components/shareBoard/adminOnlyPropertiesSection.tsx`를 만든다. `okrBoardSection.tsx`의 구조를 그대로 차용한다 — `Switch` 위젯 + `BoardPermissionGate`, `tabs-content` 클래스. **새 SCSS 파일을 만들지 않는다**(헌법 원칙 II). T017을 통과시킨다
- [X] T021 [US4] `webapp/src/components/shareBoard/shareBoard.tsx`에 섹션을 배치한다. `OkrBoardSection` 옆이다
- [X] T022 [P] [US4] `webapp/i18n/en.json`과 `webapp/i18n/ko.json`에 제목·설명 문자열을 **같은 변경으로** 더한다 (헌법 원칙 V). `OkrBoard.title`·`OkrBoard.description` 쌍이 선례다

**Checkpoint**: 관리자가 화면에서 잠금을 켜고 끌 수 있고, 에디터는 그 스위치에 닿지 못한다

---

## Phase 6: User Story 3 - 잠긴 보드에서는 잠긴 조작이 화면에 없다 (Priority: P2)

**Goal**: 서버가 거절할 조작을 화면이 내밀지 않는다. 값 고르는 자리는 남는다

**Independent Test**: 잠긴 보드를 에디터로 열면 속성·옵션 편집 진입점이 없고 값 고르기는
되며, 같은 보드를 관리자로 열면 전부 있다

### Tests for User Story 3

- [X] T023 [P] [US3] `webapp/src/hooks/permissions.test.tsx`에 판정 훅 테스트를 더한다 — 잠금 꺼짐이면 기존 답, 켜짐이면 Manage 등급만, 설정을 아직 모르면 잠기지 않은 것으로 본다 (ui-surfaces 계약). 실패를 확인한다
- [X] T024 [P] [US3] `webapp/src/components/table/tableHeaderMenu.test.tsx`에 U-01을 더한다 — 잠김·에디터면 속성 추가·삭제 항목이 없고, 꺼짐이면 있다. 파일이 없으면 새로 만든다
- [X] T025 [P] [US3] `webapp/src/components/cardDetail/cardDetailProperties.test.tsx`에 U-02·U-03을 더한다
- [X] T026 [P] [US3] `webapp/src/properties/select/select.test.tsx`에 U-04와 **U-08**을 더한다 — 잠김·에디터면 옵션 만들기·이름·색·삭제가 없고, **값 고르기는 남는다**
- [X] T027 [P] [US3] `webapp/src/properties/multiselect/multiselect.test.tsx`에 U-05·U-08을 같은 방식으로 더한다
- [X] T028 [P] [US3] `webapp/src/components/kanban/kanbanColumnHeader.test.tsx`와 `kanban.test.tsx`에 U-06·U-07을 더한다

### Implementation for User Story 3

- [X] T029 [US3] `webapp/src/hooks/permissions.tsx`에 잠금을 반영한 판정 훅을 더한다. 잠금이 꺼져 있으면 기존 `ManageBoardProperties` 답을, 켜져 있으면 `ManageBoardRoles` 답을 돌려준다. T023을 통과시킨다
- [X] T030 [P] [US3] `webapp/src/components/table/tableHeaderMenu.tsx`의 속성 추가·삭제 항목을 새 훅으로 감싼다. **이 파일에는 지금 권한 게이트가 아예 없다**(R6) — 잠금과 무관하게 새로 만드는 자리다
- [X] T031 [P] [US3] `webapp/src/components/cardDetail/cardDetailProperties.tsx`의 `canEditBoardProperties`를 새 훅으로 바꾼다
- [X] T032 [P] [US3] `webapp/src/properties/select/select.tsx`에서 옵션 편집 콜백만 조건부로 넘긴다 — `onCreate`·`onChangeColor`·`onDeleteOption`·`onStartRename`·`onReorderOption`. **`onChange`·`onDeleteValue`는 건드리지 않는다**(FR-013). `readOnly`로 넘기지 않는다 (R5)
- [X] T033 [P] [US3] `webapp/src/properties/multiselect/multiselect.tsx`에 같은 처리를 한다
- [X] T034 [P] [US3] `webapp/src/components/kanban/kanbanColumnHeader.tsx`와 `kanban.tsx`의 열 추가·이름·색·삭제를 새 훅으로 감싼다
- [X] T035 [US3] webapp 전체 테스트를 돌려 실패 스위트 목록을 T001 기준선과 대조한다

**Checkpoint**: 잠긴 보드에서 에디터가 볼 화면이 서버 판정과 일치한다

---

## Phase 7: Polish & 검증

- [X] T036 `make server-lint` 지적 목록을 T001 기준선과 대조한다. 새 지적이 있으면 그 코드를 고친다 — 억누르지 않는다(헌법 원칙 III)
- [X] T037 `make server-test` 실패 목록을 기준선과 대조한다 (CI 미집행이라 로컬 필수)
- [X] T038 `cd webapp && npm run test`, `npm run check-types` 결과를 각각 기준선과 대조한다
- [X] T039 `MM_DEBUG=1 make dist-linux` 후 배포하고 브라우저를 하드 리프레시한다
- [X] T040 [quickstart.md](./quickstart.md) 시나리오 1~6을 실제 계정으로 훑고 결과를 이 파일에 기록한다. **시나리오 1(잠그지 않은 보드)과 시나리오 4(요청 직접 보내기)를 빠뜨리지 않는다** — 전자는 회귀, 후자는 두 경로가 실제로 막혔는지다
- [X] T041 SC-001~SC-006을 하나씩 대조해 충족 여부를 기록한다

---

## Dependencies & Execution Order

```
Phase 1 (기준선)
   └─▶ Phase 2 (안전망 + 설정 읽기)   ← 여기가 막히면 아무것도 못 한다
          └─▶ Phase 3: US1 (서버 관문)  🎯 MVP
                 └─▶ Phase 4: US2 (회귀 없음 증명)
                        └─▶ Phase 5: US4 (토글 + 화면 스위치)
                               └─▶ Phase 6: US3 (화면 표면 다섯)
                                      └─▶ Phase 7 (게이트 + 실계정 검증)
```

- **US1은 Phase 2 없이 시작할 수 없다** — 설정을 읽지 못하면 판정할 수 없다
- **US4가 US3보다 앞선다** — 우선순위는 같은 P2지만, US3를 사람이 확인하려면 토글이 있어야 한다
- **US2는 검증 단계다** — 새 코드를 만들지 않고 Phase 3가 기존 동작을 깨지 않았음을 목록 대조로 증명한다

### 병렬 기회

| 묶음 | 과제 |
|---|---|
| Phase 2 설정 읽기 | T005·T007 (서버·화면 각각) |
| US1 테스트 | T008·T009 (경로 둘) |
| US4 테스트·i18n | T016·T017·T022 |
| US3 테스트 | T023~T028 (표면마다 다른 파일) |
| US3 구현 | T030~T034 (T029 완료 후, 표면마다 다른 파일) |

---

## Implementation Strategy

### MVP

**Phase 1 + 2 + 3**이 MVP다. 서버가 잠긴 보드를 거절하고 잠그지 않은 보드는 그대로다.
이 지점에서 잠금은 설정을 직접 써야 켤 수 있지만, 보호는 실제로 작동한다.

### 증분

1. **MVP** — 서버 강제 (T001~T013)
2. **회귀 증명** — 기존 보드가 안전함을 목록으로 (T014·T015)
3. **쓸 수 있게** — 토글 UI로 관리자가 켜고 끈다 (T016~T022)
4. **헛수고 없게** — 잠긴 조작을 화면에서 치운다 (T023~T035)
5. **믿을 수 있게** — 게이트 + 실계정 검증 (T036~T041)

각 단계 끝에서 멈춰도 앞 단계가 깨지지 않는다.

### 가장 흔한 실패 방식

- **묶음 경로(T012)를 빠뜨린다** → 속성 삭제·유형 변경이 통과하는데 겉보기엔 기능이 돈다. T009가 이것만 잡는다
- **`readOnly`로 감춘다(T032)** → 값 고르기까지 막혀 카드 작성이 마비된다. T026의 U-08이 이것만 잡는다
- **꺼진 보드를 막는다** → T002·T003·T013·T015가 이것만 잡는다

---

## 검증 결과 (2026-08-18)

### 품질 게이트 — 기준선([baseline.md](./baseline.md)) 대비

| 게이트 | 기준선 | 변경 후 | 판정 |
|---|---|---|---|
| `make server-lint` | 11건 | 11건 | 목록 diff 없음 |
| `make server-test` | 12건 | 12건 | 목록 diff 없음 |
| `npm run check-types` | 23건 | 23건 | 목록 diff 없음 |
| `npm run test` (jest) | 58스위트 | 57스위트 | `sidebarBoardItem` 하나 줄었다. 기준선·현재 모두 단독 실행에서는 통과하는 산발 실패다 |

### 종단 검증 — [quickstart.md](./quickstart.md)

실계정으로 잼. 관리자 = `deukyeol.lee`(만든 보드의 admin), 에디터 = `kiyoon.kwon`.

| 시나리오 | 확인 | 결과 |
|---|---|---|
| 1. 잠그지 않은 보드 | 에디터 속성 추가·삭제 (FY27 실보드) | 200 / 200 |
| 2. 관리자가 잠근다 | 잠금 켜기, 보드에 남는지 | 200, `adminOnlyCardProperties: true` |
| 4. 에디터·P1 경로 | 속성 추가 / 옵션 편집 | **403 / 403** |
| 4. 에디터·P2 경로 | 속성 삭제(묶음) | **403** |
| 4. 에디터·토글 | 잠금 끄기 | **403** |
| 4. 에디터·그 밖 | 보드 제목 변경 (C-07) | 200 |
| 5. 관리자·잠긴 보드 | 속성 추가 / 옵션 추가 / 속성 삭제 | 200 / 200 / 200 |
| 6. 잠금 해제 후 | 에디터 속성 추가·삭제 | 200 / 200 |

검증용 보드는 삭제했고 FY27 실보드에 흔적이 남지 않았음을 확인했다.

### SC 대조

| SC | 판정 | 근거 |
|---|---|---|
| SC-001 잠긴 보드 에디터의 속성 편집 100% 거절 | 충족 | 시나리오 4의 세 갈래 전부 403 |
| SC-002 잠긴 보드 에디터의 값 편집 100% 성공 | 충족 | 화면 테스트 U-08 (select·multiselect). 서버는 값 편집 경로를 건드리지 않는다 |
| SC-003 잠그지 않은 보드는 도입 전과 동일 | 충족 | 시나리오 1·6, 그리고 안전망 테스트 C-01·C-02가 구현 전후 모두 통과 |
| SC-004 잠긴 조작의 진입점이 화면에 없다 | 충족 | U-01~U-07 테스트. 표·카드 상세·select·multiselect·칸반 |
| SC-005 에디터는 토글을 못 만진다 | 충족 | 화면은 U-09 테스트, 요청은 시나리오 4에서 403 |
| SC-006 관리자는 잠금과 무관 | 충족 | 시나리오 5 |

### 종단에서 드러난 결함 하나

설정을 한 번도 쓴 적 없는 보드에 첫 설정을 쓰면 서버가 패닉했다
(`assignment to entry in nil map`, `model/board.go`). 잠금뿐 아니라 접근 규칙·OKR
설정도 같은 자리를 지나므로 기존 결함이다. 재현 테스트를 남기고 고쳤다.

품질 게이트만으로는 못 잡았다 — 기존 테스트가 모두 properties를 가진 보드로만
패치했기 때문이다. 헌법 원칙 I이 "화면 동작이 바뀌는 변경은 게이트만으로 부족하다"고
적은 이유가 이것이다.
