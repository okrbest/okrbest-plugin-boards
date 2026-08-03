---

description: "Task list for 속성 기준 카드 접근 권한"
---

# Tasks: 속성 기준 카드 접근 권한

**Input**: Design documents from `/specs/002-card-property-access/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/)

**Tests**: 테스트 과제를 **포함한다**. constitution 원칙 IV(동작 변경 시 테스트 동반)가 요구하고, superpowers `test-driven-development`가 런타임에 실패 테스트 우선을 집행하며, contracts에 계약 테스트 26항목(C-01~07, S-01~07, E-01~12)이 정의돼 있다.

**Organization**: 과제를 사용자 스토리별로 묶어 각 스토리를 독립적으로 구현·검증할 수 있게 한다.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 병렬 실행 가능 (다른 파일, 미완료 과제에 의존하지 않음)
- **[Story]**: 대응하는 사용자 스토리 (US1~US5)
- 설명에 정확한 파일 경로를 포함한다

## Path Conventions

- 서버: `server/model/`, `server/app/`, `server/api/`, `server/ws/`, `server/services/store/sqlstore/`
- 웹앱: `webapp/src/`
- 테스트는 대상 옆에 colocated (`*_test.go`, `*.test.tsx`)

---

## Phase 1: Setup (공유 타입)

**Purpose**: 이후 모든 단계가 참조하는 타입과 상수를 정의한다

- [ ] T001 [P] 규칙·규칙집합·권한 등급 타입을 `server/model/property_access.go`에 정의 (data-model.md §1.1~1.2, §3.1)
- [ ] T002 [P] 조직 단위·직책 조회 응답 타입을 `server/model/org.go`에 정의 (contracts/org-master-api.md 응답 스키마)
- [ ] T003 [P] `PropertyAccessRule`·`PropertyAccessSettings` 타입을 `webapp/src/blocks/board.ts`에 추가 (서버 JSON 스키마와 필드명 일치)

**Checkpoint**: 서버·웹앱이 같은 규칙 스키마를 공유한다

---

## Phase 2: Foundational (차단 선행 작업)

**Purpose**: 모든 사용자 스토리가 의존하는 조직 마스터 조회와 평가기 골격

**⚠️ CRITICAL**: 이 단계가 끝나기 전에는 어떤 사용자 스토리도 시작할 수 없다

### 조직 마스터 조회 (contracts/org-master-api.md)

- [ ] T004 조직 단위·직책 조회 store 메서드를 `server/services/store/sqlstore/org_master.go`에 구현 — `OrgUnits`(active만), `PositionDefinitions`(kind='duty' + active만) (data-model.md §2.1~2.2)
- [ ] T005 store 인터페이스에 조회 메서드를 `server/services/store/store.go`에 추가하고 `make generate`로 `mockstore`를 재생성 (constitution 원칙 I)
- [ ] T006 조직 마스터 조회 app 메서드를 `server/app/org_master.go`에 구현 — 정렬(org-units: type→name, duties: rank→name)과 빈 결과 `[]` 반환 포함
- [ ] T007 `GET /teams/{teamID}/org-units`·`GET /teams/{teamID}/duties` 라우트를 `server/api/org.go`에 등록하고 `server/api/api.go`의 `RegisterRoutes()`에 연결 — 팀 접근 권한 검사 포함
- [ ] T008 계약 테스트 C-01~C-07을 `server/api/org_test.go`에 작성 (contracts/org-master-api.md 계약 테스트 항목)

### 사용자 조직 해석

- [ ] T009 [P] 사용자 `props`에서 `org_unit_ids`·`position_codes`를 읽는 해석기를 `server/app/org_master.go`에 구현 — 쉼표 구분 문자열과 배열 형태 모두 처리, 빈 값은 미등록으로 (data-model.md §2.3)
- [ ] T010 [P] 조직 조상 집합 계산을 `server/app/org_master.go`에 구현 — `parentid`를 루트까지 따라가며 수집, 순환 방지 (FR-017, 계층 일반형)
- [ ] T011 조직 해석·조상 집합 단위 테스트를 `server/app/org_master_test.go`에 작성 — 2단계·3단계 계층, 미등록 사용자, id↔code 바인딩 구분 (research.md R5)

### 평가기 골격

- [ ] T012 평가기 실패 테스트를 `server/app/property_access_test.go`에 먼저 작성 — 관리자 우회, 스위치 꺼짐, 규칙 밖 카드가 보드 권한을 그대로 받는 케이스 (research.md R6 판정표의 마지막 3행)
- [ ] T013 `Evaluator` 생성과 `For(card)` 골격을 `server/app/property_access.go`에 구현 — 관리자 우회, 스위치 확인, 규칙 밖 카드는 보드 권한 반환 (data-model.md §3.2)

**Checkpoint**: 조직 데이터를 조회할 수 있고 평가기가 존재한다. 아직 어떤 카드도 걸러지지 않는다

---

## Phase 3: User Story 1 - 본부·부서 기준으로 카드 노출을 나눈다 (Priority: P1) 🎯 MVP

**Goal**: 보드 관리자가 "이 속성값 카드는 이 조직 사람만 본다" 규칙을 등록하고, 조건에 맞지 않는 사람에게 그 카드가 목록에서 사라지게 한다

**Independent Test**: 규칙 한 줄(속성값 + 본부 + 열람자)을 등록·활성화한 뒤, 해당 본부 계정과 다른 본부 계정으로 보드를 열어 카드 목록을 비교한다

### Tests for User Story 1 ⚠️ 구현 전에 작성하고 실패를 확인한다

- [ ] T014 [P] [US1] 조직 관문·max 판정 테스트를 `server/app/property_access_test.go`에 추가 — research.md R6 판정표의 조직 관련 행(전략본부 팀장 열람, 생산본부 팀장 차단, 조직정보 없음 차단)
- [ ] T015 [P] [US1] 규칙 저장 계약 테스트 S-01~S-07을 `server/api/boards_test.go`에 추가 (contracts/property-access-rules.md)
- [ ] T016 [P] [US1] 읽기 집행 계약 테스트 E-01·E-02·E-10~E-12를 `server/integrationtests/property_access_test.go`에 작성
- [ ] T017 [P] [US1] 섹션 컴포넌트 테스트를 `webapp/src/components/shareBoard/propertyAccessSection.test.tsx`에 작성 — 권한 게이트, 스위치 기본 꺼짐, 규칙 재조회
- [ ] T018 [P] [US1] 규칙 행 컴포넌트 테스트를 `webapp/src/components/shareBoard/propertyAccessRow.test.tsx`에 작성 — 연쇄 셀렉터, 저장 형식, 검증 규칙

### 규칙 저장 (서버)

- [ ] T019 [US1] 규칙 검증을 `server/app/property_access.go`에 구현 — 필수 필드, 조직·직책 세 축 최소 하나, `permission` 허용 값. 실패 시 `model.NewErrBadRequest()` (data-model.md §1.2)
- [ ] T020 [US1] 보드 패치 처리에서 `propertyAccess` 저장을 `server/app/boards.go`에 구현 — `updatedBy`·`updatedAt`을 서버 값으로 덮어쓰고 클라이언트 값을 무시 (FR-035, contracts S-02·S-03)
- [ ] T021 [US1] 잔재 키 제거를 `server/app/boards.go`의 보드 저장 경로에 구현 — `card_acl_rules`·`card_acl_enabled`·`card_acl_org_map`·`board_owner_user_id` (data-model.md §1.3)

### 판정 (서버)

- [ ] T022 [US1] 카드조건 매칭을 `server/app/property_access.go`에 구현 — `fields.properties[propertyId]`와 `propertyValueId` 비교, multiSelect는 포함 여부 (FR-023)
- [ ] T023 [US1] 조직 관문과 max 산출을 `server/app/property_access.go`에 구현 — 관문 판정 시 그 행의 조직 조건만 본다 (research.md R6)
- [ ] T024 [US1] 사용자별 허용 맵 선계산을 `server/app/property_access.go`의 평가기 생성에 추가 — `(propertyId, valueId)` → 관문 통과 여부·최대 권한 (research.md R3, data-model.md §3.2)

### 읽기 집행 (서버)

- [ ] T025 [US1] 사용자 컨텍스트를 받는 블록 조회 진입점을 `server/app/blocks.go`에 추가 — 기존 `GetBlocks`는 유지하고 평가기를 거치는 경로를 신설 (research.md R4)
- [ ] T026 [US1] 권한 없는 카드와 그 자식 블록 제거를 `server/app/blocks.go`에 구현 — `parentId`가 제거된 카드인 블록도 함께 제외 (FR-026, contracts E-02)
- [ ] T027 [US1] `GET /boards/{id}/blocks`·`/cards`·`/cards/by-ids` 핸들러가 새 진입점을 쓰도록 `server/api/blocks.go`를 수정

### UI (웹앱)

- [ ] T028 [P] [US1] 조직 마스터 조회 메서드 2개를 `webapp/src/octoClient.ts`에 추가 (contracts/org-master-api.md)
- [ ] T029 [P] [US1] 조직 마스터 Redux 슬라이스를 `webapp/src/store/orgMaster.ts`에 작성 — 팀별 캐시, 셀렉터
- [ ] T030 [US1] 규칙 행 컴포넌트를 `webapp/src/components/shareBoard/propertyAccessRow.tsx`에 구현 — 셀렉터 6개, 속성값은 속성명에 종속, 부서는 본부에 종속 (FR-006~FR-010)
- [ ] T031 [US1] 섹션 컨테이너를 `webapp/src/components/shareBoard/propertyAccessSection.tsx`에 구현 — 사용 스위치(기본 꺼짐), 행 추가·삭제, `ManageBoardRoles` 게이트 (FR-001~FR-004)
- [ ] T032 [P] [US1] 섹션 스타일을 `webapp/src/components/shareBoard/propertyAccess.scss`에 작성 (SCSS + BEM, 테마 값은 CSS 변수)
- [ ] T033 [US1] 섹션을 멤버 목록 아래에 `webapp/src/components/shareBoard/shareBoard.tsx`에 삽입 (FR-001)
- [ ] T034 [P] [US1] 신규 UI 문자열을 `webapp/i18n/en.json`과 `webapp/i18n/ko.json`에 동시 추가 (constitution 원칙 V)

**Checkpoint**: 규칙을 등록·활성화하면 조건에 맞지 않는 사용자의 카드 목록에서 카드가 사라진다. **화면상 격리는 완성되지만 보안은 아직 성립하지 않는다**

---

## Phase 4: User Story 2 - 우회 경로를 막는다 (Priority: P2)

**Goal**: 조회 외의 모든 경로(쓰기·검색·실시간·내보내기)를 같은 기준으로 막는다

**Independent Test**: 클라이언트를 거치지 않은 직접 요청으로 카드 수정·삭제를 시도해 거부되는지, 검색 결과에 제목이 나오는지, 다른 사용자의 변경이 실시간으로 전달되는지 확인한다

### Tests for User Story 2 ⚠️ 구현 전에 작성하고 실패를 확인한다

- [ ] T035 [P] [US2] 쓰기 집행 계약 테스트 E-03~E-06을 `server/integrationtests/property_access_test.go`에 추가
- [ ] T036 [P] [US2] 검색 집행 계약 테스트 E-07을 `server/integrationtests/property_access_test.go`에 추가
- [ ] T037 [P] [US2] 웹소켓 수신자별 필터 테스트 E-08·E-09를 `server/ws/plugin_adapter_test.go`에 추가

### 구현

- [ ] T038 [US2] 블록 수정·삭제 가드를 `server/app/blocks.go`에 구현 — 대상 카드 판정이 `editor` 미만이면 `model.NewErrPermission()` (FR-027, contracts E-03~E-05)
- [ ] T039 [US2] 블록 생성은 보드 권한으로 통과시키도록 `server/app/blocks.go`에 명시 — 규칙을 적용하지 않는다 (FR-032, contracts E-06)
- [ ] T040 [US2] 검색 결과 필터를 `server/api/search.go`와 대응 app 경로에 구현 (FR-028)
- [ ] T041 [US2] 블록 브로드캐스트 수신자별 필터를 `server/ws/plugin_adapter.go`의 `sendBoardMessage` 경로에 구현 — 수신자 목록을 만든 뒤 각자 평가기로 판정해 제외 (FR-029)
- [ ] T042 [US2] 평가기 사용자별 캐시와 보드 규칙 변경 시 무효화를 `server/app/property_access.go`에 구현 (research.md R3 웹소켓 특이사항, SC-006)

**Checkpoint**: 클라이언트를 우회한 요청·검색·실시간 경로로 내용이 새지 않는다. **여기까지 와야 보안이 성립한다**

---

## Phase 5: User Story 3 - 직책으로 편집 권한을 더 준다 (Priority: P3)

**Goal**: 같은 조직 안에서 직책으로 권한을 단계적으로 올린다

**Independent Test**: 같은 본부에 `열람자` 행과 `직책=본부장 · 편집자` 행을 함께 걸고, 그 본부의 본부장 계정과 팀장 계정의 편집 가능 여부를 비교한다

### Tests for User Story 3 ⚠️ 구현 전에 작성하고 실패를 확인한다

- [ ] T043 [P] [US3] 직책 가산 판정 테스트를 `server/app/property_access_test.go`에 추가 — research.md R6 판정표의 전략본부 본부장(편집자)·전략본부 팀장(열람자)·생산본부 본부장(관문 차단) 행
- [ ] T044 [P] [US3] 직책 조건만 걸린 규칙 테스트를 `server/app/property_access_test.go`에 추가 (spec US3-4)

### 구현

- [ ] T045 [US3] 직책 축 매칭을 `server/app/property_access.go`에 구현 — 사용자 `position_codes`에 `dutyCode` 포함 여부. 해당 code의 `kind`가 `duty`가 아니면 무시 (FR-024, research.md R5)
- [ ] T046 [US3] 직책이 관문으로 작동하지 않음을 `server/app/property_access.go`에 반영 — 직책 없는 사용자도 조직 조건만으로 권한을 얻는다 (FR-018)
- [ ] T047 [US3] 직책 셀렉터를 `webapp/src/components/shareBoard/propertyAccessRow.tsx`에 연결 — `kind='duty'` 목록만, `rank` 순 정렬

**Checkpoint**: 같은 조직 안에서 직책으로 권한이 갈린다

---

## Phase 6: User Story 4 - 전사 조회 직책은 모든 카드를 본다 (Priority: P4)

**Goal**: "보드 전체보기"가 켜진 직책 보유자에게 최소 열람 권한을 보장한다

**Independent Test**: 전체보기가 켜진 직책 계정으로, 규칙상 접근 권한이 없어야 할 카드를 열람할 수 있는지 확인한다

### Tests for User Story 4 ⚠️ 구현 전에 작성하고 실패를 확인한다

- [ ] T048 [P] [US4] 전체보기 하한 테스트를 `server/app/property_access_test.go`에 추가 — 관문에 막힌 카드가 열람 가능(US4-1), 규칙이 편집자를 주면 편집 유지(US4-2)
- [ ] T049 [P] [US4] 보드 진입 권한은 바뀌지 않음을 `server/integrationtests/property_access_test.go`에 검증 (US4-3)

### 구현

- [ ] T050 [US4] 전체보기 하한 계산을 `server/app/property_access.go`의 평가기 생성에 추가 — 사용자 직책 중 `fullvisibility`가 하나라도 켜져 있으면 하한 `viewer` (FR-022)
- [ ] T051 [US4] 최종 반환을 `max(규칙권한, 하한)`으로 `server/app/property_access.go`에 반영 — 하한이 권한을 낮추지 않는다 (FR-022)

**Checkpoint**: 전체보기 직책이 조직 경계를 넘어 열람할 수 있고, 규칙이 준 더 높은 권한은 유지된다

---

## Phase 7: User Story 5 - 규칙을 마지막으로 바꾼 사람을 확인한다 (Priority: P5)

**Goal**: 규칙 섹션에 마지막 변경자와 변경 시각을 표시한다

**Independent Test**: 규칙을 저장한 뒤 다른 관리자 계정으로 공유 팝업을 열어 마지막 변경자와 시각이 표시되는지 확인한다

### Tests for User Story 5 ⚠️ 구현 전에 작성하고 실패를 확인한다

- [ ] T052 [P] [US5] 마지막 변경자 표시 테스트를 `webapp/src/components/shareBoard/propertyAccessSection.test.tsx`에 추가 — 미저장 보드는 표시 없음(US5-1), 저장 후 변경자·시각 표시(US5-2)

### 구현

- [ ] T053 [US5] 마지막 변경자·시각 표시를 `webapp/src/components/shareBoard/propertyAccessSection.tsx`의 섹션 헤더에 구현 — 사용자 표시명 해석 포함 (FR-034)
- [ ] T054 [P] [US5] 표시 문자열을 `webapp/i18n/en.json`과 `webapp/i18n/ko.json`에 동시 추가 (constitution 원칙 V)

**Checkpoint**: 모든 사용자 스토리가 독립적으로 동작한다

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: 여러 스토리에 걸친 마무리

- [ ] T055 [P] 깨진 참조 표시를 `webapp/src/components/shareBoard/propertyAccessRow.tsx`에 구현 — 규칙이 가리키는 속성·속성값·조직·직책이 사라졌거나 비활성이면 그 행에 경고 표시 (FR-036)
- [ ] T056 [P] 깨진 참조가 매칭 실패로 처리됨을 `server/app/property_access_test.go`에 검증 (FR-036)
- [ ] T057 규칙 100개 보드에서 카드 목록 표시 시간을 측정해 규칙 없는 같은 보드 대비 20% 이내임을 확인 (SC-006)
- [ ] T058 `make server-lint`·`make server-test`·`make webapp-ci`를 실행하고 출력을 완료 근거로 제시 (constitution 원칙 I)
- [ ] T059 [quickstart.md](quickstart.md)의 시나리오 1~5를 배포된 플러그인에서 수동 검증
- [ ] T060 브랜치를 `feat/permission`에 선형 병합할 수 있도록 정리 (rebase 기반, constitution 원칙 VIII)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: 의존 없음, 즉시 시작
- **Foundational (Phase 2)**: Setup 완료에 의존 — **모든 사용자 스토리를 차단한다**
- **US1 (Phase 3)**: Foundational 완료에 의존
- **US2 (Phase 4)**: **US1에 의존** — 평가기의 조직 관문·매칭이 있어야 집행할 대상이 정해진다
- **US3 (Phase 5)**: Foundational에 의존. US1과 병렬 가능하나 UI 셀렉터(T047)는 T030 완료 후
- **US4 (Phase 6)**: Foundational에 의존. US1·US2·US3와 병렬 가능
- **US5 (Phase 7)**: US1의 저장 경로(T020)에 의존
- **Polish (Phase 8)**: 원하는 스토리가 모두 끝난 뒤

### 스토리 간 의존 (이 기능의 특수 사정)

템플릿 기본형과 달리 **US2는 US1에 의존한다.** US2는 새 판정 규칙을 만들지 않고 US1이 만든 판정을 조회 외 경로에 적용하는 작업이기 때문이다. 대신 US3·US4는 평가기의 다른 축을 더하는 것이라 US1과 병렬로 진행할 수 있다.

**보안상 중요**: US1만 배포하면 화면상 격리는 보이지만 API·검색·실시간 경로로 내용이 샌다. US1과 US2는 **함께 배포해야 한다**. 나눠 배포한다면 릴리스 노트에 그 사실을 명시한다.

### Within Each User Story

- 테스트를 먼저 작성하고 **실패를 확인한 뒤** 구현한다 (superpowers TDD)
- 모델 → 서비스 → 엔드포인트 → 통합 순
- 서버 판정 → 서버 집행 → UI 순

### Parallel Opportunities

- **Phase 1**: T001·T002·T003 전부 병렬
- **Phase 2**: T009·T010 병렬. T004~T008은 store → app → api 순차
- **Phase 3 테스트**: T014~T018 전부 병렬 (서로 다른 파일)
- **Phase 3 구현**: T028·T029·T032·T034가 서버 작업(T019~T027)과 병렬
- **Phase 4 테스트**: T035·T036·T037 병렬
- **Phase 5·6**: US3와 US4가 서로 병렬. 각 스토리의 테스트끼리도 병렬
- **Phase 8**: T055·T056 병렬

---

## Parallel Example: User Story 1

```
# 테스트 5개를 동시에 작성 (전부 다른 파일, TDD 실패 확인까지 함께)
T014  server/app/property_access_test.go
T015  server/api/boards_test.go
T016  server/integrationtests/property_access_test.go
T017  webapp/src/components/shareBoard/propertyAccessSection.test.tsx
T018  webapp/src/components/shareBoard/propertyAccessRow.test.tsx

# 실패 확인 후, 서버와 웹앱을 두 갈래로 나눠 진행
서버:  T019 → T020 → T021 → T022 → T023 → T024 → T025 → T026 → T027
웹앱:  T028 ∥ T029 ∥ T032 ∥ T034  →  T030 → T031 → T033
```

---

## Implementation Strategy

### MVP 범위

**US1(Phase 1~3)이 MVP다.** 규칙을 등록해 조직 기준으로 카드가 갈리는 것을 실제로 볼 수 있다.

다만 이 기능에서 MVP는 **데모 가능한 상태지 배포 가능한 상태가 아니다.** US2 없이 배포하면 격리가 화면에만 걸려 있어 명세의 SC-002(우회 성공 0건)를 만족하지 못한다.

### 권장 배포 단위

| 배포 | 포함 | 상태 |
|---|---|---|
| 1차 | Phase 1~4 (US1 + US2) | 조직 기준 격리가 보안으로 성립 |
| 2차 | Phase 5~6 (US3 + US4) | 직책 세분화와 경영진 전사 조회 |
| 3차 | Phase 7~8 (US5 + 마무리) | 운영 편의와 정합성 표시 |

### 점진 전달

1. Phase 1~2를 끝내고 평가기 단위 테스트가 판정표대로 통과하는지 확인한다 — 화면 변화 없음
2. Phase 3을 끝내고 두 계정으로 목록 차이를 눈으로 확인한다
3. Phase 4를 끝내고 우회 요청이 막히는지 확인한다 → **1차 배포**
4. Phase 5~6을 각각 끝낼 때마다 해당 시나리오를 검증한다 → **2차 배포**
5. Phase 7~8 → **3차 배포**
