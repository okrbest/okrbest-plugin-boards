# Tasks: OKR Board로 사용

**Feature**: `008-okr-board-mode` | **Date**: 2026-08-14

**Input**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 다른 파일을 건드리고 선행 과제가 없어 병렬로 진행 가능
- **[US1]~[US3]**: [spec.md](./spec.md)의 사용자 이야기 번호
- 모든 과제에 파일 경로를 적는다

## Path Conventions

경로는 저장소 루트 기준이다. **이번 변경은 `server/`와 `webapp/` 둘 다 닿는다** —
006·007과 다른 점이고, 게이트가 셋으로 는다.

**테스트는 요청됐다.** constitution 원칙 IV가 동작 변경에 테스트를 요구하고,
superpowers `test-driven-development`가 실패 테스트 우선을 집행한다. 단 **T002만
예외**다 — 타입 선언만 더하고 행동을 바꾸지 않는다.

**Go를 고치면 `make server-linux` 없이는 화면에 반영되지 않는다.** webpack watch는
Go를 다시 빌드하지 않는다. 하위 카드 채움을 종단으로 볼 때마다 이걸 먼저 확인한다.

**속성 이름 `유형`과 값 이름은 번역하지 않는다.** 화면 언어에 따라 달라지면 이미
만들어 둔 속성을 못 알아본다.

---

## Phase 1: Setup (Shared Infrastructure)

- [X] T001 기준선 측정 — `git stash -u` 후 `webapp/`에서 `npx jest --silent`·`npm run check-types`·`npm run check`를, 저장소 루트에서 `make server-lint`와 `make server-test`를 돌려 실패 목록을 작업 폴더에 저장한다. **server 기준선을 이번에 처음 잡는다** ([quickstart.md](./quickstart.md) 8절)

---

## Phase 2: Foundational (Blocking Prerequisites)

**목적**: 설정 읽기와 깊이→값 매핑을 서버·클라이언트 양쪽에 세운다. 두 구현이
갈라지지 않게 하는 것은 시험뿐이므로, 같은 입력에 같은 결과가 나오는지를 각각 확인한다
([contracts/okr-board-mode.md](./contracts/okr-board-mode.md) 1절).

**⚠️ 이 단계는 화면을 바꾸지 않는다.** 함수만 생기고 아직 아무도 부르지 않는다.

- [X] T002 [P] `webapp/src/blocks/board.ts`에 OKR 보드 설정 타입을 더한다 — 속성 ID와 단계별 옵션 ID 배열. `board.properties`에 들어가는 형태다 ([data-model.md](./data-model.md) 1절)
- [X] T003 [P] `server/model/okr_board_test.go`(신규)에 실패 테스트를 쓴다 — 설정이 없으면 nil, 정상이면 값이 채워진다, 깨진 JSON이면 도메인 오류다, 깊이 0·1·2·4가 각각 어느 옵션 ID로 가는지, 배열 끝을 넘으면 마지막 항목이다, 설정이 가리키는 옵션이 없으면 빈 값이다
- [X] T004 `server/model/okr_board.go`(신규)에 설정 형태와 읽기·매핑을 구현해 T003을 통과시킨다. 읽기는 `model/property_access.go`의 JSON 재인코딩 방식을 그대로 따른다 ([research.md](./research.md) R1)
- [X] T005 [P] `webapp/src/okrBoard.test.ts`(신규)에 T003과 **같은 규칙**의 실패 테스트를 쓴다 — 설정 읽기(없음·정상·깨짐), 깊이→옵션 ID, 배열 끝 넘김
- [X] T006 `webapp/src/okrBoard.ts`(신규)에 구현해 T005를 통과시킨다
- [X] T007 Phase 2 검증 — webapp 세 단계와 `make server-test`를 돌려 T001 기준선과 **실패 목록이 같은지** 확인한다. 새 실패가 있으면 다음 단계로 넘어가지 않는다

**Checkpoint**: 규칙이 양쪽에 섰다. 화면은 아직 그대로다.

---

## Phase 3: User Story 1 - 보드를 OKR 보드로 표시한다 (Priority: P1) 🎯 MVP

**Goal**: 공유 대화상자에서 켜면 유형 속성이 준비되고 보드가 그것을 기억한다.

**Independent Test**: 속성이 없는 보드와 이미 있는 보드 각각에서 체크를 켜고, 유형
속성과 세 값이 준비되는지 확인한다.

### Tests for User Story 1

- [X] T008 [P] [US1] `webapp/src/mutator.test.ts`에 켜기·끄기 실패 테스트를 더한다 — 속성이 없으면 만들고 값 셋을 넣는다, 이름이 `유형`인 선택 속성이 있으면 재사용한다, 값 이름이 다르면 **옵션 ID를 유지한 채 이름만 바꾼다**, 이름이 같아도 선택 속성이 아니면 무시한다, 속성과 설정이 **한 번의 보드 갱신**으로 저장된다, 끄면 설정 키가 사라지고 속성은 남는다, **껐다 다시 켜면 같은 속성과 같은 옵션 ID를 다시 쓴다**(중복 생성 없음) ([contracts/okr-board-mode.md](./contracts/okr-board-mode.md) 2·3절)
- [X] T009 [P] [US1] `webapp/src/components/shareBoard/okrBoardSection.test.tsx`(신규)에 섹션 실패 테스트를 쓴다 — 스위치가 보드 설정 상태를 반영한다, 켜면 저장을 부른다, 끄면 해제를 부른다

### Implementation for User Story 1

- [X] T010 [US1] `webapp/src/mutator.ts`에 OKR 보드 켜기·끄기를 더한다. 보드를 복제해 `cardProperties`와 `properties`를 함께 고친 뒤 `updateBoard`를 **한 번** 부른다 — 나눠 쓰면 실행 취소가 다섯 단계가 된다 ([research.md](./research.md) R2)
- [X] T011 [US1] `webapp/src/components/shareBoard/okrBoardSection.tsx`(신규)를 만든다. 접근 규칙 섹션의 모양(제목·설명 한 줄·스위치)을 차용하고 **새 SCSS 파일을 만들지 않는다**
- [X] T012 [US1] `webapp/src/components/shareBoard/shareBoard.tsx`의 `<PropertyAccessSection>` **바로 위**에 새 섹션을 끼운다 (FR-001)
- [X] T013 [P] [US1] `webapp/i18n/en.json`과 `webapp/i18n/ko.json`에 섹션 제목·설명을 추가한다. **속성 이름과 값 이름은 넣지 않는다** — 번역 대상이 아니다 (원칙 V)
- [X] T014 [US1] 빌드·배포 후 [quickstart.md](./quickstart.md) 1·2절을 실제 계정으로 훑는다. **2절이 이 이야기의 핵심이다** — 손으로 만든 `Object` 값을 쓰던 카드가 값을 잃지 않아야 한다 (SC-002)

**Checkpoint**: 여기까지가 MVP다. 보드가 OKR 보드임을 기억하고 속성이 준비된다.

---

## Phase 4: User Story 2 - 새 카드가 단계에 맞게 시작한다 (Priority: P2)

**Goal**: 최상위는 Objective, 하위는 깊이에 맞는 값으로 시작한다.

**Independent Test**: 켜진 보드에서 최상위 카드와 하위 카드를 만들고 유형이 단계에
맞게 채워졌는지 확인한다.

### Tests for User Story 2

- [X] T015 [P] [US2] `webapp/src/okrBoard.test.ts`에 클라이언트 채움 실패 테스트를 더한다 — 설정이 없으면 아무 값도 내놓지 않는다, 이미 그 속성에 값이 있으면 **덮지 않는다**(필터·그룹·템플릿 값 모두), 깊이 0은 1단계 값, **깊이 2인 템플릿 카드는 3단계 값**(FR-006a). **`centerPanel.test.tsx`에 쓰지 않는다** — 기준선에서 이미 실패하는 스위트라 새 테스트가 묻힌다(006에서 겪었다)
- [X] T016 [P] [US2] `server/app/cards_test.go`에 하위 카드 실패 테스트를 더한다 — 깊이 1은 2단계 값, 깊이 2·3은 3단계 값, **부모의 다른 속성이 그대로 내려온다**(FR-008, SC-003), 설정이 없으면 지금과 같다, 호출자가 속성을 보내면 지금과 같다, 접근 규칙 기본값이 유형을 정하면 **규칙이 이긴다**([research.md](./research.md) R5)

### Implementation for User Story 2

- [X] T017 [US2] `webapp/src/components/centerPanel.tsx`의 **`addCard`와 `addCardFromTemplate` 양쪽**이 필터·그룹 값을 정리하는 자리에서 단계 값을 싣는다. `addCard`는 기본 템플릿이 걸린 보기에서 첫 줄에 빠져나가므로, 거기에만 두면 그런 보기에서 한 번도 돌지 않는다. **깊이는 만들어진 카드에서 읽는다** — 템플릿 카드가 1단계라고 가정하지 않는다 ([contracts/okr-board-mode.md](./contracts/okr-board-mode.md) 4절, FR-006a)
- [X] T018 [US2] `server/app/cards.go`의 `CreateSubCard`에서 부모 속성을 복사한 **직후**, 접근 규칙 기본값을 채우기 **직전**에 유형을 깊이 값으로 덮는다. 다른 속성은 건드리지 않는다 ([contracts/okr-board-mode.md](./contracts/okr-board-mode.md) 5절)
- [X] T019 [US2] `MM_DEBUG=1 make server-linux` → 배포 후 [quickstart.md](./quickstart.md) 3·4절을 훑는다. **3절 5번(템플릿 경로)과 4절 6번(부모의 본부·부서가 내려오는지)이 이 기능에서 가장 깨지기 쉬운 두 자리다**

**Checkpoint**: 카드가 단계에 맞게 시작한다. US1과 독립으로 검증된다.

---

## Phase 5: User Story 3 - 채워진 값을 마음대로 바꾼다 (Priority: P2)

**Goal**: 자동 채움이 시작값일 뿐임을 확인한다. 이 이야기는 **코드를 더하지 않는 것**으로
성립하므로 검증이 주다.

**Independent Test**: 자동으로 채워진 카드의 유형을 바꾸고, 다시 열거나 다른 카드를
만들어도 되돌아가지 않는지 확인한다.

### Tests for User Story 3

- [X] T020 [P] [US3] `webapp/src/okrBoard.test.ts`와 `server/model/okr_board_test.go`에 이름 독립 실패 테스트를 더한다 — 옵션 **이름을 바꿔도** 같은 옵션 ID가 나온다, 설정이 가리키는 옵션이 지워졌으면 그 단계를 채우지 않는다 (FR-005)

### Implementation for User Story 3

- [X] T021 [US3] 빌드·배포 후 [quickstart.md](./quickstart.md) 5·6절을 훑는다 — 바꾼 값이 유지되는지, 비운 값이 비어 있는지, 값 이름을 `할 일`로 바꿔도 3단계가 채워지는지, 켜기 전 카드가 소급되지 않는지, 접근 규칙이 걸린 계정에서 규칙이 이기는지

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T022 [quickstart.md](./quickstart.md) 7절 — 005·006·007 회귀를 확인한다. 부서 좁히기, 담당자 좁히기, 직책 좁히기 없음, 조직 색. FY27 실보드는 **읽기만** 해서 카드 129장과 `okrBoard` 키 없음을 확인한다 (SC-006)
- [X] T023 새로 쓴 테스트가 **구현을 되돌렸을 때 실패하는지** 확인한다. 첫 실행에서 통과한 테스트는 아무것도 증명하지 않는다 (원칙 IV)
- [X] T024 품질 게이트 셋 — `make webapp-ci`(세 단계 따로), `make server-lint`, `make server-test`를 돌려 T001 기준선과 실패 목록을 대조한다. **`server-test`는 CI가 집행하지 않으므로 로컬 출력을 근거로 제시한다**(원칙 I). `git status`에 새 `.scss`가 없는지도 확인한다
- [X] T025 [quickstart.md](./quickstart.md) 9절 완료 판정을 채우고, 게이트·종단 검증·SC 실측 결과를 이 파일 하단에 근거로 남긴다

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (T001 기준선 — webapp + server)
    ↓
Phase 2 (T002~T007 양쪽 규칙)  ← 모든 이야기의 선행 조건
    ↓
    ├─→ Phase 3 (US1)  ← MVP. 단독 배포 가능
    ├─→ Phase 4 (US2)  ← US1이 있어야 화면에서 확인된다
    └─→ Phase 5 (US3)  ← US2 뒤에 검증한다
              ↓
        Phase 6 (마감)
```

### User Story Dependencies

- **US1**: Phase 2만 끝나면 시작한다
- **US2**: Phase 2에 의존한다. 코드는 US1과 독립이지만 **검증하려면 켜진 보드가
  필요하므로** 실제로는 US1 다음이다
- **US3**: US2가 채운 값이 있어야 "바꿔도 안 돌아온다"를 볼 수 있다

세 이야기 모두 Phase 2의 매핑 함수를 쓴다. 그것이 Phase 2를 막는 단계로 둔 이유다.

### Within Each User Story

테스트 → 구현 → 종단 확인 순서다. 테스트가 먼저 실패하는 것을 보고 구현한다.

### Parallel Opportunities

| 함께 진행 가능 | 이유 |
|---|---|
| T002, T003, T005 | 타입·Go 테스트·TS 테스트가 서로 다른 파일 |
| T008, T009 | 뮤테이터 테스트와 컴포넌트 테스트는 다른 파일 |
| T013과 T010·T011 | i18n은 코드와 겹치지 않는다 |
| T015, T016 | 클라이언트 테스트와 서버 테스트는 다른 언어·다른 파일 |

**병렬로 하면 안 되는 것**: T017과 T018은 같은 규칙(깊이→값)을 쓰지만 T004·T006이
끝난 뒤여야 한다. 먼저 시작하면 각자 매핑을 다시 구현하게 되고, 그러면 서버와
클라이언트가 다른 답을 내는 상태가 만들어진다.

---

## Parallel Example: Phase 2

```bash
# 타입과 양쪽 테스트는 서로를 모른다
T002: webapp/src/blocks/board.ts
T003: server/model/okr_board_test.go
T005: webapp/src/okrBoard.test.ts
```

## Parallel Example: Phase 4 테스트

```bash
# 언어가 달라 겹치지 않는다
T015: webapp/src/okrBoard.test.ts
T016: server/app/cards_test.go
```

---

## Implementation Strategy

### MVP First (User Story 1)

T001~T014까지가 MVP다. 여기서 멈춰도 **보드가 OKR 보드임을 기억하고 속성이 준비된다**.
자동 채움이 없어도 사용자가 손으로 고르던 것은 그대로 할 수 있다.

### Incremental Delivery

1. Phase 2까지 — 화면 변화 없음. 커밋을 따로 낸다
2. Phase 3 — 켜고 끄기가 된다 ← 여기서 한 번 배포해 써 보는 것을 권한다
3. Phase 4 — 카드가 단계에 맞게 시작한다. **여기서만 Go 빌드가 필요하다**
4. Phase 5~6 — 검증과 마감

### 커밋 나누기

| 커밋 | 범위 |
|---|---|
| `feat(008):` | T002·T004·T006 — 양쪽 규칙 (순수 함수) |
| `feat(008):` | Phase 3 — 표시와 속성 준비 (US1) |
| `feat(008):` | T017 — 최상위 채움 (US2 클라이언트) |
| `feat(008):` | T018 — 하위 채움 (US2 서버) |

US2를 클라이언트와 서버로 나누는 이유는 배포 단위가 다르기 때문이다. 서버 커밋만
되돌리면 하위 카드 채움만 꺼진다.

---

## Notes

- **클라이언트는 하위 카드의 유형에 관여하지 않는다.** T017에서 `createSubCard`에
  속성을 실어 보내고 있다면 잘못 가고 있다 — 서버가 부모 상속 블록을 통째로 건너뛰어
  본부·부서가 안 내려간다 ([research.md](./research.md) R4)
- **매핑을 세 곳에서 구현하지 않는다.** T017과 T018이 각자 깊이 계산을 하고 있다면
  T004·T006을 부르지 않은 것이다
- **템플릿 카드의 깊이를 0으로 굳히지 않는다.** T017이 `levels[0]`을 직접 쓰고 있다면
  하위 카드로 만든 템플릿에서 틀린다 (FR-006a)
- **접근 규칙을 이기려 들지 않는다.** T018에서 채우는 자리가
  `fillDefaultConditionValues` **뒤**면 규칙을 덮게 된다. 앞이어야 한다
- **값 이름으로 판단하지 않는다.** 켤 때 한 번만 이름을 보고, 그 뒤로는 설정의 ID로만
  움직인다 (FR-005)
- `Constants.maxCardDepth`나 복제·가져오기 경로를 열게 되면 계획이 틀어진 것이다.
  멈추고 [plan.md](./plan.md)를 다시 본다

---

## 실행 결과 (2026-08-14)

### 품질 게이트 — 기준선 대비

**게이트가 셋이다.** server 기준선은 이번에 처음 잡았다.

| 게이트 | 기준선 | 구현 후 | 판정 |
|---|---|---|---|
| jest 실패 스위트 | 57 | 57 (**목록 동일**) | 통과 |
| jest 실패 테스트 | 145 / 1077 | 145 / 1105 (**이름 동일**) | 통과 — 새 테스트 28건 전부 통과 |
| tsc 오류 | 23 | 23 (**동일**) | 통과 |
| `make server-test` | 실패 96건 (패키지 3개) | 96 (**이름 동일**) | 통과 — CI 미집행, 로컬 출력이 근거 |
| `make server-lint` | 지적 11건 | **동일** | 통과 |
| eslint | 007 기준 2478 | 2483 | 통과 — 늘어난 5건은 신규 파일에 붙는 저장소 공통 `Resolve error` |
| 새 `.scss` | — | 없음 | 통과 |

### 테스트 빨강 증거 (원칙 IV)

| 테스트 | 구현 전 실패 내용 |
|---|---|
| `server/model/okr_board_test.go` (11) | 컴파일 실패 — `OkrBoardSettings` 없음 |
| `webapp/src/okrBoard.test.ts` — 설정·매핑 (9) | `Cannot find module './okrBoard'` |
| `webapp/src/okrBoard.test.ts` — 채움 (6) | `okrPropertiesForNewCard is not a function` |
| `webapp/src/mutator.test.ts` (8) | `enableOkrBoard is not a function` |
| `okrBoardSection.test.tsx` (5) | `Cannot find module './okrBoardSection'` |
| `server/app/cards_test.go` (6) | 하위 카드가 부모 값 `opt-objective`를 그대로 물려받아 실패 |

변이로 검증한 것 셋.

| 변이 | 실패한 테스트 |
|---|---|
| 서버 채움을 접근 규칙 **뒤로** 옮김 | `a rule that decides the rung outranks the ladder` |
| 깊이를 무시하고 항상 1단계 | `depth decides the rung, not the way the card was made` 외 1건 |
| 이미 정해진 값도 덮게 함 | `a value already decided wins` |

### 종단 검증 — 배포 후 실제 계정 (`전유홍`, 팀 `kkv`)

`MM_DEBUG=1 make server-linux` → `make deploy-from-watch`로 **Go 바이너리까지** 올린
뒤 확인했다. 검증용 보드는 끝나고 지웠다.

| 절 | 확인 | 결과 |
|---|---|---|
| 1 | "Use as OKR Board"가 "Card access by property" **바로 위**에, 기본 꺼짐 | 통과 (FR-001) |
| 1 | 켜면 `유형` 선택 속성 + Objective/Key Results/Tasks 생성 | 통과 (FR-002, FR-003) |
| 1 | 저장이 값 **이름이 아니라 옵션 ID** | 통과 (FR-005) |
| 3 | 최상위 카드가 Objective로 시작 | 통과 (FR-006) |
| 4 | 하위 카드 사다리 — depth 0/1/2/3 → Objective/Key Results/Tasks/Tasks | 통과 (FR-007) |
| 4 | **부모의 본부가 네 장 모두에 내려옴** | 통과 (FR-008, SC-003) |
| 3-5 | 3단계 카드로 만든 템플릿이 `depth: 3`을 물려받고, 그 템플릿으로 만든 카드가 **Tasks**로 시작 | 통과 (FR-006a) |
| 2 | 값 이름을 `Object`로 되돌린 뒤 다시 켜니 속성 하나 그대로, **옵션 ID 유지한 채 이름만** `Objective`로, 그 값을 쓰던 카드가 값 유지 | 통과 (FR-004, SC-002) |
| 3 | 끄면 설정 키만 사라지고 속성·카드 값 6건 그대로 | 통과 (FR-011) |
| 7 | FY27 실보드 카드 129장, `okrBoard` 키 없음 | 통과 |

### SC 실측

| SC | 실측 |
|---|---|
| SC-001 | 사다리 네 단계를 만드는 동안 유형을 고른 횟수 0 |
| SC-002 | `Object`를 쓰던 카드의 값 손실 0장 |
| SC-003 | 부모 본부가 안 내려온 하위 카드 0장 |
| SC-004 | (US3) 바꾼 값이 되돌아간 경우 0건 |
| SC-005 | 빈 카드·템플릿 카드·하위 카드 세 입구 결과 일치 |
| SC-006 | 005·006·007 회귀 0건 |

### 계획에서 바뀐 것

`/speckit-analyze`가 템플릿 경로 누락을 잡아냈고, 코드를 확인해 둘을 더 알아냈다.

- 템플릿 카드가 항상 1단계는 아니다. 블록 복제가 `depth`를 그대로 복사하고
  "New template from card"가 하위 카드에서도 열린다. **종단 검증에서 실제로
  `depth: 3` 템플릿이 만들어지는 것을 확인했다.**
- 하위 카드는 템플릿으로 만들 수 없다. `createSubCard`에 템플릿을 받는 자리가 없다.

그래서 깊이를 인자로 받지 않고 만들어진 카드에서 읽는다(FR-006a). 채우는 자리도
둘에서 셋으로 늘었다.
