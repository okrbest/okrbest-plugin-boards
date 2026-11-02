# Tasks: 뷰마다 권한 모드를 정한다 (관리자 · 공용 · 개인)

**Input**: Design documents from `/specs/022-view-permission/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: 포함한다 — constitution 원칙 IV(동작 변경 시 테스트 동반)가 요구하고, 구현은
superpowers `test-driven-development`를 따른다. 테스트 과제는 **실패 출력을 확인한 뒤에만**
완료로 표시한다. 첫 실행에서 통과하는 회귀 안전망 테스트는 기본값을 잠시 뒤집어 실패를
본 뒤 되돌린다.

**Organization**: user story 단위로 묶어 각 스토리를 독립적으로 구현·검증할 수 있게 한다.
순서는 의존 관계를 따라 US1 → US2 → US4 → US3 → US5 → US6이다. US4(전환 규칙 · 권한
메뉴)가 US3(개인 뷰)보다 앞에 오는 이유는 "개인으로 바꾸는" 조작 자체가 US4의 메뉴와
서버 2단계 판정에 있기 때문이다.

**분석 반영 (2026-11-02 `/speckit-analyze`)**: C1(뷰 fallback 신설 → T026 · T033), A1(칸반
열 잠금 → T038 · T042), U1(거절 문구 → T052 확정), U2 · U3(문구 확정), K1(라이선스 헤더 규칙).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 병렬 실행 가능 (다른 파일, 미완료 과제에 의존하지 않음)
- **[Story]**: 소속 user story (US1~US6, spec.md 순번)

## Path Conventions

단일 저장소 플러그인. 경로는 저장소 루트 기준이다. 서버는 `server/`(model → app → api →
ws → store), webapp은 `webapp/src/`. 계약 케이스 ID(G · F · A · W · U)는 `contracts/`의 표를
가리킨다.

## 테스트는 선택이 아니다

- Go: 같은 패키지 colocated `_test.go`. App 테스트는 `SetupTestHelper`(mock store +
  mmpermissions mock API)를, API 테스트는 `setupAPITestHelper`(`th.Permissions` fake +
  `th.callHandler`)를 쓴다. 관리자 권한 부여 방법은 009의
  `server/app/property_access_enforcement_test.go`와 `server/api/blocks_test.go`에 있는
  헬퍼를 재사용한다.
- webapp: Jest + RTL, colocated `*.test.tsx`/`*.test.ts`. `wrapIntl` · `mockStateStore` ·
  `TestBlockFactory` 패턴을 따른다.
- 테스트를 약화·스킵·삭제해서 통과시키지 않는다.
- **새로 만드는 모든 파일(Go · TS · SCSS)은 기존 파일과 같은 Mattermost 라이선스 헤더로
  시작한다**(원칙 VI). Go는 `make check-style`이 잡지만 TS는 게이트가 없으므로 직접 확인한다.

---

## Phase 1: Setup

**Purpose**: 회귀 판정 기준을 먼저 고정한다. 이 저장소는 깨끗한 상태에서도 실패가 있으므로
(server 7~8건, webapp 다수) 개수가 아니라 실패 목록 diff로 판정한다 (R12).

- [X] T001 변경 전 기준선 확보 — `make server-test` 실패 목록, `webapp/`에서 `npm run test` 실패 스위트 목록, `npm run check-types` 오류 수, `npm run check` 실패 목록을 `specs/022-view-permission/baseline.md`에 기록한다 (quickstart.md 「사전 준비」의 명령 사용). `server-test-baseline`·`webapp-test-baseline` 메모와 대조해 기준선이 달라졌으면 그 차이도 적는다

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 여섯 스토리가 공유하는 모드 읽기 규칙(Go/TS 쌍), 쓰기 관문의 뼈대와 여섯
경로 연결, webapp 훅. 이 phase가 끝나야 user story 작업을 시작할 수 있다.

- [X] T002 [P] `server/model/view_access_test.go`에 실패 테스트를 먼저 쓴다 — `ViewAccessModeOf`: Fields nil · 키 없음 · `"everyone"` · `"admin"` · `"private"` · 모르는 문자열 · 문자열 아닌 값 → 각각 everyone · everyone · everyone · admin · private · everyone · everyone. `ViewHiddenFrom`: 뷰 아님 → false, private + createdBy 같음 → false, private + 다름 → true, admin → false. `IsCardOrderOnlyPatch`: `{cardOrder}`만 → true, `{cardOrder, sortOptions}` → false, title 동반 → false, deletedFields 동반 → false, 빈 patch → false. **실패 출력을 확인한다**
- [X] T003 [P] `webapp/src/viewAccess.test.ts`에 실패 테스트를 먼저 쓴다 — `viewAccessMode` 7케이스(T002와 동일 표), `isViewHiddenFrom`, `viewConfigLocked`, `accessModeTargets` 조합 표(data-model.md 「webapp이 보여 줄 항목」: canTouch 거짓이면 빈 배열, isAdmin이면 admin 포함, isCreator && !isLastShared이면 private 포함). **실패 출력을 확인한다**
- [X] T004 [P] `server/model/view_access.go`를 구현한다 — `type ViewAccessMode string`, 상수 `ViewAccessEveryone/Admin/Private`, `ViewAccessModeKey = "accessMode"`, `ViewAccessModeOf(block *Block) ViewAccessMode`, `ViewHiddenFrom(block *Block, userID string) bool`, `IsCardOrderOnlyPatch(patch *BlockPatch) bool`, `type PrivateViewSummary struct{ID, Title, CreatedBy string; CreateAt int64}`(json 태그 소문자). T002 통과까지 (depends on T002)
- [X] T005 [P] `webapp/src/viewAccess.ts`를 구현하고 `webapp/src/blocks/boardView.ts`의 `BoardViewFields`에 `accessMode?: ViewAccessMode`를 더하며 `createBoardView`가 값을 복사하게 한다 — `viewAccessMode(view)`, `isViewHiddenFrom(view, userId)`, `viewConfigLocked({mode, isAdmin})`, `accessModeTargets({mode, isAdmin, isCreator, isLastShared})`. `PrivateViewSummary` 타입도 여기 둔다. `webapp/src/blocks/boardView.test.ts`(없으면 신설)에 "`createBoardView`가 `accessMode`를 보존한다" 한 줄. T003 통과까지 (depends on T003)
- [X] T006 `server/app/view_access.go`에 관문 뼈대를 만들고 여섯 경로에 건다 — `type viewWriteOp int`(patch · delete · duplicate · undelete · upsert), `func (a *App) requireViewWritePermission(userID string, stored *model.Block, patch *model.BlockPatch, board *model.Board, op viewWriteOp) error`(이 단계에서는 `stored.Type != model.TypeView`면 nil, 뷰면 아직 nil), `isBoardAdmin(userID, boardID)`(ManageBoardRoles), `isLastSharedView(boardID, viewID)`(`a.store.GetBlocksWithType(boardID, model.TypeView)`에서 deleteAt==0 && mode != private 수가 1이고 그것이 대상). `server/app/blocks.go`의 `PatchBlockAndNotify`(requireCardEditPermission 뒤) · `PatchBlocksAndNotify`(블록 루프 안) · `DeleteBlockAndNotify` · `DuplicateBlock`(requireDuplicatePermission 뒤, 원본 블록 조회 필요) · `UndeleteBlock`(히스토리 블록 기준, `store.UndeleteBlock` 전) · `InsertBlocksAndNotify`(store에 같은 ID 뷰가 있으면 upsert op)에 호출을 추가한다. 기존 테스트가 기준선대로 통과하는지 `go test ./server/app/...`로 확인한다 (depends on T004)
- [X] T007 [P] `webapp/src/hooks/viewAccess.ts`에 `useViewAccess(view: BoardView, sharedViewCount: number)` 훅을 만든다 — `getMe` · `useHasCapabilities(boardId, ['canManageBoard'])` · `useHasCurrentBoardPermissions([ManageBoardProperties])`를 읽어 `{mode, isAdmin, isCreator, locked, targets, canChange}`를 돌려준다(data-model.md 「webapp 훅 출력」). 순수 계산은 T005의 함수에 위임한다 (depends on T005)

**Checkpoint**: 모델 테스트 양쪽 통과, 관문이 여섯 경로에 걸려 있되 아직 아무것도 거절하지 않음

---

## Phase 3: User Story 1 - 관리자가 뷰를 잠근다 (Priority: P1) 🎯 MVP

**Goal**: 관리자 모드인 뷰의 구성 변경·이름 변경·삭제를 관리자만 할 수 있게 서버가
거절한다. 카드 순서 변경과 복제는 편집 권한자에게 열어 두고, 복제 사본은 공용이 된다
(FR-005~FR-009, FR-017, FR-026 서버 쪽).

**Independent Test**: 직접 API로 뷰에 `accessMode: admin`을 넣은 뒤(관리자 세션) 팀원
세션으로 필터 patch → 403, `cardOrder`만 patch → 200, 복제 → 200이고 사본에 accessMode
없음 (quickstart 시나리오 1의 6~8번).

### Tests for User Story 1

- [X] T008 [P] [US1] `server/app/view_access_test.go`에 실패 테스트를 쓴다 — G-03(editor patch filter 403), G-04(editor patch title 403), G-05(editor delete 403), G-06(editor `{cardOrder}`만 200), G-07(editor `{cardOrder, sortOptions}` 403), G-08(admin patch/delete 200), G-13(editor duplicate 200 + 사본 뷰의 accessMode 제거 patch가 store에 요청됨), G-22(카드 블록은 관문 무관). 보드 fixture는 카드 접근 규칙이 꺼진 보드로 둔다. **실패 출력을 확인한다**
- [X] T009 [P] [US1] `server/api/blocks_test.go`에 실패 테스트를 쓴다 — `handlePatchBlock`: 관리자 뷰에 editor가 sortOptions patch → 403, cardOrder만 → 200. `th.Permissions`로 editor/admin을 나눈다. **실패 출력을 확인한다**

### Implementation for User Story 1

- [X] T010 [US1] `server/app/view_access.go`의 관문에 1단계 admin 규칙을 넣는다 — `mode == admin`이면 `isBoardAdmin || (op == patch && model.IsCardOrderOnlyPatch(patch)) || op == duplicate`가 아니면 `model.NewErrPermission("access denied to modify an admin-only view")`. everyone 모드는 통과. T008의 해당 케이스가 통과할 때까지 (depends on T008)
- [X] T011 [US1] `server/app/blocks.go`의 `DuplicateBlock`을 고친다 — 원본이 뷰면 복사 뒤 사본 뷰 블록마다 `a.store.PatchBlock(copy.ID, &model.BlockPatch{DeletedFields: []string{model.ViewAccessModeKey}}, userID)`를 적용하고 반환 블록의 Fields에서도 키를 지워 돌려준다(R11, FR-026). 방송은 지운 뒤의 블록으로 나간다. T008 G-13 · T009 통과까지 (depends on T010)

**Checkpoint**: 관리자 모드 잠금이 서버에서 동작. API로 모드를 넣어 검증 가능 (MVP)

---

## Phase 4: User Story 2 - 모드를 정한 적 없는 뷰는 달라지지 않는다 (Priority: P1)

**Goal**: 값이 없거나 모르는 값인 뷰는 공용으로 읽혀 지금 동작 그대로다 (FR-002~FR-004,
SC-003). 이 phase는 안전망 테스트다.

**Independent Test**: 모드를 고른 적 없는 뷰에서 editor의 patch·delete가 200이고, 모르는
값이 저장된 뷰도 같다. webapp에서 메뉴가 모두 활성이고 새 뷰에 accessMode가 없다.

### Tests for User Story 2

- [X] T012 [P] [US2] `server/app/view_access_test.go`에 안전망 테스트를 쓴다 — G-01(값 없음, editor patch 200), G-02(값 없음, editor delete 200), G-21(값 `"locked"`, editor patch 200). 이 테스트는 첫 실행에서 통과한다. **`model.ViewAccessModeOf`의 기본 반환을 잠시 `ViewAccessAdmin`으로 바꿔 세 케이스가 실패하는 것을 본 뒤 되돌린다**(constitution 원칙 IV)
- [X] T013 [P] [US2] `webapp/src/components/viewHeader/viewHeader.test.tsx`와 `viewTabs.test.tsx`에 안전망 테스트를 쓴다 — accessMode 없는 뷰에서 editor(비관리자)에게 속성·그룹화·필터·정렬 버튼이 활성이고, 탭 메뉴에 이름 바꾸기·복제·삭제가 모두 있으며, `handleAddView`가 넘기는 새 뷰에 `accessMode` 키가 없다. 같은 방식으로 `viewAccessMode`의 기본값을 뒤집어 실패를 확인한 뒤 되돌린다

**Checkpoint**: 기본값 회귀가 테스트로 고정됨

---

## Phase 5: User Story 4 - 권한 메뉴는 고를 수 있는 것만 보여 준다 (Priority: P2)

**Goal**: 모드 전환 규칙(현재 모드를 건드릴 권한 + 목표 모드를 고를 권한)과 마지막 비개인
뷰 보호를 서버가 강제하고, webapp 뷰 헤더에 권한 메뉴가 붙는다 (FR-015, FR-016,
FR-019~FR-021).

**Independent Test**: 같은 뷰의 권한 메뉴를 관리자 · 만든 사람 · 일반 팀원으로 열어
항목이 다르게 보이고, 직접 API로 보낸 전환 요청이 같은 규칙으로 403/400을 받는다
(quickstart 시나리오 4).

### Tests for User Story 4

- [X] T014 [P] [US4] `server/app/view_access_test.go`에 실패 테스트를 쓴다 — G-09(editor가 admin→everyone 403), G-10(비관리자 everyone→admin 403), G-11(admin everyone→admin 200), G-12(만든 사람 아닌 editor everyone→private 403), G-14(만든 사람 everyone→private 200), G-15(마지막 비개인 뷰 →private 400, `GetBlocksWithType` mock이 비개인 뷰 1개 반환), G-16(마지막 비개인 뷰 delete 400), G-20(만든 사람이자 admin: private→admin 200). `deletedFields: ["accessMode"]`는 everyone으로 읽힌다는 케이스도 하나. upsert(P6): 기존 ID의 everyone 뷰를 editor가 `accessMode: admin`으로 다시 넣기 → 403, 새 ID의 뷰를 `accessMode: admin`으로 넣기 → 비관리자 403 · 관리자 200. **실패 출력을 확인한다**
- [X] T015 [P] [US4] `webapp/src/components/viewHeader/viewHeaderAccessMenu.test.tsx`에 실패 테스트를 쓴다 — W-03(비관리자 · 공용 · 만든 사람 아님: 버튼 비활성, title에 안내), W-04(관리자 · 공용: 공용 · 관리자 항목, 개인 없음), W-05(만든 사람 · 공용 · 비개인 뷰 2: 공용 · 개인), W-06(만든 사람 · 비개인 뷰 1: 개인 없음), W-07(항목 클릭 → `mutator.changeViewAccessMode(boardId, viewId, 'everyone', 'admin')`), 현재 모드에 체크 아이콘. **실패 출력을 확인한다**

### Implementation for User Story 4

- [X] T016 [US4] `server/app/view_access.go`에 2단계·3단계를 넣는다 — op == patch이고 patch가 `accessMode`를 바꾸면 `after := model.ViewAccessModeOf(projectPatch(stored, patch))`로 목표 모드를 읽어 admin이면 `isBoardAdmin`, private이면 `stored.CreatedBy == userID`를 요구하고, private이면서 `isLastSharedView`면 `model.NewErrBadRequest("the board must keep at least one shared view")`. op == delete이고 `mode != private`이면서 `isLastSharedView`면 같은 400. upsert는 들어오는 블록의 모드를 `after`로 본다(`InsertBlocksAndNotify`에서 관문에 넘길 때 `patch`를 `&model.BlockPatch{UpdatedFields: incoming.Fields}`로 합성하거나 전용 인자를 둔다 — 빌더 선택). 새 ID 뷰가 admin이면 `isBoardAdmin` 요구. T014 통과까지 (depends on T014)
- [X] T017 [P] [US4] `webapp/src/mutator.ts`에 `changeViewAccessMode(boardId, viewId, oldMode, newMode)`를 더한다 — `changeViewSortOptions`(1115행)와 같은 모양: 낙관적 `updateView` → `octoClient.patchBlock(boardId, viewId, {updatedFields: {accessMode: newMode}})` → 실패 시 이전 뷰로 복구, undo는 oldMode로 patch. `everyone`도 명시 값으로 쓴다(없음과 동치)
- [X] T018 [US4] `webapp/src/components/viewHeader/viewHeaderAccessMenu.tsx`를 만든다 — props `{activeView, sharedViewCount, readonly}`. `useViewAccess`로 `{mode, targets, canChange}`를 얻고 `MenuWrapper usePortal menuPosition='bottom' disabled={!canChange}` + `Button disabled title={!canChange ? intl(ViewHeader.access-cannot-change) : undefined}`(라벨 = 현재 모드 이름) + `Menu`에 targets만 `Menu.Text`로 렌더(현재 모드에 `CheckIcon` rightIcon). 클릭 → `mutator.changeViewAccessMode`. `React.memo` export. T015 통과까지 (depends on T015, T017, T007)
- [X] T019 [US4] `webapp/src/components/viewHeader/viewHeader.tsx`에 메뉴를 장착한다 — 정렬 메뉴(`ViewHeaderSortMenu`) 바로 뒤에 `<ViewHeaderAccessMenu activeView={activeView} sharedViewCount={sharedViewCount} readonly={props.readonly}/>`. `sharedViewCount`는 `views`(이미 셀렉터가 남의 개인 뷰를 걸러 준 목록) 중 `viewAccessMode(v) !== 'private'`인 수. `props.readonly`(공유 링크)면 렌더하지 않는다. `viewHeader.test.tsx`에 버튼이 렌더되는지 한 줄 추가 (depends on T018)
- [X] T020 [US4] `webapp/i18n/en.json`·`webapp/i18n/ko.json`에 키를 손으로 추가한다 — `ViewHeader.access`, `ViewHeader.access-everyone`, `ViewHeader.access-admin`, `ViewHeader.access-private`, `ViewHeader.access-cannot-change` (contracts/ui-surfaces.md 표의 문구). ICU 곧은따옴표 주의

**Checkpoint**: 화면에서 모드를 바꿀 수 있고, 서버가 전환 규칙과 마지막 뷰 보호를 강제함

---

## Phase 6: User Story 3 - 뷰를 만든 사람이 개인 뷰로 돌린다 (Priority: P2)

**Goal**: 개인 뷰는 만든 사람 외에는 서버가 조회·방송에서 걸러 내고 쓰기도 거절한다.
공용→개인 전환 때 다른 사용자에게 ID만 담은 삭제 이벤트가 간다. 보드 복제는 남의 개인
뷰를 뺀다. 보이지 않는 뷰 주소는 첫 번째 보이는 뷰로 보낸다 (FR-010~FR-014, FR-027,
FR-028).

**Independent Test**: B가 자기 뷰를 개인으로 바꾸면 A·C의 탭에서 새로고침 없이 사라지고
(보고 있던 사용자는 첫 뷰로 이동), C의 `?all=true` · `?block_id=` 조회에 없으며, C의
patch·delete·duplicate·undelete가 403이고, C가 주소로 직접 들어가도 첫 뷰로 떨어진다
(quickstart 시나리오 3).

### Tests for User Story 3

- [X] T021 [P] [US3] `server/app/view_access_test.go`에 실패 테스트를 쓴다 — 관문: G-17(만든 사람 patch/delete 200), G-18(다른 editor의 patch · delete · duplicate · undelete · upsert 모두 403), G-19(만든 사람 아닌 admin도 403). 필터: F-01(`FilterBlocksForUser`가 남의 개인 뷰만 빼고 카드는 둔다), F-03(만든 사람은 그대로), F-04(관리자도 빠짐), F-05(카드 접근 규칙이 꺼진 보드에서도 빠짐 — settings 없는 보드 fixture), F-06(`FilterBlockRecipients`가 private 뷰 블록에 대해 userIDs ∩ {createdBy}를 돌려줌; 카드 규칙 꺼진 보드에서도), F-14(카드 블록은 기존 009 케이스 그대로), F-11(`blocksForArchive(boardID, userID)` 결과에 남의 개인 뷰 없음). **실패 출력을 확인한다**
- [X] T022 [P] [US3] `server/ws/plugin_adapter_test.go`(또는 `board_fanout_test.go`의 헬퍼를 쓰는 새 테스트 함수)에 실패 테스트를 쓴다 — `BroadcastBlockDeleteExcept(team, blockID, boardID, "creator")`가 보드 구독자 중 `"creator"`를 뺀 사용자에게만 ID·BoardID·DeleteAt만 담은 블록을 보내고, 클러스터로 나가는 `ClusterMessage.ExcludeUsers`에 `"creator"`가 실리며, 클러스터 수신(`HandleClusterEvent`) 재진입에서도 같은 제외가 적용된다. **실패 출력을 확인한다**
- [X] T023 [P] [US3] `server/services/store/storetests/boards_and_blocks.go`에 `testDuplicateBoardPrivateViews`를 독립 케이스로 둔다(기존 `testDuplicateBoard` fixture는 이 포크의 블록 ID 검증에 걸려 그 안에 넣으면 실행되지 않는다). sqlite는 json1 태그 없이는 SKIP, 태그를 줘도 기준선 마이그레이션에서 깨지므로 **Postgres 전용 DB**(`focalboard_store_test`, `test_system_settings`에 `DeletedMembershipBoardsMigrationComplete`·`CategoryUuidIdMigrationComplete`를 미리 표시)로 돌렸다. 저장소 헬퍼 `SetupTests`에 플러그인 서비스 API 스텁(`storeTestServicesAPI`)을 주입해야 보드 생성 경로가 nil 참조로 패닉하지 않는다. 증거(2026-11-02, `.env` 자격증명): 필터 있음 PASS → `ViewHiddenFrom` 조건 제거 FAIL(사본에 `alice private: private` 포함) → 복구 PASS. 명령: `FOCALBOARD_STORE_TEST_DB_TYPE=postgres FOCALBOARD_STORE_TEST_CONN_STRING=<전용 DB DSN> go test -tags json1 ./server/services/store/sqlstore/ -run 'TestSQLStore/BoardsAndBlocksStore/duplicateBoardPrivateViews'`
- [X] T024 [P] [US3] `webapp/src/store/views.test.ts`를 새로 만들어 실패 테스트를 쓴다 — W-13: 스토어에 A의 개인 뷰와 공용 뷰가 있고 `users.me.id === 'B'`면 `getCurrentBoardViews` · `getViewsByBoard` · `getSortedViews` 결과에 A의 개인 뷰가 없고, me가 A면 있다. `me`가 null이면 거르지 않는다. **실패 출력을 확인한다**
- [X] T025 [P] [US3] `server/api/blocks_test.go`에 실패 테스트를 쓴다 — F-01(`handleGetBlocks ?all=true`에 남의 개인 뷰 없음), F-02(`?block_id=<개인 뷰>` → `[]`), G-18 중 `handlePatchBlock` · `handleDeleteBlock` → 403. 카드 접근 규칙이 꺼진 보드로. **실패 출력을 확인한다**
- [X] T026 [P] [US3] `webapp/src/pages/boardPage/teamToBoardAndViewRedirect.test.tsx`를 새로 만들어 실패 테스트를 쓴다 — W-18: (a) `params.viewId`가 `boardViews`에 없고 `boardViews`가 비어 있지 않으면 `navigate(<boardViews[0].id 경로>, {replace: true})`와 `UserSettings.setLastViewId` 호출, (b) `params.viewId` 없음 + `lastViewId`가 목록에 없는 뷰 → 첫 뷰로, (c) `params.viewId`가 목록에 있으면 navigate 호출 없음, (d) `boardViews`가 아직 비어 있으면(로딩 중) 아무것도 하지 않음. `useNavigate` · `useParams`를 jest.mock하고 `mockStateStore`로 views를 넣는다. **실패 출력을 확인한다**

### Implementation for User Story 3

- [X] T027 [US3] `server/app/view_access.go` 관문에 1단계 private 규칙을 넣는다 — `mode == private`이면 `stored.CreatedBy == userID`가 아니면 `model.NewErrPermission("access denied to another user's private view")` (op 무관). T021 관문 케이스 통과까지 (depends on T021)
- [X] T028 [US3] 필터 두 앞단을 구현한다 — `server/app/blocks.go` `FilterBlocksForUser`: 보드를 읽은 직후 `model.ViewHiddenFrom(block, userID)`인 블록을 제거한 뒤 기존 evaluator 로직으로 넘긴다(evaluator가 Enforces하지 않아도 제거는 유지). `server/app/property_access.go` `FilterBlockRecipients`: 보드를 읽은 직후 `block.Type == view && mode == private`이면 `userIDs` 중 `block.CreatedBy`와 같은 것만 돌려준다(settings 조기 반환보다 앞). T021 필터 케이스 통과까지 (depends on T021)
- [X] T029 [US3] ws 어댑터에 제외 대상 방송을 더한다 — `server/ws/adapter.go` `Adapter`에 `BroadcastBlockDeleteExcept(teamID, blockID, boardID string, exceptUserIDs ...string)`; `server/ws/plugin_adapter_cluster.go` `ClusterMessage`에 `ExcludeUsers []string`과 수신 시 적용; `server/ws/plugin_adapter.go`에 구현(ID·BoardID·UpdateAt·DeleteAt만 담은 블록, `getUserIDsForTeamAndBoard` 결과에서 `exceptUserIDs` 제거, 클러스터 메시지에 `ExcludeUsers` 실음); `server/ws/server.go`의 standalone `Server`에도 같은 시그니처 구현(기존 `BroadcastBlockDelete` 옆, 493행). `Adapter` mock이 있으면 `make generate`. T022 통과까지 (depends on T022)
- [X] T030 [US3] `server/app/blocks.go`의 `PatchBlockAndNotify` · `PatchBlocksAndNotify`에 전환 방송을 더한다 — 뷰 블록이고 patch 전 `mode != private`, 후 `mode == private`이면 `BroadcastBlockChange` 직후 `a.wsAdapter.BroadcastBlockDeleteExcept(board.TeamID, block.ID, block.BoardID, block.CreatedBy)`를 같은 `blockChangeNotifier.Enqueue` 안에서 호출한다(F-07). 판정은 `oldBlock`과 patch 후 재조회한 `block`으로 한다 (depends on T029)
- [X] T031 [US3] `server/services/store/sqlstore/boards_and_blocks.go` `duplicateBoard`의 블록 루프에서 `b.Type != model.TypeComment && !model.ViewHiddenFrom(b, userID)`인 것만 남긴다(F3 · R8). T023 통과까지 (depends on T023)
- [X] T032 [US3] `webapp/src/store/views.ts`의 `getCurrentBoardViews` · `getViewsByBoard` · `getSortedViews`에 `(state) => state.users.me` 입력을 더하고 `isViewHiddenFrom(view, me?.id)`로 거른다(me가 null이면 통과). `getView(viewId)`는 그대로 둔다. T024 통과까지 (depends on T024)
- [X] T033 [US3] `webapp/src/pages/boardPage/teamToBoardAndViewRedirect.tsx`에 fallback 분기를 더한다(R10b, U-14) — 기존 `(!viewID || viewID === '0')` 분기 뒤에: `boardId === params.boardId && boardViews.length > 0 && viewID && !boardViews.some(v => v.id === viewID)`이면 lastViewId가 목록에 있으면 그것으로, 아니면 `boardViews[0].id`로 `setLastViewId` · `setCurrentView` · `navigate(replace)`. 기존 분기 안의 lastViewId도 목록에 있는지 확인한 뒤 쓴다. `boardViews`는 T032의 걸러진 셀렉터라 개인 뷰는 목록에 없다. T026 통과까지 (depends on T026, T032)
- [X] T034 [US3] T025의 API 테스트가 통과하는지 확인하고, `server/app` · `server/api` · `server/ws` 패키지 테스트를 돌려 기준선 밖 실패가 없는지 본다 (depends on T027~T033)

**Checkpoint**: 개인 뷰가 다른 사용자에게 도달하지 않고, 전환이 실시간으로 반영되며, 보이지 않는 뷰 주소는 첫 뷰로 떨어짐

---

## Phase 7: User Story 5 - 잠긴 뷰에서는 잠긴 조작이 화면에서 비활성이다 (Priority: P3)

**Goal**: 관리자 모드인 뷰를 보는 비관리자에게 구성 메뉴가 비활성 + 안내 문구, 탭 메뉴에
이름 변경·삭제 없음, 기본 템플릿 지정 비활성, 칸반 열 끌기·숨기기 막힘. 뷰 복제 사본은
공용, 삭제 가능 여부는 비개인 뷰 수로 (FR-022, FR-026, FR-016 webapp 쪽).

**Independent Test**: 관리자 모드 뷰를 팀원으로 열면 메뉴가 비활성이고 "이 뷰는 관리자만
수정할 수 있습니다" 툴팁이 있으며, 칸반 열을 끌 수 없고, 관리자로 열면 모두 활성
(quickstart 시나리오 1의 2~5번).

### Tests for User Story 5

- [X] T035 [P] [US5] `webapp/src/components/viewHeader/viewHeader.test.tsx`에 실패 테스트를 쓴다 — W-08(비관리자 · admin 뷰: 속성 · 그룹화 · 필터 · 정렬 버튼 `disabled`, `title`이 admin-only-view 문구), W-09(관리자 · admin 뷰: 모두 활성). 상태의 `myBoardMemberships[board.id].schemeAdmin`으로 관리자 여부를 나눈다. **실패 출력을 확인한다**
- [X] T036 [P] [US5] `webapp/src/components/viewHeader/viewTabs.test.tsx`에 실패 테스트를 쓴다 — W-10(비관리자 · admin 뷰 탭 메뉴: 이름 바꾸기 · 뷰 삭제 없음, 뷰 복제 있음), W-11(공용 1 + 내 개인 1: 공용 뷰 탭 메뉴에 삭제 없음; 개인 뷰 탭 메뉴에는 삭제 있음), W-12(복제가 `mutator.insertBlock`에 넘기는 뷰에 `accessMode` 키 없음 — 원본이 admin이어도). **실패 출력을 확인한다**
- [X] T037 [P] [US5] `webapp/src/components/viewHeader/emptyCardButton.test.tsx`와 `newCardButtonTemplateItem.test.tsx`에 실패 테스트를 쓴다 — 현재 뷰가 admin이고 비관리자면 "기본으로 지정" `Menu.Text`가 `disabled`(클래스 `menu-option--disabled`), 관리자면 활성. **실패 출력을 확인한다**
- [X] T038 [P] [US5] `webapp/src/components/kanban/kanbanColumnHeader.test.tsx`와 `kanban.test.tsx`에 실패 테스트를 쓴다 — W-17: 비관리자 · admin 뷰에서 열 헤더가 `draggable`이 아니고 옵션 메뉴에 "숨기기"가 없으며(열 이름 · 색 · 삭제는 010 판정대로 그대로), 숨긴 열 영역의 "보이기" 조작이 없다. 관리자면 모두 있다. **실패 출력을 확인한다**

### Implementation for User Story 5

- [X] T039 [US5] `webapp/src/components/viewHeader/viewHeader.tsx`를 고친다 — `useViewAccess(activeView, sharedViewCount)`의 `locked`를 읽어 `canManageViewOptions = (canEditBoardProperties || canManageBoard) && !locked`, `noPermissionMessage`는 `locked`면 `ViewHeader.admin-only-view`, 아니면 기존 키. T035 통과까지 (depends on T035, T007)
- [X] T040 [US5] `webapp/src/components/viewHeader/viewTabs.tsx` · `viewTabMenu.tsx`를 고친다 — `ViewTabMenu`에 `canRename: boolean` prop 추가(false면 항목 숨김), `viewTabs`에서 `locked`면 `canRename={false} canDelete={false}`, 아니면 `canDelete={mode === 'private' || sharedViewCount > 1}`(개인 뷰는 보호 대상 아님). `handleDuplicate`에서 `delete newView.fields.accessMode`. `handleDelete`의 `nextView`는 걸러진 `views`에서 고른다. T036 통과까지 (depends on T036)
- [X] T041 [US5] `webapp/src/components/viewHeader/emptyCardButton.tsx` · `newCardButtonTemplateItem.tsx`에서 `useViewAccess(currentView, 1).locked`면 "기본으로 지정" `Menu.Text`를 `disabled`로 렌더한다(`widgets/menu/textOption.tsx`가 `disabled` prop을 지원한다 — 실측 완료). T037 통과까지 (depends on T037)
- [X] T042 [US5] `webapp/src/components/kanban/kanbanColumnHeader.tsx` · `kanban.tsx`에 `locked`를 반영한다 — 두 컴포넌트에서 `useViewAccess(activeView, 1).locked`를 읽어(또는 kanban.tsx가 계산해 prop으로 내려), 열 헤더 `draggable={!props.readonly && canEditProperties && !locked}`, 옵션 메뉴의 "숨기기" `Menu.Text`는 `!locked`일 때만 렌더(이름 · 색 · 삭제의 `canEditOption` 조건은 건드리지 않는다), kanban.tsx의 숨긴 열 "보이기" 조작과 `onDropToColumn`의 열 순서 변경 분기는 `locked`면 동작하지 않게 한다. T038 통과까지 (depends on T038, T007)
- [X] T043 [US5] `webapp/i18n/en.json`·`ko.json`에 `ViewHeader.admin-only-view`를 손으로 추가한다

**Checkpoint**: 팀원 화면이 서버 판정과 같은 답을 보여 줌

---

## Phase 8: User Story 6 - 관리자가 개인 뷰 목록을 보고 정리한다 (Priority: P3)

**Goal**: 공유 위젯 관리자 영역에 개인 뷰 목록(이름 · 만든 사람 · 날짜 · 삭제)이 있고,
전용 엔드포인트 둘이 관리자 권한만 요구한다 (FR-023~FR-025).

**Independent Test**: B의 개인 뷰가 있는 보드에서 A가 공유 위젯을 열면 목록에 보이고
삭제하면 B의 탭에서도 사라지며, B에게는 섹션이 없고 직접 호출은 403 (quickstart 시나리오 6).

### Tests for User Story 6

- [X] T044 [P] [US6] `server/api/views_test.go`를 새로 만들어 실패 테스트를 쓴다 — A-01(admin GET: 개인 뷰만, `fields` 없음, title 정렬), A-02(editor GET 403), A-03(빈 배열), A-04(admin DELETE 개인 뷰 200, `store.DeleteBlock` 호출), A-05(editor DELETE 403), A-06(공용 뷰 DELETE 404), A-07(다른 보드의 뷰 404). `th.callHandler`에 `{"boardID", "viewID"}` vars. **실패 출력을 확인한다**
- [X] T045 [P] [US6] `server/app/view_access_test.go`에 실패 테스트를 쓴다 — `GetPrivateViewsForBoard`가 `GetBlocksWithType` 결과에서 deleteAt==0 && private만 요약으로 돌려주고, `DeletePrivateViewAsAdmin`이 공용 뷰 · 다른 보드 뷰에 NotFound를 돌려주며 개인 뷰는 관문 없이 지우고 `deletedBlockMessage`로 방송한다. **실패 출력을 확인한다**
- [X] T046 [P] [US6] `webapp/src/components/shareBoard/privateViewsSection.test.tsx`를 새로 만들어 실패 테스트를 쓴다 — W-14(관리자: `octoClient.getPrivateViews` mock 결과가 이름 · 만든 사람 표시 이름(`getUsersList` mock) · 날짜로 렌더되고, 삭제 클릭 → `ConfirmationDialogBox` → 확인 → `octoClient.deletePrivateView(boardId, viewId)` 호출 후 목록에서 제거), W-15(비관리자: 렌더 없음), W-16(빈 목록: 빈 상태 문구). **실패 출력을 확인한다**

### Implementation for User Story 6

- [X] T047 [US6] `server/app/view_access.go`에 `GetPrivateViewsForBoard(boardID string) ([]*model.PrivateViewSummary, error)`와 `DeletePrivateViewAsAdmin(boardID, viewID, userID string) error`를 구현하고, `server/app/blocks.go`의 `DeleteBlockAndNotify`를 "조회 + 관문 + `deleteBlockUnchecked(block, board, modifiedBy, disableNotify)`"로 나눠 `DeletePrivateViewAsAdmin`이 `deleteBlockUnchecked`를 부르게 한다. T045 통과까지 (depends on T045, T027)
- [X] T048 [US6] `server/api/views.go`를 만들고 `server/api/api.go` `RegisterRoutes`에 `a.registerViewsRoutes(r)`를 등록한다 — `GET /boards/{boardID}/views/private`, `DELETE /boards/{boardID}/views/private/{viewID}`, 둘 다 `sessionRequired` + `HasPermissionToBoard(userID, boardID, ManageBoardRoles)` 아니면 `NewErrPermission`. 보드 존재 확인 후 App 호출. audit 레코드 `getPrivateViews` · `deletePrivateView`. T044 통과까지 (depends on T047)
- [X] T049 [P] [US6] `webapp/src/octoClient.ts`에 `getPrivateViews(boardId): Promise<PrivateViewSummary[]>`(200 아니면 `[]`)와 `deletePrivateView(boardId, viewId): Promise<Response>`를 더한다(`getOrgUnits` · `deleteBlock` 패턴)
- [X] T050 [US6] `webapp/src/components/shareBoard/privateViewsSection.tsx`를 만들고 `shareBoard.tsx`의 `<AdminOnlyPropertiesSection/>` 아래에 `<PrivateViewsSection board={board}/>`를 장착한다 — `BoardPermissionGate permissions={[Permission.ManageBoardRoles]}` 안에 `.tabs-content` 제목(`PrivateViews.title`)/설명(`PrivateViews.description`), 마운트 시 `getPrivateViews` → `getUsersList(createdBy 집합)`, 행마다 제목 · `PrivateViews.createdBy`(이름 없으면 ID, 날짜는 `Utils.displayDate(new Date(createAt), intl)`) · 삭제 `Button`(danger). 삭제는 `ConfirmationDialogBox`(`PrivateViews.confirm-delete`) 확인 뒤 `deletePrivateView` 후 목록에서 제거. 비어 있으면 `PrivateViews.empty`. 행 스타일은 `shareBoard.scss`의 `.user-items`/`.user-item`를 재사용하고 부족한 것만 그 파일 안에 추가한다(새 SCSS 파일 금지). T046 통과까지 (depends on T046, T049)
- [X] T051 [US6] `webapp/i18n/en.json`·`ko.json`에 `PrivateViews.title` · `description` · `empty` · `createdBy` · `delete` · `confirm-delete`를 손으로 추가한다

**Checkpoint**: 여섯 스토리 모두 독립적으로 동작

---

## Phase 9: Polish & 검증

**Purpose**: 여러 스토리에 걸친 마무리와, 완료 선언의 근거.

- [X] T052 [P] `webapp/src/mutator.ts`의 `warnIfRefused` 플래시 문구를 중립으로 바꾸고 메시지 ID로 뺀다 — `content: React.createElement(FormattedMessage, {id: 'Mutator.edit-refused', defaultMessage: "You don't have permission to edit this item."})`(`sendFlashMessage`의 `content`가 `React.ReactNode`라 intl 인스턴스 없이 가능). `webapp/i18n/en.json`·`ko.json`에 `Mutator.edit-refused` 추가(ko: "이 항목을 편집할 권한이 없습니다."). 기존 문구를 단언하는 테스트가 있으면 함께 갱신한다 (분석 U1)
- [X] T053 [P] `.cursor/rules/features/views/` 도메인 규칙의 뷰 구조 코드 블록에 `accessMode` 한 줄과 세 모드 설명을 더한다(AGENTS.md는 생성 문서라 건드리지 않는다)
- [X] T054 품질 게이트 — `make server-lint`, `make server-test`, `webapp/`에서 `npm run check` · `npm run test` · `npm run check-types`를 돌리고 실패 목록을 `specs/022-view-permission/baseline.md`와 diff로 대조한다. 새 실패 0건이어야 한다. `make generate`로 재생성한 mock이 있으면 같은 커밋에 포함됐는지 확인한다 (quickstart 「품질 게이트」)
- [X] T055 종단 검증 — 빌드·배포(`npm run debug:watch` 또는 `make deploy`) 후 하드 리프레시하고, 계정 3개(관리자 A · 팀원 B · 팀원 C)로 quickstart.md 시나리오 1~7을 훑어 절별 결과를 `tasks.md` 하단 「검증 결과」에 기록한다. 소스만 고치면 화면에 반영되지 않는다(`plugin-build-deploy-loop` 메모)
- [X] T056 SC 검증 — `specs/022-view-permission/spec.md`의 SC-001~SC-009 각각을 T054 · T055의 실측으로 대조해 표로 기록한다. 추정이었던 수치가 있으면 실측값으로 spec.md를 갱신한다

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: 의존 없음. 가장 먼저.
- **Foundational (Phase 2)**: T001 뒤. 모든 스토리를 막는다. T002·T003 → T004·T005 → T006·T007.
- **US1 (Phase 3)**: Phase 2 뒤. 다른 스토리에 의존 없음.
- **US2 (Phase 4)**: Phase 2 뒤. US1과 독립(안전망).
- **US4 (Phase 5)**: Phase 2 뒤. 서버 2·3단계(T016)는 US1의 1단계(T010)와 같은 함수를 고치므로 T010 뒤에 한다.
- **US3 (Phase 6)**: Phase 2 뒤. T027은 T010·T016과 같은 함수이므로 그 뒤. T033(fallback)은 T032(걸러진 셀렉터) 뒤. 화면에서 개인으로 바꾸려면 US4의 메뉴(T018)가 필요하지만 API로는 독립 검증 가능.
- **US5 (Phase 7)**: Phase 2(T007) 뒤. US1이 있어야 의미가 있지만 webapp만 고치므로 코드 의존은 없다.
- **US6 (Phase 8)**: US3의 필터(T028)와 관문(T027)이 있어야 "일반 경로로는 닿지 못한다"가 성립한다. T047은 `DeleteBlockAndNotify`를 나누므로 T027 뒤.
- **Polish (Phase 9)**: 모든 스토리 뒤.

### 병렬 기회

- Phase 2: T002 ∥ T003, T004 ∥ T005, T007은 T005 뒤 T006과 병렬.
- 각 스토리의 테스트 과제([P])는 서로 다른 파일이라 함께 쓸 수 있다.
- 서버 과제와 webapp 과제는 파일이 겹치지 않아 스토리 안에서 병렬이다 — 예: US4의 T016(server) ∥ T017·T018(webapp), US3의 T027~T031(server) ∥ T032·T033(webapp), US6의 T047·T048(server) ∥ T049·T050(webapp).
- `server/app/view_access.go`와 `view_access_test.go`는 US1 · US4 · US3 · US6이 차례로 고치므로 **같은 사람이 순서대로** 한다.

---

## Parallel Example: User Story 3

```bash
# 테스트를 먼저 모두 쓴다 (다른 파일):
Task: "server/app/view_access_test.go — G-17·G-18·G-19·F-01~F-06·F-11·F-14"
Task: "server/ws/plugin_adapter_test.go — BroadcastBlockDeleteExcept"
Task: "server/services/store/storetests/boards_and_blocks.go — 복제 시 개인 뷰 제외"
Task: "webapp/src/store/views.test.ts — 셀렉터 필터"
Task: "server/api/blocks_test.go — 조회·patch·delete"
Task: "webapp/src/pages/boardPage/teamToBoardAndViewRedirect.test.tsx — fallback"

# 구현은 서버와 webapp을 나눠 병렬:
Task: "server — T027 → T028 → T029 → T030 → T031"
Task: "webapp — T032 → T033"
```

---

## Implementation Strategy

### MVP

1. Phase 1 → Phase 2 → Phase 3(US1).
2. **멈추고 검증**: API로 뷰에 `accessMode: admin`을 넣고 팀원 세션의 patch가 403인지,
   `cardOrder`만은 200인지 확인한다. 이것만으로 "팀원이 정책 뷰를 못 건드린다"는 가치가
   전달된다 — 다만 화면에서 모드를 바꿀 수단은 US4다.

### 증분

1. US2(안전망) → 기본값 회귀 고정.
2. US4 → 화면에서 모드를 바꾸고 전환 규칙이 서버에 선다. 여기까지가 "관리자 모드"를
   사용자에게 넘길 수 있는 첫 배포 단위다.
3. US3 → 개인 뷰. 서버 필터 · 전환 방송 · 보드 복제 · 뷰 fallback까지.
4. US5 → 팀원 화면 비활성(칸반 열 포함).
5. US6 → 관리자 정리 목록.
6. Phase 9 → 거절 문구 · 게이트 · 종단 · SC.

### 가장 흔한 실패 방식

- 관문을 한 경로에만 걸고 나머지를 놓친다 — T006에서 여섯 경로를 한 번에 건 이유다.
  구현 뒤 `grep -n "requireViewWritePermission" server/app/blocks.go`로 여섯 호출을 센다.
- 개인 뷰 필터를 evaluator 조기 반환 **뒤**에 둔다 — 카드 접근 규칙이 꺼진 보드(대부분)에서
  개인 뷰가 새어 나간다. F-05 · F-06 테스트가 이것을 잡는다.
- 사본 뷰가 `accessMode`를 들고 간다 — W-12 · G-13.
- 마지막 비개인 뷰 셈에 내 개인 뷰를 넣는다 — W-11 · G-15 · G-16.
- `createBoardView`가 `accessMode`를 복사하지 않아 뷰 patch 때 키가 지워진다 — T005의
  보존 테스트가 잡는다.
- 모르는 viewId를 "기존 fallback이 처리한다"고 믿는다 — 지금은 빈 화면이다. T026 · T033.

---

## 검증 결과 (2026-11-02)

### 품질 게이트 — 기준선([baseline.md](baseline.md)) 대비

| 게이트 | 기준선 | 최종 | 판정 |
|---|---|---|---|
| `make server-test` | FAIL 서브테스트 96건 (exit 2) | 96건, **목록 diff 없음** | 회귀 없음 |
| `make server-lint` | (기준선 로그 없음 — CI 집행) | 12건, 전부 이 기능이 손대지 않은 파일(`app/import.go`, `app/export*.go`, `model/board_permissions.go`, `mmpermissions.go`, `localpermissions.go`, `boards/boardsapp_util.go`). 이 기능의 파일은 0건 | 통과 |
| `npm run test` | 139 failed / 1369 | 138 failed / 1417 (신규 48건 전부 통과). 이름 diff: 기준선에서 사라짐 2(`blocksEditor` 스냅샷 2 — 간헐), 새로 실패 1(`dateFilter › handles Today button`) | dateFilter는 시간 의존 flaky — 변경을 전부 stash한 기준 트리에서도 같은 스위트의 `handles calendar click event`가 실패함을 확인. 회귀 아님 |
| `npm run check-types` | 23 | 23, 동일(행 번호만 이동) | 회귀 없음 |
| `npm run check` | 2449 | 2458. 증가 9건은 새 파일마다 붙는 환경성 `Resolve error: typescript with invalid interface loaded as resolver`(기준선의 모든 파일에 1건씩 있음). 그 외 신규 0 | 회귀 없음 |

- shareBoard 스냅샷 13개는 공유 위젯에 개인 뷰 섹션이 더해진 의도된 변경이라 `-u`로 갱신했다(+299줄, 추가만). 갱신 후 shareBoard 스위트의 실패는 기준선과 같은 5건(`toBeCalledTimes` 계열)뿐이다.
- `make webapp-ci`는 기준선부터 exit=2라 세 단계를 따로 돌려 대조했다(constitution 원칙 I).

### 종단 검증 — [quickstart.md](quickstart.md)

배포: `MM_DEBUG=1 make server-linux` → `npx webpack --mode=development` → `make deploy-from-watch` (focalboard 9.2.4 active). 계정은 로컬 모드 소켓으로 `qa-022a`(보드 관리자) · `qa-022b` · `qa-022c`(editor)를 만들어 demosample 팀에 넣고, 검증 후 보드 삭제·계정 비활성화로 정리했다.

**API 수준** (`scratchpad/e2e/api_e2e.py`, 배포된 플러그인 대상, 39/39 통과):

| 절 | 케이스 | 결과 |
|---|---|---|
| 1-6~1-8 | G-03 · G-04 · G-05 · G-06 · G-07 · G-08 · G-09, FR-005 | 전부 기대값(403/200) |
| 2-1 · 2-3 | G-21(모르는 값 → 공용), 공용 뷰 editor patch 200 | 통과 |
| 3-1~3-8 | G-14 · G-17 · G-18(patch/delete/duplicate/undelete) · G-19, F-01 · F-02 · F-03 · F-04 · F-09 | 통과 |
| 4-2 · 4-3 · 4-5 · 4-6 · 4-7 | G-15 · G-16(400), G-10 · G-12(403), 두 번째 공용 뷰가 생기면 개인 전환 200 | 통과 |
| 5-2 · 5-3 · 5-4 | G-13(사본에 accessMode 없음), F-10 · F-12(보드 복제가 남의 개인 뷰 제외·관리자 모드 보존), F-11(아카이브에 개인 뷰 없음) | 통과 |
| 6-2 · 6-4 · 6-5 | A-02(403) · A-06(404) · A-05(403), A-01(목록에 fields 없음) | 통과 |

**브라우저** (playwright MCP, 영어 로케일 계정):

| 절 | 계정 | 확인한 것 | 결과 |
|---|---|---|---|
| 1-2 · 1-3 | C | Policy(관리자) 뷰: 속성·그룹화·필터·정렬 비활성 + "Only board admins can change this view." 툴팁, 권한 버튼 "Admins" 비활성, 탭 메뉴에 Duplicate view만 | 통과 (`.playwright-mcp/e2e-c-policy-locked.png`) |
| 3-3 · U-14 | C | B의 개인 뷰 주소로 직접 진입 → 빈 화면 없이 Policy 뷰로 리다이렉트, 탭에 개인 뷰 없음 | 통과 |
| 7-1 | C ← A(API) | C가 Shared 뷰를 보는 중 A가 관리자로 전환 → 4초 안에 메뉴 비활성·라벨 "Admins"로 바뀜 | 통과 |
| 7-2 | C ← B(API) | C가 "B live view"를 보는 중 B가 개인으로 전환 → 탭에서 사라지고 Policy 뷰로 이동, 헤더 정상 렌더 | 통과 |
| U-03 | B | 자기 개인 뷰의 권한 메뉴: Everyone · Private(체크), Admins 없음; 자기 개인 뷰 2개가 탭에 보임 | 통과 |
| U-03 · FR-012 | A | Policy 뷰 메뉴 전부 활성, 권한 메뉴 Everyone · Admins(체크) · Private; 탭에 B의 개인 뷰 없음 | 통과 |
| 6-1 · 6-3 | A | 공유 위젯 "Private views" 섹션에 B의 뷰 2개(이름 · "Created by qa-022b on November 02" · Delete) → "B live view" 삭제 확인 다이얼로그 → 목록에서 제거, B의 블록 조회에서도 사라짐 | 통과 (`.playwright-mcp/e2e-a-private-views-confirm.png`) |

관찰: 공용→개인 전환의 ID-only tombstone을 받은 쪽 콘솔에 `ASSERT [Can't hydrate unknown block type: ]` 로그가 1건 남는다. upstream의 `BroadcastBlockDelete`가 보내는 ID-only 블록도 같은 로그를 내는 기존 동작이며 화면 동작에는 영향이 없다.

브라우저로 보지 않은 것: 칸반 열 끌기·숨기기 잠금(U-10), 기본 템플릿 항목 비활성(U-08), 열어 둔 패널에서의 저장 거절 플래시(7-1 후반). 단위 테스트(W-17 · 기본 템플릿 2건)와 API 403으로 대신했다.

### SC 대조

| SC | 근거 | 판정 |
|---|---|---|
| SC-001 비관리자의 구성 변경 100% 거절 | G-03/04/05/07 API 403 + 브라우저 메뉴 비활성(1-2) | 충족 |
| SC-002 카드 끌기·순서 100% 성공 | G-06 200(cardOrder만), 카드 끌기 자체는 카드 patch라 변경 없음 | 충족 |
| SC-003 기본값 뷰 동작 동일 | G-01/02/21 + 2-1/2-3, 서버·webapp 실패 목록 diff 없음 | 충족 |
| SC-004 개인 뷰 내용 비전달 | F-01/02/04 API, 7-2 tombstone, 3-3 주소 fallback | 충족 |
| SC-005 개인 뷰 쓰기 100% 거절 | G-18(patch·delete·duplicate·undelete) + G-19 | 충족 |
| SC-006 고를 수 없는 항목 미표시·API 거절 | 브라우저 B/A/C 메뉴 항목, G-09/10/12 403 | 충족 |
| SC-007 비개인 뷰 0개 불가 | G-15/16 400, webapp W-11 | 충족 |
| SC-008 관리자 목록·삭제, 비관리자 없음 | A-01 · 6-1 · 6-3 · A-02/A-05 403 | 충족 |
| SC-009 복제·내보내기 비유출 | S5-3(F-10/F-12) · S5-4(F-11) 배포본 API + 저장소 테스트 T023(Postgres, RED→GREEN) | 충족 |
