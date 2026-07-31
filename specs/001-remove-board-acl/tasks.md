---

description: "Task list for 001-remove-board-acl"
---

# Tasks: 보드 접근 권한(ACL) 및 소유자 개념 제거

**Input**: Design documents from `/specs/001-remove-board-acl/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/)

**Tests**: 신규 테스트를 작성하지 않는다. 삭제 권한 판정이 바뀌므로 기존 테스트의 기대값을 `main` 기준으로 복원하고(원칙 IV), 접근 권한 기능을 검증하던 테스트를 제거한다. 근거는 [research.md](research.md) R-005.

**Organization**: 사용자 스토리별로 묶었다. 이 기능은 제거 작업이라 FR 일부(FR-001~007, FR-013, FR-017, FR-018)가 특정 스토리에 매이지 않는다. 해당 작업은 Phase 6에 스토리 라벨 없이 모았다.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 병렬 실행 가능 (서로 다른 파일, 미완료 작업에 의존하지 않음)
- **[Story]**: 소속 사용자 스토리 (US1, US2, US3)
- 파일 경로를 반드시 포함한다

## Path Conventions

이 저장소는 단일 플러그인이다. 서버는 `server/`, 웹앱은 `webapp/src/`. 상세 구조는 [plan.md](plan.md)의 Project Structure 참조.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: 완료 판정의 기준선 확보. 이 브랜치는 접근 권한과 무관한 실패를 이미 다수 갖고 있어 절대 통과가 아닌 **델타**로 판정한다(SC-005). 기준선을 잃으면 판정이 불가능하다.

- [X] T001 [P] webapp jest 기준선을 `/tmp/before-jest.txt`에 캡처 — `cd webapp && NODE_ENV=test npx jest 2>&1 | grep -E "^(FAIL|PASS) src/|^  ● " | sort -u`
- [X] T002 [P] webapp 타입 검사 기준선을 `/tmp/before-tsc.txt`에 캡처 — `cd webapp && npx tsc 2>&1 | grep "error TS" | sed 's/([0-9]*,[0-9]*)//' | sort`
- [X] T003 [P] server 테스트 기준선을 `/tmp/before-server.txt`에 캡처 — `cd server && go test -tags 'json1 sqlite3' -count=1 ./... 2>&1 | grep -E "^(FAIL|--- FAIL)" | sort -u`
- [X] T004 되돌리기 규약 검사의 현재 위반 상태를 기록 — `server/services/store/sqlstore/migrations/*.down.sql`을 `SELECT 1;`과 대조해 000047이 위반으로 잡히는지 확인. FR-018 완료 증거의 전후 대조군이 된다

**Checkpoint**: 기준선 4종 확보. 이제 어떤 변경이 신규 실패를 만드는지 판정할 수 있다

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 모든 스토리에 선행하는 공통 인프라

**해당 없음.** 이 기능은 제거 작업이므로 새로 세울 기반이 없다. 기준선 확보(Phase 1) 외에 US1·US2를 막는 선행 작업은 존재하지 않으며, 두 스토리는 서로 독립적으로 착수·완료·배포할 수 있다.

다만 **순서 제약이 둘 있다**. 스토리 간 의존이 아니라 안전한 절단 순서에서 나온다.

1. Phase 6(서버 접근 권한 제거)은 Phase 4(US2, 웹앱 클라이언트 제거) **이후**여야 한다. 웹앱이 아직 호출하는 API를 먼저 없애면 화면이 깨진다
2. Phase 6의 마이그레이션 작업(T051~T054)은 Phase 5(US3, 영향 조사) **이후**여야 한다. `has_acl_entries` 컬럼이 사라지면 영향 범위를 조회할 수단이 없어진다

---

## Phase 3: User Story 1 - 보드 관리자가 보드를 삭제할 수 있다 (Priority: P1) 🎯 MVP

**Goal**: 소유자 개념을 걷어내고 보드 삭제 권한을 `main`의 판정(보드 관리자 + 팀·시스템 관리자)으로 되돌린다. 생성자 계정이 비활성화되어 아무도 삭제할 수 없던 보드를 관리자가 정리할 수 있게 된다.

**Independent Test**: 보드를 만들지 않은 보드 관리자 계정으로 보드 삭제를 시도해 성공하고, 편집자 계정으로는 거부되는지 확인한다. 접근 권한(ACL) 기능은 그대로 둔 채로 검증 가능하다.

### 모델 계층

- [X] T005 [US1] `server/model/board_permissions.go`의 `PermissionSatisfies`에서 `if required == PermissionDeleteBoard { return false }` 하드 차단을 제거해 `DeleteBoard`가 일반 등급 비교 경로를 타게 한다
- [X] T006 [US1] `server/model/board_permissions.go`의 `BuildCapabilities` 시그니처에서 `isOwner` 인자를 제거하고 `CanDeleteBoard` 산출을 `EffectivePermissionRank(...) >= 4`로 바꾼다
- [X] T007 [US1] `server/model/board_permissions.go`에서 소유자 자산을 제거한다 — `BoardOwnerUserIDKey` 상수, `PermissionDerivedOwner` 상수, `ResolveBoardOwnerUserID` 함수, `BoardPermissionsResponse`의 `IsOwner` 필드

### 권한 서비스 계층

- [X] T008 [US1] `server/services/permissions/mmpermissions/mmpermissions.go`의 `HasPermissionToBoard`에서 `if permission == model.PermissionDeleteBoard { return resolved.IsOwner }` 분기를 제거한다
- [X] T009 [US1] `server/services/permissions/mmpermissions/mmpermissions.go`의 `GetBoardPermissions`에서 소유자 조기 반환 블록과 `IsOwner` 설정 4곳을 제거하고 `BuildCapabilities` 호출을 T006의 새 시그니처에 맞춘다
- [X] T010 [US1] `server/services/permissions/localpermissions/localpermissions.go`에서 `HasPermissionToBoard`의 `return response.IsOwner`와 응답 구성 3곳의 `IsOwner: false`를 제거하고 `BuildCapabilities` 호출을 갱신한다

### API 계층

- [X] T011 [US1] `server/api/boards.go`에서 `PUT /boards/{boardID}/owner` 라우트 등록, `handleTransferBoardOwnership` 핸들러, 요청 구조체의 `OwnerUserID` 필드를 제거한다
- [X] T012 [US1] `server/api/members.go`에서 소유자를 멤버 제거·역할 변경에서 예외 처리하는 가드 2곳을 제거한다

### 웹앱

- [X] T013 [P] [US1] `webapp/src/hooks/permissions.tsx`에서 `DeleteBoard` 특례 분기를 제거하고 `Permission.DeleteBoard`를 `adminPermissions` 배열로 되돌린다
- [X] T014 [P] [US1] `webapp/src/components/shareBoard/userPermissionsRow.tsx`에서 `isOwner` prop과 소유자일 때 역할 드롭다운 대신 읽기 전용을 렌더하는 분기를 제거한다
- [X] T015 [P] [US1] `webapp/src/components/shareBoard/userPermissionsRow.test.tsx`에서 `isOwner={false}` prop 전달 4곳을 제거한다
- [X] T016 [P] [US1] `webapp/src/octoClient.ts`에서 `transferBoardOwnership` 메서드를 제거한다
- [X] T017 [P] [US1] `webapp/src/blocks/board.ts`의 `BoardPermissionsResponse` 타입에서 `isOwner: boolean` 필드를 제거한다
- [X] T018 [US1] `webapp/src/components/shareBoard/shareBoard.tsx`에서 소유권 이전 관련 자산을 제거한다 — 상태 `transferOwnerUserId`·`isOwnershipTransferring`, 파생값 `ownerUserId`·`canTransferOwnership`·`transferCandidates`, 핸들러 `handleTransferOwnership`, 소유자 분기 2곳, `isOwner` prop 전달, 소유권 이전 UI JSX

### 테스트 기대값 복원

- [X] T019 [P] [US1] `server/services/permissions/mmpermissions/mmpermissions_test.go`에서 `board admin`과 `elevate board viewer permissions` 케이스의 `hasPermissionTo`에 `model.PermissionDeleteBoard`를 복원하고, 브랜치가 추가한 `board owner can delete board` 케이스를 삭제한다
- [X] T020 [P] [US1] `server/services/permissions/localpermissions/localpermissions_test.go`의 `admin` 케이스에서 `model.PermissionDeleteBoard`를 `hasNotPermissionTo`에서 `hasPermissionTo`로 되돌린다

### 검증

- [X] T021 [US1] `cd server && go test -tags 'json1 sqlite3' -count=1 ./services/permissions/...` 실행 — 특히 `elevate board viewer permissions`가 통과해야 한다. 이 케이스는 팀 관리자 승격이 `manage` 등급을 산출하고 그 등급이 삭제를 통과시킨다는 T005·T006의 설계 가설을 검증한다
- [X] T022 [US1] `cd webapp && npm run build` 통과 확인 후 jest·tsc 델타 비교 — 신규 실패 0건

**Checkpoint**: 소유자 개념이 사라지고 보드 관리자·팀 관리자가 삭제 권한을 되찾았다. 접근 권한(ACL) 기능은 아직 그대로다. 이 상태로 배포·시연 가능

---

## Phase 4: User Story 2 - 보드 공유 화면이 멤버 관리에만 집중된다 (Priority: P2)

**Goal**: 공유 화면에서 부서·직위 권한 등록 영역을 걷어내고, 웹앱이 접근 권한 관련 서버 인터페이스를 더 이상 호출하지 않게 한다.

**Independent Test**: 보드 관리자로 공유 화면을 열어 접근 권한 등록 영역이 보이지 않고 멤버 초대·역할 변경·링크 공유가 정상 동작하는지 확인한다. 서버는 아직 해당 API를 갖고 있으므로 서버 변경 없이 검증할 수 있다.

- [X] T023 [US2] `webapp/src/components/shareBoard/shareBoard.tsx`에서 접근 권한 자산을 제거한다 — 타입 `ACLPermission`·`ACLEntryDraft`·`CreateACLDraft`, 헬퍼 `toACLPermission`·`normalizePermissionForSubject`·`getPermissionOptions`, 상태 7개, 핸들러 `saveACL`·`createDraftToEntry`·`validateCreateDraft`·`getACLEntryKey`·`getACLSubjectDuplicateKey`, 목록·선택지 병렬 로드 블록, `useEffect` 의존성의 `canManageACL`, "보드 접근 권한(ACL)" 섹션 JSX 전체
- [X] T024 [P] [US2] `webapp/src/components/shareBoard/shareBoard.scss`에서 접근 권한 스타일 7개를 제거한다 — `__acl-toolbar`, `__acl-list`, `__acl-row`, `__acl-row--header`, `__acl-row--editing`, `__acl-actions`, `__acl-empty`
- [X] T025 [P] [US2] `webapp/src/octoClient.ts`에서 `getBoardACL`·`putBoardACL`·`getOrgUnits`·`getPositions` 메서드와 `[Boards Debug Headers]` 로깅 블록을 제거한다. `getBoardPermissionsMe`는 유지한다
- [X] T026 [P] [US2] `webapp/src/blocks/board.ts`에서 `BoardACLEntry`·`ACLSubjectOption` 타입과 export 2개를 제거한다
- [X] T027 [P] [US2] `webapp/src/components/sidebar/sidebar.test.tsx`에서 접근 권한으로 도달하는 보드의 표시를 검증하는 `shows accessible board in default category even if metadata is missing` 케이스를 삭제한다 — 전제가 사라진다
- [X] T028 [P] [US2] `webapp/src/store/boards.test.ts`의 픽스처 식별자 `board-acl`을 접근 권한과 무관한 이름으로 바꾼다. 정렬 테스트의 문자열일 뿐이며 혼동만 준다
- [X] T029 [US2] `cd webapp && npm run build` 통과 확인 후 jest·tsc 델타 비교 — 신규 실패 0건

**Checkpoint**: 웹앱이 접근 권한 관련 서버 인터페이스를 전혀 호출하지 않는다. 서버 API를 안전하게 제거할 수 있는 상태

---

## Phase 5: User Story 3 - 접근 범위 축소를 배포 전에 파악할 수 있다 (Priority: P3)

**Goal**: 접근 권한이나 전체공개 직위로만 보드에 접근하던 사용자를 식별해 조치를 결정한다.

**Independent Test**: 조회 결과로 영향받는 보드 수와 사용자 명단을 산출할 수 있는지 확인한다.

**⚠️ 시점 제약**: Phase 6의 마이그레이션 작업(T051~T054)보다 **먼저** 수행해야 한다. `has_acl_entries` 컬럼이 사라지면 조회 수단이 없어진다.

- [ ] T030 [P] [US3] 운영 데이터베이스에서 `boards` 테이블의 `has_acl_entries = true`인 행을 조회해 접근 권한이 등록된 보드의 수와 식별자 목록을 산출한다
- [ ] T031 [US3] T030의 각 보드에 대해 `properties`의 접근 권한 항목에 걸린 부서·직위를 추출하고, 해당 조직에 속하면서 보드 멤버가 아닌 사용자 명단을 산출한다 — 이들이 접근을 잃는다
- [ ] T032 [P] [US3] 직위 마스터에서 전체공개 플래그가 설정된 직위와 그 보유자 명단을 산출한다 — 팀 전체 보드 열람 권한을 잃는다
- [ ] T033 [US3] T031·T032 결과를 근거로 조치를 결정하고 기록한다 — 해당 사용자를 보드 멤버로 직접 추가할지, 접근 상실을 공지할지

**Checkpoint**: 배포 영향이 문서화되고 조치가 결정되었다. 마이그레이션을 진행해도 안전하다

---

## Phase 6: 서버 접근 권한 잔여 제거 및 스키마 정리

**Purpose**: FR-001~FR-005, FR-007, FR-013, FR-017, FR-018을 처리한다. 특정 사용자 스토리에 매이지 않는 제거 작업이다.

**의존**: Phase 4(US2) 완료 후 착수. T051~T054는 Phase 5(US3) 완료 후.

### API 계층

- [X] T034 `server/api/boards.go`의 `registerBoardsRoutes`에서 라우트 7개를 제거한다 — `/org/units`, `/org/positions`, `/boards/{boardID}/permissions/preview`, `/boards/{boardID}/acl` GET·PUT, `/boards/{boardID}/acl/entries` POST, `/boards/{boardID}/acl/entries/{entryID}` DELETE. `/boards/{boardID}/permissions/me`만 남는다
- [X] T035 `server/api/board_permissions.go`를 `handleGetBoardPermissionsMe` 하나만 남기고 축소한다 — 핸들러 7개와 헬퍼 `persistBoardACL`·`filterOutUserACLEntries`·`canManageBoardACL`·`normalizeAndValidateACLEntries`·`normalizeLegacyOrgManagePermissions` 제거
- [X] T036 `server/api/permissions_debug.go`와 `server/api/permissions_debug_test.go`를 삭제하고, `server/api/boards.go`·`server/api/search.go`의 호출부 4곳(`debugPermissionsEnabled`, `resolveDebugInfo`, `setBoardsDebugHeaders`)을 정리한다

### 앱 계층

- [X] T037 `server/app/boards.go`에서 `expandBoardsWithACLAndFullVisibility`·`resolveOrgContextForScope`와 관련 익명 인터페이스 정의 2개를 제거하고, 호출부 3곳을 확장 없는 원본 반환으로 되돌린다
- [X] T038 [P] `server/app/org_master.go`를 삭제한다

### 저장소 계층

- [X] T039 `server/services/store/store.go`의 `Store` 인터페이스에서 `GetBoardsInTeam`·`GetBoardsInUserTeams` 선언을 제거하고, `server/services/store/sqlstore/public_methods.go`의 래퍼 2개도 제거한다
- [X] T040 `server/services/store/sqlstore/board.go`에서 `getBoardsInTeam`·`getBoardsInUserTeams`·`boardHasACLEntries`를 제거한다
- [X] T041 [P] `server/services/store/sqlstore/org_role_options.go`를 삭제한다
- [X] T042 `make generate`로 `server/services/store/mockstore/mockstore.go`를 재생성한다 (원칙 I — 인터페이스 변경 시 목 재생성 필수). 손으로 편집하지 않는다

### 권한 서비스 계층

- [X] T043 `server/services/permissions/permissions.go`의 `PermissionsService` 인터페이스에서 `ResolveOrgContext`를 제거한다. `GetBoardPermissions`는 유지한다
- [X] T044 `server/services/permissions/mmpermissions/mmpermissions.go`의 `GetBoardPermissions`에서 접근 권한 파싱·평가 블록, `resolveOrgContext` 클로저, 관련 지역 변수 8개, 전체공개 승격 블록, 조직 컨텍스트 디버그 로깅을 제거하고 `ResolveOrgContext`·`ResolveOrgContextDebugForTeam` 메서드를 삭제한다
- [X] T045 [P] `server/services/permissions/localpermissions/localpermissions.go`에서 `ResolveOrgContext` 스텁을 삭제한다

### 모델 계층

- [X] T046 `server/model/board_permissions.go`에서 접근 권한 자산을 제거한다 — `BoardACLEntry`, `BoardACLSubjectType`과 하위 상수 4개, `ACLSubjectOption`, `ParseBoardACLFromProperties`, `EvaluateBoardACLEntries`, `HasOrgScopedACLEntries`, 파생 상수 6개, 키 상수 7개. 이 시점에 컴파일 에러가 나면 앞 단계에 누락이 있다는 신호다
- [X] T047 [P] `server/model/org_context.go`를 삭제한다
- [X] T048 [P] `server/model/board_permissions_test.go`에서 접근 권한 평가 테스트를 제거한다. capabilities 관련 테스트는 유지한다
- [X] T049 [P] `server/integrationtests/board_test.go`에서 `TestBoardListAndSearchIncludeDirectACLBoards`를 제거한다
- [X] T050 [P] `server/services/permissions/mmpermissions/mmpermissions_test.go`에서 접근 권한·조직 컨텍스트 테스트 케이스를 제거한다 — `TestResolveOrgContextForTeam_FullVisibilityFallback`, `TestResolveOrgContextForTeam_DBFirstProfile`, `TestHasPermissionToBoard` 안의 접근 권한 하위 케이스

### 스키마

- [X] T051 `server/services/store/sqlstore/migrate.go`의 `GetTemplateHelperFuncs`에 `dropIndexIfNeeded` 헬퍼를 추가한다. `genCreateIndexIfNeeded`와 대칭 구조로 작성하고 인덱스 이름은 동일하게 `getIndexName(tableName, columns)`으로 얻는다. 방언별 처리 — PostgreSQL·SQLite는 `DROP INDEX IF EXISTS`, MySQL은 `INFORMATION_SCHEMA.STATISTICS` 조회 + `PREPARE`/`EXECUTE` 패턴 ([research.md](research.md) R-002)
- [X] T052 `server/services/store/sqlstore/migrations/000048_drop_has_acl_entries_from_boards.up.sql`을 추가한다. 헬퍼만 호출한다 — `dropIndexIfNeeded "boards" "team_id, has_acl_entries"`, `dropColumnIfNeeded "boards" "has_acl_entries"`, `dropColumnIfNeeded "boards_history" "has_acl_entries"`
- [X] T053 [P] `server/services/store/sqlstore/migrations/000048_drop_has_acl_entries_from_boards.down.sql`을 `SELECT 1;` 한 줄로 작성한다 (FR-017, 원칙 VII)
- [X] T054 [P] `server/services/store/sqlstore/migrations/000047_add_has_acl_entries_to_boards.down.sql`을 `SELECT 1;` 한 줄로 교체한다 (FR-018). `.up.sql`은 이미 적용된 이력이므로 건드리지 않는다

**Checkpoint**: 접근 권한과 소유자 개념이 코드베이스에서 완전히 사라졌다

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: 완료 근거 수집. constitution 원칙 I에 따라 출력과 함께 제시한 뒤에만 완료를 선언한다.

- [X] T055 [P] 잔재 확인 (SC-006) — `grep -rin "acl\|orgunit\|position_code\|is_ceo\|has_acl_entries\|isowner\|board_owner\|transferboardownership" server/ webapp/src/`. `webapp/src/svg/error-illustration.tsx` 한 파일만 나와야 한다 (base64 이미지 데이터의 우연한 문자열)
- [X] T056 [P] 되돌리기 규약 검사 (SC-007) — `server/services/store/sqlstore/migrations/*.down.sql`을 `SELECT 1;`과 `diff -Bw`로 대조. T004에서 잡혔던 000047 위반이 해소되어야 한다
- [X] T057 [P] `make webapp-ci` 통과 확인
- [X] T058 [P] `make server-lint` 통과 확인. 조직 컨텍스트 코드 제거로 `dogsled`·`exhaustive`·`gocritic ifElseChain` 지적이 함께 사라져야 한다
- [X] T059 최종 델타 비교 (SC-005) — jest·tsc·server 세 축 모두 `comm -13`으로 신규 실패 0건 확인
- [ ] T060 `make deploy` 후 라우트 확인 — `/permissions/me`만 200이고 `/acl`·`/acl/entries`·`/org/units`·`/org/positions`·`/permissions/preview`·`/boards/{id}/owner`는 404. 응답에 `X-Boards-Debug-*` 헤더 없음
- [ ] T061 삭제 권한 시나리오 5건 검증 (SC-001~SC-003) — [quickstart.md](quickstart.md) 6단계 표. 보드 멤버가 **아닌** 팀 관리자의 삭제 시도 결과도 기록한다 (범위 밖이지만 후속 과제 판단 근거)
- [ ] T062 공유 화면 확인 (SC-004) — 접근 권한 영역·소유권 이전 영역 부재, 멤버 초대·역할 변경·링크 공유 정상, 이전 소유자 행에 역할 변경 메뉴 노출
- [ ] T063 MySQL 또는 PostgreSQL에서 마이그레이션 000048 적용 확인 — 컬럼·인덱스 제거, 기존 보드 데이터 손실 없음. SQLite 경로는 마이그레이션 000045의 기존 결함으로 도달 불가([research.md](research.md) R-004)
- [X] T064 보드 목록·검색 경로에 팀 전체 보드를 훑는 후보 조회가 남아 있지 않은지 확인 (SC-008) — `server/app/boards.go`의 목록·검색 함수가 확장 없이 원본을 반환하고, `server/services/store/sqlstore/board.go`에 팀 전체 조회 메서드가 없어야 한다. T037·T039·T040 완료로 자동 충족되며 코드 확인으로 판정한다

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: 의존 없음. 즉시 시작
- **Phase 2 (Foundational)**: 해당 작업 없음
- **Phase 3 (US1)**: Phase 1 이후. 다른 스토리에 의존하지 않음
- **Phase 4 (US2)**: Phase 1 이후. 다른 스토리에 의존하지 않음
- **Phase 5 (US3)**: Phase 1 이후. 코드 변경과 무관한 운영 조사
- **Phase 6 (서버 잔여 제거)**: Phase 4 완료 필수. T051~T054는 Phase 5 완료 필수
- **Phase 7 (Polish)**: Phase 3·4·6 완료 후

### User Story Dependencies

- **US1 (P1)**: 독립. 접근 권한 기능을 그대로 둔 채 완결·배포 가능
- **US2 (P2)**: 독립. 서버 변경 없이 완결·배포 가능
- **US3 (P3)**: 독립. 코드 변경이 아닌 운영 조사

### ⚠️ 파일 충돌 주의

`webapp/src/components/shareBoard/shareBoard.tsx`를 **T018(US1)과 T023(US2)이 함께 건드린다**. T018은 소유권 이전 UI를, T023은 접근 권한 섹션을 제거한다. 두 작업은 병렬 실행 불가이며 같은 사람이 순차로 처리하거나 한쪽 완료 후 다른 쪽을 시작해야 한다. 스토리 독립성은 유지되지만 파일 수준에서 직렬화가 필요하다.

`server/model/board_permissions.go`도 T005~T007(US1)과 T046(Phase 6)이 공유한다. Phase 순서상 자연히 직렬화된다.

### Parallel Opportunities

- Phase 1의 T001~T003은 완전 병렬
- Phase 3의 T013~T017은 서로 다른 파일이라 병렬. T018은 T014와 같은 컴포넌트 계열이지만 파일이 달라 병렬 가능
- Phase 3의 T019·T020은 서로 다른 테스트 파일이라 병렬
- Phase 4의 T024~T028은 완전 병렬 (T023 완료 후)
- Phase 6의 T038·T041·T045·T047~T050은 파일 삭제·독립 수정이라 병렬
- Phase 7의 T055~T058은 완전 병렬
- 인력이 있다면 US1·US2·US3을 세 사람이 동시에 진행할 수 있다. 단 위 파일 충돌 주의 참조

---

## Parallel Example: User Story 1

```bash
# 웹앱 파일 5개를 동시에 처리 (서로 다른 파일):
Task: "webapp/src/hooks/permissions.tsx에서 DeleteBoard 특례 제거"
Task: "webapp/src/components/shareBoard/userPermissionsRow.tsx에서 isOwner prop 제거"
Task: "webapp/src/components/shareBoard/userPermissionsRow.test.tsx에서 isOwner prop 전달 제거"
Task: "webapp/src/octoClient.ts에서 transferBoardOwnership 제거"
Task: "webapp/src/blocks/board.ts에서 isOwner 필드 제거"

# 테스트 기대값 복원 2건을 동시에:
Task: "mmpermissions_test.go의 board admin·elevated 케이스에 DeleteBoard 복원"
Task: "localpermissions_test.go의 admin 케이스에 DeleteBoard 복원"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 완료 — 기준선 확보
2. Phase 3 완료 — 소유자 제거 + 삭제 권한 복구
3. **정지 후 검증** — 보드 관리자·팀 관리자의 삭제가 되는지, 편집자는 거부되는지 확인
4. 배포 가능

MVP 시점에 접근 권한(ACL) 기능은 아직 살아 있다. 화면도 그대로다. 그럼에도 "생성자가 없으면 아무도 못 지우는 보드"라는 실제 운영 문제가 해소되므로 독립적 가치가 있다.

### Incremental Delivery

1. Phase 1 → 기준선 확보
2. Phase 3 (US1) → 검증 → 배포 (MVP)
3. Phase 4 (US2) → 검증 → 배포 — 화면에서 접근 권한 영역이 사라진다
4. Phase 5 (US3) → 영향 파악 및 조치 결정
5. Phase 6 → 서버 잔여 제거 + 스키마 정리 — 사용자에게 보이는 변화는 없고 접근 범위만 축소된다
6. Phase 7 → 완료 근거 수집

3번과 5번 사이에 4번을 반드시 넣는다. 순서를 바꾸면 영향 조사 수단을 잃는다.

### 커밋 전략

constitution 원칙 VIII에 따라 단계별로 커밋한다. 접두사는 제거 작업이므로 `refactor:`를 기본으로 하고, 마이그레이션·목 재생성은 `chore:`를 쓴다. 한 커밋이 한 Phase를 넘지 않게 유지한다.

---

## Notes

- [P] = 서로 다른 파일, 미완료 작업에 의존하지 않음
- 각 스토리는 독립적으로 완결·검증 가능하다. 단 위 "파일 충돌 주의" 참조
- 신규 테스트를 작성하지 않는다. 기존 테스트의 기대값 복원이 원칙 IV를 만족한다 ([research.md](research.md) R-005)
- T046에서 컴파일 에러가 나면 앞 단계에 누락이 있다는 뜻이다. 컴파일러가 누락 지점을 정확히 지목한다
- 완료 선언은 Phase 7의 출력을 근거로 제시한 뒤에만 한다 (constitution 원칙 I)
