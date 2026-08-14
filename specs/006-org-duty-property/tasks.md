# Tasks: 직책 속성

**Feature**: `006-org-duty-property` | **Date**: 2026-08-14

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
superpowers `test-driven-development`가 실패 테스트 우선을 집행한다. 단
**T002·T003만 예외**다 — 타입 선언만 바꾸고 행동을 바꾸지 않으므로, 기존 테스트가
그대로 통과하는 것이 증거다.

---

## Phase 1: Setup (Shared Infrastructure)

- [X] T001 기준선 측정 — `git stash -u`로 미추적 파일까지 치운 뒤 `webapp/`에서 `npx jest --silent`, `npm run check-types`, `npm run check`를 각각 돌려 실패 목록을 작업 폴더에 저장한다. 이후 모든 회귀 판정의 기준이며 개수가 아니라 목록 diff로 본다 ([quickstart.md](./quickstart.md) 8절)

---

## Phase 2: Foundational (Blocking Prerequisites)

**목적**: 직책이 기존 경로에 얹힐 자리를 먼저 만든다. 이걸 건너뛰면 이후 단계마다
타입 분기를 새로 파야 한다 ([research.md](./research.md) R1·R2).

**⚠️ T002·T003은 행동을 바꾸지 않는다.** 새 테스트를 쓰지 않으며, T001 기준선과
같은 결과가 나오는 것이 완료 조건이다.

- [X] T002 [P] `webapp/src/blocks/board.ts`의 `PropertyTypeEnum` 유니온에 `'orgDuty'`를 추가한다 (157행 부근). 이 한 줄만 바꾸고 다른 동작은 손대지 않는다
- [X] T003 [P] `webapp/src/properties/orgUnitEditor.tsx`의 `options`·`allUnits` props 타입을 `OrgUnit[]`에서 `{id: string, name: string}[]` 최소 구조로 낮춘다. `toPropertyOption`·`selectedOptions`·`displayOptions`의 시그니처도 함께 낮춘다. 캐스팅(`as`)을 쓰지 않는다 ([contracts/property-types.md](./contracts/property-types.md) 4절)
- [X] T004 `webapp/src/store/orgMaster.test.ts`(신규)에 이름 해석 셀렉터의 실패 테스트를 쓴다 — 본부·부서·직책 ID를 모두 이름으로 풀고, 마스터에 없는 ID는 결과에 넣지 않으며, 팀이 다르면 비어 있다
- [X] T005 `webapp/src/store/orgMaster.ts`에 이름 해석 셀렉터를 추가해 T004를 통과시킨다. 조직 단위와 직책을 합친 `{id, name}[]`를 돌려준다 ([data-model.md](./data-model.md) 3절)
- [X] T006 Phase 2 검증 — `npx jest --silent`, `npm run check-types`를 돌려 T001 기준선과 **실패 목록이 같은지** 확인한다. 새 실패가 있으면 다음 단계로 넘어가지 않는다

**Checkpoint**: 타입과 데이터 경로가 준비됐다. 아직 사용자에게 보이는 변화는 없다.

---

## Phase 3: User Story 1 - 카드에 직책을 적는다 (Priority: P1) 🎯 MVP

**Goal**: 속성 유형 목록에 직책이 뜨고, 카드에 직책을 여러 개 적을 수 있다.

**Independent Test**: 보드에 직책 속성을 추가하고 카드를 열어 직책 두 개를 고른 뒤,
표 보기와 카드 상세에서 이름이 보이는지 확인한다.

### Tests for User Story 1

- [X] T007 [P] [US1] `webapp/src/properties/orgDuty/orgDuty.test.tsx`(신규)에 에디터 실패 테스트를 쓴다 — 팀의 활성 직책이 서버 순서 그대로 모두 나온다, 두 개를 고르면 둘 다 남는다, 하나를 지우면 나머지는 남는다, 카드의 본부·부서 값이 바뀌어도 직책 선택지가 그대로다(FR-003, spec US1 시나리오 5), 마스터에 없는 값은 `(removed)` 표시로 목록에 남는다(FR-006). `orgDivision.test.tsx`를 본으로 삼는다

### Implementation for User Story 1

- [X] T008 [US1] `webapp/src/properties/orgDuty/property.tsx`(신규)에 `PropertyType` 서브클래스를 만든다 — `type='orgDuty'`, `name='OrgDuty'`, `isMultiValue=true`, `canFilter=true`, `canGroup=true`, `filterValueType='orgUnit'`, `displayName`은 `PropertyType.OrgDuty` ([contracts/property-types.md](./contracts/property-types.md) 2절)
- [X] T009 [US1] `webapp/src/properties/orgDuty/orgDuty.tsx`(신규)에 에디터를 만든다 — `getDuties(board.teamId)`를 읽어 `OrgUnitEditor`에 `options`·`allUnits`로 그대로 넘긴다. **좁히기 로직을 넣지 않는다**. 화면에서 다시 정렬하지 않는다 ([research.md](./research.md) R4·R5)
- [X] T010 [US1] `webapp/src/properties/index.tsx`에 `OrgDutyProperty`를 import하고 `registry.register(new OrgDutyProperty())`를 추가한다. 등록 위치는 `OrgDepartmentProperty` 바로 다음이다 — 속성 유형 메뉴가 이 순서를 그린다
- [X] T011 [P] [US1] `webapp/i18n/en.json`과 `webapp/i18n/ko.json`에 `PropertyType.OrgDuty`를 각각 `Duty`·`직책`으로 추가한다. **두 파일을 같은 커밋에** 넣는다 (원칙 V)
- [X] T012 [US1] 빌드·배포 후 [quickstart.md](./quickstart.md) 1~3절을 실제 계정으로 훑는다 — 유형 목록에 직책이 뜬다, 직책 9개가 서열 순으로 나온다, 직위 9개는 어디에도 없다, 본부를 바꿔도 직책 선택지가 그대로다

**Checkpoint**: 여기까지가 MVP다. 카드에 직책을 적을 수 있고, 그 자체로 쓸 만하다.

---

## Phase 4: User Story 2 - 직책으로 거르고 묶는다 (Priority: P2)

**Goal**: 직책으로 카드를 거르고 직책별로 묶어 볼 수 있다.

**Independent Test**: 직책 값이 섞인 카드를 만들고 직책 하나로 걸러 결과가 정확한지,
직책으로 묶어 그룹 제목이 이름으로 나오는지 확인한다.

### Tests for User Story 2

- [X] T013 [P] [US2] `webapp/src/components/viewHeader/filterPanel/filterValuePanel.test.tsx`에 직책 필터 실패 테스트를 더한다 — 직책 속성을 고르면 팀의 활성 직책이 목록에 나온다, 검색이 이름으로 걸러진다, 체크하면 `includes` 절이 만들어진다
- [X] T014 [P] [US2] **위치 변경** — `centerPanel.test.tsx`가 기준선에서 이미 실패하는 스위트라 새 테스트가 묻힌다. 이름 해석의 순수 부분을 `webapp/src/properties/orgLabels.ts`로 떼고 `orgLabels.test.ts`에서 검증했다(8건, 통과 스위트). 배선은 quickstart 4절 종단 검증이 덮는다. 원래 계획: `webapp/src/components/centerPanel.test.tsx`에 직책 묶기 실패 테스트를 더한다 — 그룹 제목이 직책 **이름**이다(ID가 아니다), 값이 둘이면 `, `로 이어진다, 마스터에 없는 ID는 ID 그대로 나온다, 값이 없으면 `No <속성 이름>`이다

### Implementation for User Story 2

- [X] T015 [US2] `webapp/src/components/viewHeader/filterPanel/filterValuePanel.tsx`의 조직 필터 패널(335행 부근)에서 선택지 출처를 속성 타입으로 고르도록 넓힌다 — 본부·부서·직책 세 갈래. `filterValueType`은 `'orgUnit'`을 그대로 쓰고 새 갈래를 만들지 않는다 ([research.md](./research.md) R3)
- [X] T016 [US2] `webapp/src/components/centerPanel.tsx`의 그룹 이름 해석(574행 부근)에 `orgDuty`를 포함시키고, 조회 맵의 출처를 T005 셀렉터로 바꾼다. `getOrgUnits` 직접 참조를 걷어낸다 ([data-model.md](./data-model.md) 3절)
- [X] T017 [US2] 빌드·배포 후 [quickstart.md](./quickstart.md) 4절을 훑는다 — 직책 두 개를 가진 카드가 그중 하나로 걸러도 남는지, 그룹 제목에 ID가 찍히지 않는지 확인한다

**Checkpoint**: 직책이 보드 전체를 다루는 도구가 됐다. US1과 독립으로 검증된다.

---

## Phase 5: User Story 3 - 내보내면 이름으로 나간다 (Priority: P3)

**Goal**: CSV에 직책 ID가 아니라 이름이 나간다.

**Independent Test**: 직책 값이 있는 보기를 내보내 파일에 사람이 읽는 이름이 있는지
확인한다.

### Tests for User Story 3

- [X] T018 [P] [US3] `webapp/src/csvExporter.test.ts`에 직책 내보내기 실패 테스트를 더한다 — 값 하나는 이름으로, 값 둘은 `본부장|팀장` 형태로, 마스터에 없는 ID는 ID 그대로, 빈 값은 빈 칸으로 나간다

### Implementation for User Story 3

- [X] T019 [US3] `webapp/src/csvExporter.ts`의 `orgPropertyTypes` 집합(23행)에 `'orgDuty'`를 넣고, `exportOrgValue`의 이름 출처를 T005 셀렉터로 바꾼다. 사람 속성이 쓰는 예외 경로 구조는 그대로 둔다 ([contracts/property-types.md](./contracts/property-types.md) 5절)
- [X] T020 [US3] 빌드·배포 후 [quickstart.md](./quickstart.md) 5절을 훑는다 — 내보낸 파일의 직책 칸에 26자 ID가 하나도 없는지 확인한다

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T021 [quickstart.md](./quickstart.md) 6절 — 사라진 직책을 종단으로 확인한다. 조직 관리에서 직책 하나를 비활성으로 바꾼 뒤 카드·묶기·내보내기 세 곳이 값을 잃지 않고 ID를 보여주는지 보고, 끝나면 되돌린다 (FR-006)
- [X] T022 [quickstart.md](./quickstart.md) 7절 — 005 회귀를 확인한다. 부서 좁히기, 본부 변경 시 부서 정리, 담당자 좁히기가 그대로인지, 직책을 넣어도 담당자 후보가 안 바뀌는지(FR-010), 접근 규칙 목록에 직책 속성이 없는지(FR-011) 본다
- [X] T023 새로 쓴 테스트가 **구현을 되돌렸을 때 실패하는지** 확인한다. 첫 실행에서 통과한 테스트는 아무것도 증명하지 않는다 (원칙 IV)
- [X] T024 품질 게이트 — `make webapp-ci`를 돌리고, 세 단계(`npm run check`·`npm run test`·`npm run check-types`)를 따로 돌려 T001 기준선과 실패 목록을 대조한다. `git diff --stat`에 `server/` 경로가 없는지도 확인한다
- [X] T025 [quickstart.md](./quickstart.md) 9절 완료 판정 체크리스트를 채우고, 게이트·종단 검증 결과를 이 파일 하단에 근거로 남긴다

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (T001 기준선)
    ↓
Phase 2 (T002~T006 준비)  ← 모든 사용자 이야기의 선행 조건
    ↓
    ├─→ Phase 3 (US1)  ← MVP. 단독으로 배포 가능
    ├─→ Phase 4 (US2)  ← T005 셀렉터에만 의존
    └─→ Phase 5 (US3)  ← T005 셀렉터에만 의존
              ↓
        Phase 6 (마감)
```

### User Story Dependencies

- **US1**: Phase 2만 끝나면 시작할 수 있다. 다른 이야기에 의존하지 않는다
- **US2**: Phase 2에 의존한다. US1과 **독립**이다 — 다만 검증하려면 직책 값이 든
  카드가 있어야 하므로, 실제로는 US1 다음에 훑는 편이 편하다
- **US3**: Phase 2에 의존한다. US1·US2와 독립이다

세 이야기 모두 T005(이름 해석 셀렉터)를 공유한다. 이것이 Phase 2를 막는 단계로 둔
이유다.

### Within Each User Story

테스트 → 구현 → 종단 확인 순서다. 테스트가 먼저 실패하는 것을 보고 구현한다.

### Parallel Opportunities

| 함께 진행 가능 | 이유 |
|---|---|
| T002, T003 | 다른 파일. 둘 다 타입만 바꾼다 |
| T007, T011 | 에디터 테스트와 i18n은 겹치지 않는다 |
| T013, T014 | 필터 패널과 centerPanel은 다른 파일 |
| T013, T014, T018 | 세 이야기의 테스트를 한꺼번에 써도 된다 |

**병렬로 하면 안 되는 것**: T015·T016·T019는 모두 T005 셀렉터를 쓴다. T005가 끝나기
전에 시작하면 각자 임시 조회 맵을 만들게 되고, 그러면 R2가 없애려던 중복이 되살아난다.

---

## Parallel Example: Phase 2

```bash
# T002와 T003은 다른 파일이고 서로를 모른다
T002: webapp/src/blocks/board.ts
T003: webapp/src/properties/orgUnitEditor.tsx
```

## Parallel Example: 테스트 일괄 작성

```bash
# 세 이야기의 실패 테스트를 먼저 다 써 두고 구현으로 넘어가도 된다
T007: webapp/src/properties/orgDuty/orgDuty.test.tsx
T013: webapp/src/components/viewHeader/filterPanel/filterValuePanel.test.tsx
T014: webapp/src/components/centerPanel.test.tsx
T018: webapp/src/csvExporter.test.ts
```

---

## Implementation Strategy

### MVP First (User Story 1)

T001~T012까지가 MVP다. 여기서 멈춰도 **카드에 직책을 적는다**는 핵심 가치가 선다.
거르기·묶기·내보내기가 없어도 쓸 수 있다.

### Incremental Delivery

1. Phase 2까지 — 사용자에게 보이는 변화 없음. 커밋을 따로 낸다 (한 변경 = 한 관심사)
2. Phase 3 — 직책을 적을 수 있다 ← 여기서 한 번 배포해 써 보는 것을 권한다
3. Phase 4 — 보드 전체를 직책으로 다룬다
4. Phase 5 — 보고서로 나간다

### 커밋 나누기

원칙 VIII의 "한 변경 = 한 관심사"에 따라 최소 네 갈래로 나눈다.

| 커밋 | 범위 |
|---|---|
| `refactor(006):` | T002·T003 — 타입 정리, 행동 변화 없음 |
| `feat(006):` | T004·T005 — 이름 해석 셀렉터 |
| `feat(006):` | Phase 3 — 직책 속성 (US1) |
| `feat(006):` | Phase 4 — 필터·묶기 (US2) |
| `feat(006):` | Phase 5 — 내보내기 (US3) |

---

## Notes

- **직책 전용 에디터를 만들지 않는다.** T009는 목록을 넘기는 껍데기여야 한다. 파일이
  30줄을 넘어가면 `orgUnitEditor`에 있어야 할 것을 복제하고 있는 것이다
  ([research.md](./research.md) R1)
- **좁히기는 넣지 않으면 없다.** T009에서 `parentId`나 `allowedDepartments` 비슷한
  것을 쓰고 있다면 잘못 가고 있다 ([research.md](./research.md) R5)
- `server/` 아래 파일을 열게 되면 계획이 틀어진 것이다. 멈추고 [plan.md](./plan.md)를
  다시 본다

---

## 실행 결과 (2026-08-14)

### 품질 게이트 — 기준선 대비

`make webapp-ci`는 기준선에서도 exit=2다. 세 단계를 따로 돌려 목록으로 대조했다.

| 게이트 | 기준선 | 구현 후 | 판정 |
|---|---|---|---|
| jest 실패 스위트 | 57 | 57 (**목록 동일**) | 통과 |
| jest 실패 테스트 | 144 / 1016 | 144 / 1042 | 통과 — 새 테스트 26건 전부 통과 |
| tsc 오류 | 23 (파일 10개) | 23 (**목록 동일**) | 통과 |
| eslint | 기존 대량 실패 | 변경 파일에 **새 오류 0** | 통과 |
| `git diff --stat`에 `server/` | — | 없음 | 통과 |

`Resolve error: typescript with invalid interface loaded as resolver`는 005가 만든
파일에서도 동일하게 나는 기존 문제다(대조 확인).

### 전체 스위트가 흔들린다 — 판정을 개수로 하면 안 되는 이유

Phase 2 검증에서 실패 **테스트** 수가 144 → 145로 늘어 조사했다. 원인은 내 변경이
아니라 **저장소의 기존 비결정성**이다.

| 실행 | 변경 | 실패 테스트 | 실패 스위트 |
|---|---|---|---|
| 기준선 1차 | 없음 | 144 | 57 |
| 기준선 2차 | 없음 | 144 | 57 |
| 전체 변경 (3회) | 있음 | 145 (+galleryCard 스냅샷) | 57 |
| 타입 전용 변경 | 2파일 | 143 (−dateFilter) | 57 |

뒤집히는 두 테스트(`galleryCard`, `dateFilter`)는 **기준선에서 이미 실패 중인
스위트 안**에 있고 양방향으로 뒤집힌다. 타입 전용 변경이 dateFilter를 통과시킨 것이
결정적이다 — 타입은 런타임에 지워지므로 그 테스트에 영향을 줄 수 없다. 스위트
목록은 5회 모두 동일했다.

### 테스트 빨강 증거 (원칙 IV)

| 테스트 | 구현 전 실패 내용 |
|---|---|
| `store/orgMaster.test.ts` (4) | `getOrgLabels is not a function` |
| `properties/orgDuty/orgDuty.test.tsx` (9) | `Cannot find module './property'` |
| `properties/orgLabels.test.ts` — 이름 해석 (6) | `Cannot find module './orgLabels'` |
| `properties/orgLabels.test.ts` — `isOrgProperty` (2) | `isOrgProperty is not a function` |
| `filterValuePanel.test.tsx` 직책 (2) | 부서 목록이 나와 실패 |
| `csvExporter.test.ts` 직책 (2) | 직책 칸이 비어 실패 |

즉시 통과한 가드 테스트 `a 본부 filter lists no duties`는 **변이로 검증**했다 —
본부 필터가 직책을 내보내게 고치자 실패했고, 되돌리자 통과했다.

### 종단 검증 — 배포 후 실제 계정 (`전유홍`, 팀 `kkv`)

검증용 보드를 새로 만들어 훑고 끝나고 지웠다. FY27 실보드는 건드리지 않았다.

| 절 | 확인 | 결과 |
|---|---|---|
| 1 | 속성 유형 목록에 Duty (Division·Department 다음) | 통과 (FR-001) |
| 1 | 직책 9개가 서열 순 — CEO·고문·본부장·CFO·CHRO·COO·CSO·팀장·팀원 | 통과 (FR-003, FR-005) |
| 1 | 두 개 선택 → 라벨 두 개, DB에 ID 배열로 저장 | 통과 (FR-002) |
| 3 | 직위 고유 이름 8종(부회장·상무·이사·부장·차장·과장·대리·사원) 0건 | 통과 (FR-004) |
| 2 | 본부를 COO-생산으로 바꿔도 직책 목록 9개 그대로, 값 유지 | 통과 (FR-003) |
| 4 | 직책 필터 9개 + 팀장으로 거르면 값 둘인 카드만 남음 | 통과 (FR-007) |
| 4 | 묶기 제목이 `팀장, 본부장` / `팀원` — ID 아님 | 통과 (FR-008) |
| 5 | CSV `"본부장\|팀장"` — 26자 ID 0건 | 통과 (FR-009) |
| 6 | 직책 비활성화 후: 카드 `<ID> (removed)`, 그룹 헤더 ID, 목록에 잔류(활성 8 + 사라진 값 1) | 통과 (FR-006) |
| 7 | 규칙 편집기 Property 후보 0개 — 직책·본부 모두 없음 | 통과 (FR-011) |
| 7 | 본부=COO-생산일 때 부서 목록이 하위 4개로 좁혀짐 | 통과 (005 회귀 없음) |
| 7 | 담당자 후보: 권* 4명 중 생산본부 소속 2명만 (권상우·권혁 제외) | 통과 (FR-010, SC-006) |

조직 마스터는 6절 검증 후 원상복구했다(활성 직책 9개).

### SC 실측

| SC | 기준 | 실측 |
|---|---|---|
| SC-001 | 본부·부서와 같은 조작 수 | 같다 — 속성 추가 → 값 클릭 → 선택 |
| SC-002 | 활성 직책 100%, 직위 0건 | 9/9, 0건 |
| SC-003 | 지운 직책의 값 손실 0건 | 0건 |
| SC-004 | 필터·묶기가 실제 값과 100% 일치 | 일치 |
| SC-005 | 내보내기에 식별자 0건 | 0건 |
| SC-006 | 005 시나리오 회귀 0건 | 0건 |
