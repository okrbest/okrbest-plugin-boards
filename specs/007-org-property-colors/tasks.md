# Tasks: 조직 속성 값에 색을 입힌다

**Feature**: `007-org-property-colors` | **Date**: 2026-08-14

**Input**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 다른 파일을 건드리고 선행 과제가 없어 병렬로 진행 가능
- **[US1]~[US3]**: [spec.md](./spec.md)의 사용자 이야기 번호
- 모든 과제에 파일 경로를 적는다

## Path Conventions

경로는 저장소 루트 기준이다. **이번 변경은 `webapp/`만 닿는다** — `server/` 아래
파일을 하나라도 고치면 계획이 틀어진 것이다([plan.md](./plan.md) Structure Decision).

**테스트는 요청됐다.** constitution 원칙 IV가 동작 변경에 테스트를 요구하고,
superpowers `test-driven-development`가 실패 테스트 우선을 집행한다. 단 **T002만
예외**다 — 타입 선언만 더하고 행동을 바꾸지 않는다.

**새 SCSS 파일을 만들지 않는다.** 필터 목록을 `Label`로 바꿀 때 정렬이 어긋나면 기존
패널 스타일 안에서 맞춘다(원칙 II).

---

## Phase 1: Setup (Shared Infrastructure)

- [ ] T001 기준선 측정 — `git stash -u`로 미추적 파일까지 치운 뒤 `webapp/`에서 `npx jest --silent`, `npm run check-types`, `npm run check`를 각각 돌려 실패 목록을 작업 폴더에 저장한다. 회귀 판정은 개수가 아니라 목록 diff로 한다 ([quickstart.md](./quickstart.md) 8절)

---

## Phase 2: Foundational (Blocking Prerequisites)

**목적**: 색을 정하는 규칙을 순수 함수로 먼저 세운다. 세 이야기가 모두 이 함수를
쓰므로, 나중에 만들면 세 화면이 각자 해시를 구현하게 된다 ([research.md](./research.md) R3).

**⚠️ 이 단계는 화면을 바꾸지 않는다.** 함수만 생기고 아직 아무도 부르지 않는다.

- [ ] T002 [P] `webapp/src/blocks/board.ts`에 보드가 기억하는 색 지정의 타입을 더한다 — 조직 단위 ID를 팔레트 키에 대응시키는 맵. `board.properties`에 들어가는 형태다 ([data-model.md](./data-model.md) 1절)
- [ ] T003 `webapp/src/properties/orgLabels.test.ts`에 색 결정의 실패 테스트를 더한다 — 같은 ID는 항상 같은 색이다, 자동 배정에 `propColorDefault`가 나오지 않는다, 지정 색이 자동 색을 이긴다, 마스터에 없는 ID는 지정 색이 있어도 경고색이다, 팔레트에 없는 저장값은 자동 색으로 떨어진다, 지정이 없으면 저장을 읽지 않는다
- [ ] T004 `webapp/src/properties/orgLabels.ts`에 문자열 해시와 색 결정 함수를 더해 T003을 통과시킨다. 팔레트는 `Constants.menuColors`에서 `propColorDefault`를 뺀 9종. 우선순위는 경고색 → 지정 색 → 자동 색 ([data-model.md](./data-model.md) 2절)
- [ ] T005 Phase 2 검증 — `npx jest --silent`, `npm run check-types`를 돌려 T001 기준선과 **실패 목록이 같은지** 확인한다. 새 실패가 있으면 다음 단계로 넘어가지 않는다

**Checkpoint**: 색 규칙이 섰다. 화면은 아직 그대로다.

---

## Phase 3: User Story 1 - 색을 고르지 않아도 구분된다 (Priority: P1) 🎯 MVP

**Goal**: 아무 설정 없이도 조직 값이 값마다 다른 색으로 보인다.

**Independent Test**: 색을 한 번도 지정하지 않은 보드에서 조직 값이 여러 개인 카드를
열어, 값마다 배경색이 다른지 확인한다.

### Tests for User Story 1

- [ ] T006 [P] [US1] `webapp/src/properties/orgDivision/orgDivision.test.tsx`에 색 표시 실패 테스트를 더한다 — 서로 다른 본부가 서로 다른 색 클래스로 그려진다, 같은 본부는 두 카드에서 같은 색이다, 마스터에 없는 값은 경고색이다. 직책·부서는 같은 에디터를 공유하므로 한 곳만 검증한다

### Implementation for User Story 1

- [ ] T007 [US1] `webapp/src/properties/orgUnitEditor.tsx`의 고정 색(`orgOptionColor`)을 걷어내고 T004의 결정 함수를 쓴다. 보드에 저장된 색 지정을 함수에 넘긴다. 사라진 값의 경고색 처리는 결정 함수 안으로 옮겨 한 곳에서 정해지게 한다 ([contracts/org-colors.md](./contracts/org-colors.md) 1절)
- [ ] T008 [US1] 빌드·배포 후 [quickstart.md](./quickstart.md) 1절을 실제 계정으로 훑는다 — 본부 7개가 서로 다른 색이다, 회색 항목이 없다, 새로고침·다른 보드에서 같은 색이다, DB에 `orgColors` 키가 아직 없다

**Checkpoint**: 여기까지가 MVP다. 색을 고르는 기능이 없어도 값이 구분된다.

---

## Phase 4: User Story 2 - 색을 직접 고른다 (Priority: P2)

**Goal**: 값의 색을 팔레트에서 고르고, 그 색이 자동 배정을 덮어쓴다.

**Independent Test**: 조직 값의 색을 바꾸고 그 값이 나오는 자리가 새 색으로 보이는지,
해제하면 자동 색으로 돌아가는지 확인한다.

### Tests for User Story 2

- [ ] T009 [P] [US2] `webapp/src/widgets/valueSelector.test.tsx`(없으면 신규)에 메뉴 실패 테스트를 더한다 — `fixedOptions`이고 색 변경 핸들러가 있으면 팔레트가 나오고 이름 변경·삭제는 나오지 않는다, 핸들러가 없으면 메뉴 자체가 없다, `fixedOptions`가 아니면 지금처럼 셋 다 나온다 ([contracts/org-colors.md](./contracts/org-colors.md) 4절)
- [ ] T010 [P] [US2] `webapp/src/mutator.test.ts`에 저장 실패 테스트를 더한다 — 색을 고르면 `board.properties`의 색 맵에 들어간다, 해제하면 그 키가 사라진다, **`cardProperties`의 `options` 배열은 어느 경우에도 비어 있다**(FR-011 회귀 방지)

### Implementation for User Story 2

- [ ] T011 [US2] `webapp/src/widgets/valueSelector.tsx`의 `fixedOptions` 분기를 "메뉴 없음"에서 "색 변경 핸들러가 있으면 색만"으로 쪼갠다. 이름 변경이 `onStartRename` 유무로 걸린 기존 방식을 따르고, 새 prop을 만들지 않는다 ([research.md](./research.md) R4)
- [ ] T012 [US2] `webapp/src/mutator.ts`에 조직 색을 저장·해제하는 메서드를 더한다. 보드를 복제해 `properties`의 색 맵을 갈아 끼우고 `updateBoard`를 호출한다 — 접근 규칙이 쓰는 것과 같은 경로라 실행 취소가 따라온다 ([contracts/org-colors.md](./contracts/org-colors.md) 3절)
- [ ] T013 [US2] `webapp/src/properties/orgUnitEditor.tsx`에서 `ValueSelector`에 색 변경·해제 핸들러를 넘긴다
- [ ] T014 [P] [US2] `webapp/i18n/en.json`과 `webapp/i18n/ko.json`에 색 지정 해제 항목 문구를 추가한다. **두 파일을 같은 커밋에** 넣는다 (원칙 V)
- [ ] T015 [US2] 빌드·배포 후 [quickstart.md](./quickstart.md) 2절과 **5절**을 훑는다. 5절이 이 이야기의 핵심 회귀다 — 색을 지정한 뒤에도 접근 규칙의 속성 후보 목록이 그대로여야 한다

**Checkpoint**: 자동 색 위에 지정이 얹혔다. US1과 독립으로 검증된다.

---

## Phase 5: User Story 3 - 거를 때도 묶을 때도 같은 색 (Priority: P3)

**Goal**: 필터 목록과 그룹 제목이 카드와 같은 색을 쓴다.

**Independent Test**: 색을 지정한 조직 값으로 필터 목록과 그룹 제목을 열어 카드에서
본 색과 대조한다.

### Tests for User Story 3

- [ ] T016 [P] [US3] `webapp/src/components/viewHeader/filterPanel/filterValuePanel.test.tsx`에 필터 색 실패 테스트를 더한다 — 조직 필터 항목이 색 라벨로 그려진다, 색이 결정 규칙과 일치한다
- [ ] T017 [P] [US3] `webapp/src/properties/orgLabels.test.ts`에 그룹 색 실패 테스트를 더한다 — 값이 여럿인 그룹은 첫 값의 색을 쓴다, 값이 없으면 색이 없다. **`centerPanel.test.tsx`에 쓰지 않는다** — 기준선에서 이미 실패하는 스위트라 새 테스트가 묻힌다(006에서 겪었다)

### Implementation for User Story 3

- [ ] T018 [US3] `webapp/src/components/viewHeader/filterPanel/filterValuePanel.tsx`의 조직 필터 항목을 `<span>`에서 `Label` 위젯으로 바꾸고 결정된 색을 넘긴다. 새 SCSS 파일을 만들지 말고 기존 패널 스타일 안에서 정렬을 맞춘다 ([research.md](./research.md) R6)
- [ ] T019 [US3] `webapp/src/components/centerPanel.tsx`에서 조직 그룹의 이름을 덮어쓰는 자리에 색도 채운다. `boardUtils.ts`는 건드리지 않는다 ([research.md](./research.md) R5)
- [ ] T020 [US3] 빌드·배포 후 [quickstart.md](./quickstart.md) 3절을 훑는다 — 색을 바꾸면 카드·필터·그룹 세 자리가 동시에 바뀌는지 확인한다

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T021 [quickstart.md](./quickstart.md) 4절 — 사라진 값의 경고색이 지정 색을 이기는지 종단으로 확인한다. 조직 관리에서 직책 하나를 비활성으로 바꾼 뒤 보고, 되돌리면 지정한 색이 돌아오는지도 본다 (FR-009)
- [ ] T022 [quickstart.md](./quickstart.md) 6·7절 — 담당자·다중 사용자 화면에 변화가 없는지(FR-012), 005·006 동작(부서 좁히기, 담당자 좁히기, 직책 좁히기 없음, CSV)이 그대로인지 확인한다 (SC-006)
- [ ] T023 새로 쓴 테스트가 **구현을 되돌렸을 때 실패하는지** 확인한다. 첫 실행에서 통과한 테스트는 아무것도 증명하지 않는다 (원칙 IV)
- [ ] T024 품질 게이트 — `make webapp-ci`를 돌리고 세 단계를 따로 돌려 T001 기준선과 실패 목록을 대조한다. `git diff --stat`에 `server/` 경로가 없는지, `git status`에 새 `.scss` 파일이 없는지도 확인한다
- [ ] T025 [quickstart.md](./quickstart.md) 9절 완료 판정을 채우고, 게이트·종단 검증·SC 실측 결과를 이 파일 하단에 근거로 남긴다

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (T001 기준선)
    ↓
Phase 2 (T002~T005 색 결정 규칙)  ← 세 이야기 모두의 선행 조건
    ↓
    ├─→ Phase 3 (US1)  ← MVP. 단독 배포 가능
    ├─→ Phase 4 (US2)  ← US1과 독립
    └─→ Phase 5 (US3)  ← US1·US2와 독립 (지정 색 확인은 US2 뒤가 편하다)
              ↓
        Phase 6 (마감)
```

### User Story Dependencies

- **US1**: Phase 2만 끝나면 시작한다. 다른 이야기에 의존하지 않는다
- **US2**: Phase 2에 의존한다. US1 없이도 저장·메뉴는 검증되지만, 화면에서 확인하려면
  US1이 있어야 편하다
- **US3**: Phase 2에 의존한다. 지정 색까지 확인하려면 US2가 있어야 하지만, 자동 색만으로도
  세 자리 일치를 검증할 수 있다

세 이야기 모두 T004(색 결정 함수)를 공유한다. 이것이 Phase 2를 막는 단계로 둔 이유다.

### Within Each User Story

테스트 → 구현 → 종단 확인 순서다. 테스트가 먼저 실패하는 것을 보고 구현한다.

### Parallel Opportunities

| 함께 진행 가능 | 이유 |
|---|---|
| T002, T003 | 타입 추가와 테스트 작성은 다른 파일 |
| T009, T010 | 위젯 테스트와 뮤테이터 테스트는 다른 파일 |
| T014와 T011·T012 | i18n은 코드와 겹치지 않는다 |
| T016, T017 | 필터 테스트와 색 함수 테스트는 다른 파일 |

**병렬로 하면 안 되는 것**: T007·T018·T019는 모두 T004의 결정 함수를 부른다. T004가
끝나기 전에 시작하면 각자 임시로 색을 계산하게 되고, 그러면 세 자리가 갈라진다 —
이 기능이 막으려는 바로 그 상태다.

---

## Parallel Example: Phase 2

```bash
# 타입과 테스트는 서로를 모른다
T002: webapp/src/blocks/board.ts
T003: webapp/src/properties/orgLabels.test.ts
```

## Parallel Example: 테스트 일괄 작성

```bash
T006: webapp/src/properties/orgDivision/orgDivision.test.tsx
T009: webapp/src/widgets/valueSelector.test.tsx
T010: webapp/src/mutator.test.ts
T016: webapp/src/components/viewHeader/filterPanel/filterValuePanel.test.tsx
T017: webapp/src/properties/orgLabels.test.ts
```

---

## Implementation Strategy

### MVP First (User Story 1)

T001~T008까지가 MVP다. 여기서 멈춰도 **아무 설정 없이 조직 값이 구분된다**는 핵심
가치가 선다. 색을 고르는 기능은 그 위의 편의다.

### Incremental Delivery

1. Phase 2까지 — 화면 변화 없음. 커밋을 따로 낸다
2. Phase 3 — 값이 칠해진다 ← 여기서 한 번 배포해 써 보는 것을 권한다
3. Phase 4 — 색을 고를 수 있다
4. Phase 5 — 세 자리가 같아진다

### 커밋 나누기

| 커밋 | 범위 |
|---|---|
| `feat(007):` | T002·T004 — 색 결정 규칙 (순수 함수) |
| `feat(007):` | Phase 3 — 자동 색 표시 (US1) |
| `feat(007):` | Phase 4 — 색 고르기와 저장 (US2) |
| `feat(007):` | Phase 5 — 필터·그룹 (US3) |

---

## Notes

- **색을 `options` 배열에 넣지 않는다.** 조직 속성의 옵션이 비어 있다는 사실이 접근
  규칙에서 조직 속성을 빼는 장치다. T010과 quickstart 5절이 이걸 지킨다
  ([research.md](./research.md) R1)
- **해시를 세 곳에서 구현하지 않는다.** T007·T018·T019가 각자 계산하고 있다면 잘못
  가고 있다 — 전부 T004를 불러야 한다
- **자동 색을 저장하지 않는다.** T008에서 DB에 `orgColors` 키가 없는 것을 확인하는
  이유다. 저장이 생기면 "같은 조직은 어디서나 같은 색"이 깨진다
- `boardUtils.ts`나 `server/` 아래 파일을 열게 되면 계획이 틀어진 것이다. 멈추고
  [plan.md](./plan.md)를 다시 본다
