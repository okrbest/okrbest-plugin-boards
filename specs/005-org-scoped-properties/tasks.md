# Tasks: 본부·부서 속성과 조직 기반 선택지 좁히기

**Feature**: `005-org-scoped-properties` | **Date**: 2026-08-08

**Input**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 다른 파일을 건드리고 선행 과제가 없어 병렬로 진행 가능
- **[US1]~[US4]**: [spec.md](./spec.md)의 사용자 이야기 번호
- 모든 과제에 파일 경로를 적는다

## Path Conventions

이 저장소는 단일 플러그인이다 — `server/`(Go), `webapp/`(React + TypeScript).
경로는 저장소 루트 기준이다.

**테스트는 요청됐다.** constitution 원칙 IV가 동작 변경에 테스트를 요구하고,
superpowers `test-driven-development`가 실패 테스트 우선을 집행한다. 단
**Phase 2(선행 정리)만 예외**다 — 행동을 바꾸지 않는 정리이므로 기존 테스트가
그대로 통과하는 것이 증거이며, 새 테스트를 쓰면 행동이 바뀌었다는 잘못된 신호가
된다([plan.md](./plan.md) Constitution Check 원칙 IV).

---

## Phase 1: Setup (Shared Infrastructure)

- [ ] T001 기준선 측정 — `git stash -u`로 미추적 파일까지 치운 뒤 `make server-test`와 `npx jest --silent`(webapp)를 돌려 실패 스위트 목록을 `/tmp` 등 작업 폴더에 저장한다. 이후 모든 회귀 판정의 기준이며, 개수가 아니라 목록 diff로 본다 ([quickstart.md](./quickstart.md) 6절)

---

## Phase 2: Foundational (Blocking Prerequisites)

**목적**: 다중값·사람 판정이 문자열 비교로 흩어져 있어, 정리하지 않으면 이후 모든
단계에서 같은 20군데를 반복해 훑어야 한다 ([research.md](./research.md) R2).

**⚠️ 이 단계는 행동을 바꾸지 않는다.** 새 테스트를 쓰지 않으며, T001 기준선과
같은 결과가 나오는 것이 완료 조건이다.

- [ ] T002 `webapp/src/properties/types.tsx`의 `PropertyType`에 `isMultiValue`(기본 `false`)와 `isPersonLike`(기본 `false`) 필드를 추가한다
- [ ] T003 [P] `webapp/src/properties/multiselect/property.tsx`와 `webapp/src/properties/multiperson/property.tsx`에 `isMultiValue = true`를 넣는다
- [ ] T004 [P] `webapp/src/properties/person/property.tsx`, `multiperson/property.tsx`, `createdBy/property.tsx`, `updatedBy/property.tsx`에 `isPersonLike = true`를 넣는다
- [ ] T005 다중값 판정 호출부를 `registry.get(template.type).isMultiValue`로 바꾼다 — `webapp/src/boardUtils.ts:25`, `webapp/src/components/centerPanel.tsx:193,199`, `webapp/src/components/table/table.tsx:201,207`, `webapp/src/components/kanban/kanban.tsx:96,102`
- [ ] T006 사람 판정 호출부를 `registry.get(template.type).isPersonLike`로 바꾼다 — `webapp/src/boardUtils.ts:102`, `webapp/src/components/centerPanel.tsx:546`, `webapp/src/components/kanban/kanbanColumnHeader.tsx:55`, `webapp/src/components/table/tableGroupHeaderRow.tsx:58`, `webapp/src/csvExporter.ts:22`(`personPropertyTypes` Set 제거)
- [ ] T007 `webapp/src/mutator.ts:816,819,841`의 타입 변환 판정을 새 능력으로 바꾼다. 이 자리는 속성 종류를 **바꿀 때** 값을 어떻게 옮길지 정하므로 다중값·사람 판정이 둘 다 쓰인다
- [ ] T008 `webapp/src/components/table/table.tsx:97`의 컬럼 최소 폭 판정을 `isPersonLike`로 바꾼다
- [ ] T009 회귀 확인 — `make webapp-ci`를 돌려 실패 스위트 목록이 T001 기준선과 같은지 확인한다. 다르면 되돌리고 원인을 찾는다

**Checkpoint**: 여기까지 마치면 새 속성 타입이 그룹화·CSV·컬럼 폭에 자동으로
편입된다. 이후 단계에서 그 코드를 다시 건드리지 않는다.

---

## Phase 3: User Story 1 - 카드에 본부와 부서를 적는다 (Priority: P1) 🎯 MVP

**Goal**: 조직 관리에 등록된 본부·부서를 카드 속성으로 고르고 볼 수 있다.

**Independent Test**: 보드에 본부·부서 속성을 추가하고 카드에서 값을 고른 뒤
표·보드 보기에서 조직 이름이 보이는지 확인한다 ([quickstart.md](./quickstart.md) 1절).

### 데이터 경로

- [ ] T010 [P] [US1] `server/api/org.go`에 `GET /teams/{teamID}/org-profiles` 핸들러를 추가한다. 문턱은 `PermissionViewTeam`, 대상은 **그 팀의 활성 멤버 중 봇을 제외한 전원**(`TeamMembers`에서 얻는다), 내부는 기존 `App.GetUserOrgProfiles`를 쓴다. 사람 선택기가 공개 보드에서 팀 전체를 검색하므로 보드 단위로는 좁힘이 성립하지 않는다 ([contracts/org-profiles-api.md](./contracts/org-profiles-api.md))
- [ ] T011 [P] [US1] `server/api/org_test.go`에 실패 테스트를 먼저 쓴다 — 팀 열람 권한 없으면 403, 봇은 응답에 없음, 소속 없는 사용자는 행 자체가 생략됨
- [ ] T012 [US1] `webapp/src/octoClient.ts`에 `getOrgProfiles(teamId)`를 추가한다. 기존 `getOrgUnits(teamId)`와 같은 모양을 따른다
- [ ] T013 [US1] `webapp/src/store/orgMaster.ts`에 `orgProfilesByTeamId`를 더하고, 기존 `fetchOrgMaster` thunk에 함께 묶는다. 이미 팀 단위 스토어라 새 fetch 시점이 늘지 않는다

### 속성 타입

- [ ] T014 [US1] `webapp/src/blocks/board.ts:150`의 `PropertyTypeEnum`에 `'orgDivision'`과 `'orgDepartment'`를 추가한다
- [ ] T015 [P] [US1] `webapp/src/properties/orgDivision/property.tsx`를 만든다(FR-001, FR-002) — `isMultiValue = true`, `canFilter`·`canGroup = true`, `filterValueType = 'orgUnit'` ([contracts/property-types.md](./contracts/property-types.md) 2절)
- [ ] T016 [P] [US1] `webapp/src/properties/orgDepartment/property.tsx`를 같은 방식으로 만든다(FR-001, FR-002)
- [ ] T017 [US1] `webapp/src/properties/types.tsx`의 `FilterValueType`에 `'orgUnit'`을 추가한다
- [ ] T018 [US1] `webapp/src/properties/index.tsx`에 두 타입을 등록한다(FR-001)

### 에디터와 표시

- [ ] T019 [P] [US1] `webapp/src/properties/orgDivision/orgDivision.test.tsx`에 실패 테스트를 쓴다 — 활성 본부만 선택지에 나옴, 값이 ID가 아니라 이름으로 표시됨, 조직 마스터에 없는 ID는 문제 있는 값으로 표시됨(FR-006)
- [ ] T020 [US1] `webapp/src/properties/orgDivision/orgDivision.tsx` 에디터를 만든다. `webapp/src/properties/multiselect/multiselect.tsx`를 본뜨되 선택지 원본만 조직 마스터로 바꾼다(FR-003, FR-004, FR-005). 새 SCSS 파일을 만들지 않는다 (constitution II)
- [ ] T021 [US1] `webapp/src/properties/orgDepartment/orgDepartment.tsx` 에디터를 만든다(FR-003, FR-004). 이 단계에서는 전체 활성 부서를 보여준다 — 좁히기는 US2에서 얹는다
- [ ] T022 [P] [US1] `webapp/i18n/en.json`과 `webapp/i18n/ko.json`에 `PropertyType.OrgDivision`·`PropertyType.OrgDepartment`·`OrgProperty.empty`를 같은 변경으로 추가한다 (constitution V)

**Checkpoint**: 카드에 조직을 적을 수 있다. 좁히기는 아직 없다.

---

## Phase 4: User Story 2 - 본부를 고르면 부서 목록이 좁혀진다 (Priority: P2)

**Goal**: 이미 적은 본부를 근거로 부서 선택지를 줄이고, 본부가 바뀌면 범위를
벗어난 부서를 비운다.

**Independent Test**: 본부=생산인 카드에서 부서 선택지에 생산본부 부서만 나오는지,
본부를 바꾸면 부서가 비워지고 되돌리기 한 번으로 함께 복원되는지 확인한다
([quickstart.md](./quickstart.md) 2절).

### 좁히기 셀렉터

- [ ] T023 [P] [US2] `webapp/src/store/orgScope.test.ts`에 실패 테스트를 쓴다 — [data-model.md](./data-model.md) 3절의 파생 집합 넷을 케이스로 옮긴다. 값 합집합(FR-009), 속성 합집합(FR-010), 본부 없으면 전체(FR-008), 이미 있는 값 유지(FR-015)
- [ ] T024 [US2] `webapp/src/store/orgScope.ts`에 `선택된_본부`·`선택된_부서`·`허용_부서`·`표시_목록`을 순수 함수로 구현한다. 서버 왕복 없이 계산한다 ([research.md](./research.md) R1)

### 부서 에디터 연결

- [ ] T025 [US2] `webapp/src/properties/orgDepartment/orgDepartment.tsx`가 전체 부서 대신 `허용_부서(선택된_본부)`를 쓰도록 바꾼다(FR-007). 결과에 `표시_목록`을 적용해 카드에 이미 있는 값을 더한다
- [ ] T026 [P] [US2] `webapp/src/properties/orgDepartment/orgDepartment.test.tsx`에 좁히기 케이스를 더한다(SC-001) — 본부 하나, 본부 여럿, 본부 속성 여럿, 본부 비어 있음

### 본부 변경 시 정리

- [ ] T027 [P] [US2] `webapp/src/mutator.test.ts`에 실패 테스트를 쓴다(SC-004) — 본부를 바꾸면 범위 밖 부서가 비워지고(FR-016), 그 변경이 **하나의 패치**로 나가며(FR-017), 사람 값은 건드리지 않는다(FR-018)
- [ ] T028 [US2] `webapp/src/mutator.ts`의 `changePropertyValue`에서 본부 속성이 바뀌면 같은 카드의 부서 속성을 훑어 범위 밖 값을 제거하고, 본부 변경과 **함께 하나의 패치로** 보낸다. 나눠 보내면 중간 상태가 저장되고 되돌리기가 두 단계가 된다

**Checkpoint**: 본부 → 부서 좁히기가 동작한다.

---

## Phase 5: User Story 3 - 조직에 맞는 담당자만 고른다 (Priority: P3)

**Goal**: 카드의 조직 값으로 사람·다중사용자 선택지를 좁힌다.

**Independent Test**: 본부·부서가 적힌 카드에서 담당자 선택지에 그 소속만 나오고,
조직 값을 비우면 전체가 나오는지 확인한다 ([quickstart.md](./quickstart.md) 3절).

- [ ] T029 [P] [US3] `webapp/src/store/orgScope.test.ts`에 `허용_사용자` 케이스를 더한다(SC-002) — 부서 우선(FR-011), 본부만 있으면 하위 부서 포함(FR-012), 둘 다 없으면 `null`(FR-013), 소속 없는 사용자 제외(FR-014). **`null`과 빈 집합을 구별**하는 케이스를 반드시 넣는다
- [ ] T030 [US3] `webapp/src/store/orgScope.ts`에 `허용_사용자`를 구현한다 ([data-model.md](./data-model.md) 3.3)
- [ ] T031 [P] [US3] `webapp/src/components/personSelector.test.tsx`에 실패 테스트를 쓴다 — `allowedUserIds`가 없으면 기존과 같이 전체가 나오고, 주어지면 그 안에서만 나온다
- [ ] T032 [US3] `webapp/src/components/personSelector.tsx`에 선택적 `allowedUserIds?: Set<string>` prop을 더하고 `loadOptions`(117행) 안에서 거른다. prop이 없으면 기존 동작 그대로여야 다른 호출부가 안 바뀐다
- [ ] T033 [US3] `webapp/src/properties/person/confirmPerson.tsx`가 `허용_사용자(...)`와 `표시_목록`을 계산해 `allowedUserIds`로 넘기도록 배선한다. 이 컴포넌트가 person·multiPerson 양쪽을 담당하므로 한 곳만 고치면 된다
- [ ] T034 [US3] 적용 범위 확인 — `webapp/src/components/propertyValueElement.tsx`가 세 화면(`components/cardDetail/cardDetail.tsx`, `components/table/tableRow.tsx`, `components/kanban/kanbanCard.tsx`)에서 같은 `Editor`를 부르는지 확인한다. T033 하나로 세 곳이 덮여야 한다(FR-022)

**Checkpoint**: 명세의 핵심 가치가 성립한다. 여기까지가 실질 MVP다.

---

## Phase 6: User Story 4 - 조직으로 거르고 묶고 내보낸다 (Priority: P4)

**Goal**: 새 속성을 필터·그룹화·CSV에서 쓴다.

**Independent Test**: 본부 필터로 카드를 거르고, Group by로 묶고, CSV에 이름이
찍히는지 확인한다 ([quickstart.md](./quickstart.md) 4절).

**분리 가능**: 필터(T035~T037)는 규모가 person 패널에 준해 별도로 진행할 수 있고,
앞 단계들은 이것 없이도 완결된다 ([research.md](./research.md) R3).

- [ ] T035 [P] [US4] `webapp/src/components/viewHeader/filterPanel/filterValuePanel.test.tsx`에 실패 테스트를 쓴다 — 조직 속성의 필터 선택지가 조직 마스터에서 오고, 보드 옵션이 비어 있어도 목록이 뜬다
- [ ] T036 [US4] `webapp/src/components/viewHeader/filterPanel/filterValuePanel.tsx`에 `case 'orgUnit'` 갈래를 더한다. 219행부터의 `PersonFilterPanel`을 본떠 `OrgUnitFilterPanel`을 만들고, 본부·부서를 속성 타입으로 갈라 목록만 바꾼다(FR-019)
- [ ] T037 [P] [US4] `webapp/i18n/en.json`·`ko.json`에 필터 패널 문구(`FilterPanel.orgUnit-*`)를 추가한다
- [ ] T038 [P] [US4] `webapp/src/csvExporter.test.ts`에 실패 테스트를 쓴다 — 조직 값이 ID가 아니라 이름으로, `|`로 이어져 나온다
- [ ] T039 [US4] `webapp/src/csvExporter.ts`에 `orgPropertyTypes` 분기와 `exportOrgValue(value, orgUnits)`를 더한다. `exportValue`가 순수 함수라 조직 마스터에 닿지 못하므로, 사람 속성이 이미 쓰는 예외 경로를 따른다(FR-021, [research.md](./research.md) R4)
- [ ] T040 [US4] 그룹화 확인 — `webapp/src/boardUtils.ts`, `webapp/src/components/table/table.tsx`, `webapp/src/components/kanban/kanban.tsx`가 Phase 2의 `isMultiValue`를 거치므로 추가 코드 없이 동작해야 한다. 본부로 Group by 했을 때 묶이는지, 값이 여러 개인 카드가 해당 그룹마다 나타나는지 확인한다(FR-020)

**Checkpoint**: 명세의 모든 요구사항이 구현됐다.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T041 무효 참조 확인 — DB에서 부서 하나를 `active = false`로 바꾼 뒤 그 값을 가진 카드를 열어 값이 사라지지 않고 문제 있는 값으로 표시되는지 확인한다. 확인 후 되돌린다 ([quickstart.md](./quickstart.md) 1절, FR-006, SC-005)
- [ ] T042 하위 호환 확인 — 본부·부서 속성이 없는 보드에서 `webapp/src/properties/person/confirmPerson.tsx`가 `allowedUserIds`를 넘기지 않아 `webapp/src/components/personSelector.tsx`가 기존 경로를 타는지 확인한다. 카드 조회·편집 동작도 이전과 같아야 한다(FR-023, SC-006)
- [ ] T043 품질 게이트 — `make webapp-ci`, `make server-lint`, `make server-test`를 돌리고 실패 스위트 목록이 T001 기준선과 같은지 확인한다. 인터페이스 변경으로 mock이 바뀌었으면 `make generate`를 같은 변경에 포함한다 (constitution I)
- [ ] T045 [US3] 후보 수 감소 확인 — 담당자 선택지를 세 상태에서 열어 후보 수를 센다. 조직 미지정 69명 → 본부=생산 15명 → 부서=생산팀 7명. 명세 SC-003의 기준선이며, 실제 조직 데이터가 바뀌면 이 수치도 함께 갱신한다
- [ ] T044 종단 검증 — 플러그인을 빌드·배포하고 [quickstart.md](./quickstart.md) 1~5절을 실제 계정(`minsu.kwon`·`kiyoon.kwon`·`youhong.jun`)으로 훑는다. 소스만 고쳐서는 반영되지 않는다

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (기준선)
   ↓
Phase 2 (선행 정리)  ← 모든 이후 단계의 전제
   ↓
Phase 3 (US1 · P1)   ← 데이터 경로 + 속성 타입
   ↓
Phase 4 (US2 · P2)   ← US1의 부서 에디터 위에 좁히기를 얹는다
   ↓
Phase 5 (US3 · P3)   ← US2의 셀렉터를 사람 쪽에 쓴다
   ↓
Phase 6 (US4 · P4)   ← 앞 단계와 독립. 필터만 따로 떼어도 된다
   ↓
Phase 7 (마무리)
```

### User Story Dependencies

- **US1**: 선행 없음(Phase 2 이후). 조직을 카드에 적는 것 자체로 가치가 있다
- **US2**: US1의 부서 에디터가 있어야 한다
- **US3**: US2의 `orgScope` 셀렉터를 재사용한다. 다만 `허용_사용자`는 독립 함수라 US2와 병렬로 만들 수도 있다
- **US4**: US1의 속성 타입만 있으면 된다. US2·US3와 **병렬 가능**

### Within Each User Story

각 이야기 안에서는 실패 테스트 → 구현 → 검증 순서다 (superpowers
`test-driven-development`). Phase 2만 예외로 테스트를 쓰지 않는다.

### Parallel Opportunities

- **Phase 2**: T003·T004는 서로 다른 파일이라 병렬
- **Phase 3**: T010·T011(서버)과 T015·T016(속성 정의)·T022(i18n)가 병렬. 서버와 webapp은 완전히 독립
- **Phase 4~5**: US4(Phase 6)를 US2·US3와 병렬로 진행 가능
- **테스트 과제**: 대부분 `[P]` — 구현 파일과 다른 파일이다

---

## Parallel Example: User Story 1

서버와 webapp을 나눠 맡으면 이렇게 갈라진다.

```
담당 A (server):  T010 → T011
담당 B (webapp):  T014 → T015 [P] T016 [P] T022 → T017 → T018 → T020 → T021
연결:             T012 → T013  (담당 A의 T010이 끝난 뒤)
```

`T019`(에디터 테스트)는 `T020` 직전에 쓴다.

---

## Implementation Strategy

### MVP First

명세는 US1을 P1로 두지만, **실질 MVP는 Phase 5까지**다. US1만으로는 "조직을 적을
수 있다"에 그치고, 이 기능이 해결하려는 문제(69명에서 담당자 찾기)는 US3에서야
풀린다.

다만 US1은 그 자체로 배포 가능하고 되돌리기 쉽다. 조직 데이터가 실제 화면에서
어떻게 보이는지 먼저 확인하고 넘어가는 것을 권한다.

### Incremental Delivery

```
Phase 2 마치고  →  기존 테스트 그대로 통과 확인 후 커밋 (행동 불변)
Phase 3 마치고  →  조직을 카드에 적을 수 있음. 배포 가능
Phase 4 마치고  →  부서 좁히기. 배포 가능
Phase 5 마치고  →  담당자 좁히기. 핵심 가치 완성
Phase 6 마치고  →  필터·그룹화·CSV
```

constitution 원칙 VIII에 따라 **선행 정리(Phase 2)와 기능 추가를 다른 커밋으로**
나눈다 — 한 변경 = 한 관심사.

### Parallel Team Strategy

둘이 나눈다면 Phase 2를 함께 마친 뒤:

- **A**: Phase 3 서버 경로 → Phase 6 필터
- **B**: Phase 3 webapp 속성 → Phase 4 → Phase 5

Phase 6은 Phase 4·5와 파일이 겹치지 않는다.

---

## Notes

- **Phase 2에 새 테스트를 쓰지 않는다.** 행동 불변이 그 단계의 증거이며,
  기존 테스트가 그대로 통과하는 것으로 확인한다 ([plan.md](./plan.md) 원칙 IV)
- **회귀 판정은 실패 개수가 아니라 실패 스위트 목록 diff로 한다.** 이 저장소는
  깨끗한 상태에서도 `server/app` 7건 + `server/model` 1건, webapp 114개 스위트가
  실패한다. `TestPatchBoard`는 간헐 실패하므로 회귀로 오판하지 않는다
- **좁히기는 강제가 아니다.** 서버는 저장 시 값을 검증하지 않는다. 검증 과제를
  넣지 않는 것이 의도이며, 필요해지면 별도 기능으로 잡는다 (spec Assumptions)
- **새 SCSS 파일·색상 하드코딩·중복 위젯 금지** (constitution II). 에디터는
  `multiselect`, 필터 패널은 `PersonFilterPanel` 패턴을 차용한다
- 플러그인은 빌드·배포해야 반영된다. 소스만 고치고 화면을 확인하면 안 된다
