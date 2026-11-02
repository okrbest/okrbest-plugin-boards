# Phase 0 연구: 뷰마다 권한 모드를 정한다

2026-11-02. 코드 실측을 바탕으로 설계 결정을 확정한다. Technical Context에 NEEDS
CLARIFICATION은 없었고, 아래는 구현 방식을 가르는 결정들이다. 브레인스토밍 초안
(`docs/superpowers/specs/2026-11-02-view-permission-design.md`)의 결정을 코드 위치와 함께
다시 적는다.

## 현행 구조 실측

- **뷰 구성 변경 권한**: [viewHeader.tsx:73](../../webapp/src/components/viewHeader/viewHeader.tsx#L73)
  `canManageViewOptions = canEditBoardProperties || canManageBoard`. 보드 편집 권한(editor)이면
  모든 뷰 메뉴가 열린다. 비활성일 때는 `disabled` + `title`(툴팁)로 `ViewHeader.permission-required`를
  보여 준다. 이 패턴을 그대로 재사용한다.
- **서버 블록 쓰기 권한**: [api/blocks.go](../../server/api/blocks.go)의 patch · patchBlocks ·
  delete · duplicate · undelete · insert 핸들러는 모두 `PermissionManageBoardCards`만 본다.
  뷰 블록에 대한 추가 판정은 없다. App 계층 [blocks.go](../../server/app/blocks.go)에는 009가
  둔 `requireCardEditPermission` · `requireConditionWrite` · `requireInsertPermission` ·
  `requireDuplicatePermission`이 같은 여섯 경로에 걸려 있다.
- **관리자 판정**: 010은 API 계층에서 `PermissionManageBoardRoles`를 본다
  ([boards.go:406-425](../../server/api/boards.go#L406-L425)). App은 `a.permissions.HasPermissionToBoard`로
  같은 판정을 할 수 있다([app.go:73](../../server/app/app.go#L73)). webapp은
  `canManageBoard` capability가 `ManageBoardRoles`에 대응한다
  ([hooks/permissions.tsx:23](../../webapp/src/hooks/permissions.tsx#L23)).
  팀 관리자는 보드의 명시적 멤버일 때만 승격된다(`mmpermissions.go`의 `hasExplicitMember`).
- **사용자별 블록 필터**: [blocks.go:61](../../server/app/blocks.go#L61) `FilterBlocksForUser`는
  보드 조회(`?all=true`) · 단일 블록 조회(`?block_id=`) · 부모/유형 조회 세 경로와
  내보내기(`blocksForArchive`)가 모두 탄다. 다만 카드 접근 규칙이 꺼진 보드에서
  `!evaluator.Enforces()`로 조기 반환한다. websocket 쪽
  [property_access.go:148](../../server/app/property_access.go#L148) `FilterBlockRecipients`도
  `settings == nil || !settings.Enabled`와 `card == nil`(뷰 블록)에서 조기 반환한다.
- **삭제 방송**: `DeleteBlockAndNotify`는 `deletedBlockMessage(block)`으로 **전체 블록**에
  deleteAt을 찍어 보낸다([blocks.go:389](../../server/app/blocks.go#L389)). ws 어댑터의
  `BroadcastBlockDelete`는 ID·BoardID·DeleteAt만 담는다([plugin_adapter.go:698](../../server/ws/plugin_adapter.go#L698)).
  webapp은 `deleteAt !== 0`인 블록을 `updateViews`로 넘겨 스토어에서 지운다
  ([boardPage.tsx:139](../../webapp/src/pages/boardPage/boardPage.tsx#L139), [store/views.ts:69](../../webapp/src/store/views.ts#L69)).
- **클러스터 방송**: `ClusterMessage{TeamID, BoardID, UserID, Payload, EnsureUsers}`가 다른
  노드로 가고, 받는 쪽은 `sendBoardMessageSkipCluster(..., EnsureUsers...)`로 재진입한다
  ([plugin_adapter_cluster.go:13-58](../../server/ws/plugin_adapter_cluster.go#L13-L58)). 수신자
  목록은 `getUserIDsForTeamAndBoard` → `filterBlockRecipients` 순으로 만든다.
- **보드 복제**: [boards_and_blocks.go:137](../../server/services/store/sqlstore/boards_and_blocks.go#L137)
  `duplicateBoard`가 `getBlocksForBoard`로 전부 읽고 댓글만 걸러 `createBoardsAndBlocksWithAdmin`에
  넘긴다. `insertBlock`이 새 ID에 `CreatedBy = userID`를 찍는다. 템플릿에서 보드 만들기,
  온보딩 보드도 같은 함수를 쓴다.
- **뷰 탭 · 복제 · 삭제**: [viewTabs.tsx](../../webapp/src/components/viewHeader/viewTabs.tsx)의
  `handleDuplicate`는 `createBoardView(activeView)`로 사본을 만들어 `mutator.insertBlock`한다
  (duplicate 엔드포인트를 쓰지 않는다). `canDelete={views.length > 1}`. 탭 메뉴는
  `canEditBoardProperties`일 때만 열린다.
- **팀원이 뷰에 쓰는 경로**: 칸반 · 표의 카드 끌기 → `changeViewCardOrder`(`cardOrder`만).
  칸반 열 순서 끌기 → `changeViewVisibleOptionIds`(잠금 대상). 기본 템플릿 지정 →
  `setDefaultTemplate`/`clearDefaultTemplate`(`defaultTemplateId`, 잠금 대상). 표 그룹 접기 ·
  열 너비는 021 이후 로컬 상태라 서버에 가지 않는다.
- **거절 응답 처리**: `mutator.warnIfRefused`가 403에 플래시 메시지를 띄운다
  ([mutator.ts:73](../../webapp/src/mutator.ts#L73)). 화면이 놓친 경로가 있어도 서버 거절이
  조용히 묻히지 않는다. 문구가 "이 카드를 편집할 권한이 없습니다"로 고정이라 뷰 거절에는
  맞지 않는다 — R10에서 다룬다.
- **공유 위젯 관리자 영역**: [shareBoard.tsx:467-471](../../webapp/src/components/shareBoard/shareBoard.tsx#L467-L471)에
  `OkrBoardSection` · `AdminOnlyPropertiesSection` · `PropertyAccessSection`이 순서대로 있고,
  각 섹션이 `BoardPermissionGate permissions={[ManageBoardRoles]}`로 스스로를 감싼다.
  스타일은 `shareBoard.scss`의 `.tabs-content` · `.user-items` · `.user-item`을 쓴다.
  사용자 이름 조회는 `octoClient.getUsersList(ids)`가 있다.

## 결정 1 (R1): 모드는 뷰 블록 `fields.accessMode`

- **Decision**: `BoardView.fields.accessMode?: 'everyone' | 'admin' | 'private'`. 값이 없거나
  세 값 밖이면 `everyone`. Go `model.ViewAccessModeOf(block *Block) ViewAccessMode`와 TS
  `viewAccessMode(view): ViewAccessMode`가 같은 규칙을 구현하고 각자 colocated 테스트를 둔다
  (010의 `card_property_lock.go` / `cardPropertyLock.ts` 쌍과 같은 방식).
- **Rationale**: 뷰의 다른 구성(필터 · 정렬)과 같은 자리라 patch · 복제 · 방송 · 스토어가
  전부 그대로 동작한다. upstream 클라이언트는 모르는 키를 무시한다. 마이그레이션이 없다.
- **Alternatives considered**:
  - blocks 테이블 컬럼 추가 — 마이그레이션(원칙 VII)과 세 DB 분기가 필요하고 얻는 것이 없다. 기각.
  - `board.properties`에 `{viewId: mode}` 맵 — 뷰와 보드 두 곳이 진실이 되어 뷰 삭제 · 복제
    때 어긋난다. 기각.

## 결정 2 (R2): 관리자 = `PermissionManageBoardRoles`

- **Decision**: 서버는 `a.permissions.HasPermissionToBoard(userID, boardID, model.PermissionManageBoardRoles)`,
  webapp은 `useHasCapabilities(boardId, ['canManageBoard'])`. 010과 동일.
- **Rationale**: 보드 관리자 · 시스템 관리자 · (명시적 멤버인) 팀 관리자가 한 판정으로
  묶인다. 이미 두 기능이 같은 판정을 쓰므로 사용자에게 "관리자"의 뜻이 일관된다.
- **Alternatives considered**: `ManageBoardProperties` — editor도 통과하므로 잠금이 되지 않는다. 기각.

## 결정 3 (R3): 쓰기 관문은 App 계층 한 함수

- **Decision**: `server/app/view_access.go`에
  `requireViewWritePermission(userID string, stored *model.Block, patch *model.BlockPatch, board *model.Board, op viewWriteOp) error`를
  둔다. `op`는 `viewWritePatch` · `viewWriteDelete` · `viewWriteDuplicate` · `viewWriteUndelete` ·
  `viewWriteUpsert`. `stored.Type != view`면 즉시 nil. 호출 지점은 `PatchBlockAndNotify`,
  `PatchBlocksAndNotify`(블록마다), `DeleteBlockAndNotify`, `DuplicateBlock`, `UndeleteBlock`
  (히스토리 블록 기준), `InsertBlocksAndNotify`(store에 같은 ID가 이미 있는 뷰 블록). API
  계층의 `ManageBoardCards` 검사는 그대로 둔다.
- **Rationale**: 010은 경로가 둘이라 API에 뒀지만, 뷰 쓰기는 여섯 경로다. 009가 같은 이유로
  App에 require 함수를 두었고 여섯 경로 모두 이미 그 함수들을 부르므로 바로 옆에 한 줄씩
  더하면 된다(FR-018). 내부 호출(`deleteSubCards`, 관리자 정리 삭제)도 App 안에서 관문을
  건너뛰는 내부 함수로 분기할 수 있다.
- **Alternatives considered**: API 핸들러마다 검사 — 여섯 곳에 같은 코드를 복제하고,
  `handlePatchBlocks`처럼 여러 보드가 섞이는 핸들러에서 블록별 보드 조회가 중복된다. 기각.

## 결정 4 (R4): `cardOrder`만 바꾸는 patch는 관리자 뷰에서도 통과

- **Decision**: patch가 "카드 순서만 바꾼다"는 판정은 `patch.Title == nil && len(patch.DeletedFields) == 0 && patch.UpdatedFields의 키 집합 == {"cardOrder"}`
  (ParentID · Schema · Type도 nil). 이 경우 관리자 뷰라도 편집 권한자에게 허용한다.
- **Rationale**: 사용자가 카드 순서 변경은 막지 않기로 정했다(FR-008). webapp의
  `changeViewCardOrder`와 정렬 메뉴의 수동 정렬(`cardOrder` + `sortOptions` 동시 변경)을
  구분해야 하는데, 후자는 키가 둘이라 자연히 거절된다.
- **Alternatives considered**: 허용 키 목록을 넓게(`cardOrder`, `collapsedOptionIds`, `columnWidths`)
  — 021 이후 뒤의 둘은 서버에 오지 않으므로 늘릴 이유가 없다. 좁게 유지한다.

## 결정 5 (R5): 개인 뷰 필터는 두 앞단에

- **Decision**: `model.ViewHiddenFrom(block *Block, userID string) bool`
  (= 뷰 && private && CreatedBy != userID). `FilterBlocksForUser`는 보드를 읽은 직후,
  evaluator를 만들기 전에 이 조건으로 한 번 거른다. `FilterBlockRecipients`는 보드를
  읽은 직후, settings 조기 반환 전에 `ViewAccessModeOf(block) == private`이면
  `userIDs ∩ {block.CreatedBy}`를 돌려준다.
- **Rationale**: 두 함수는 이미 모든 읽기 · 방송 경로의 합류점이다(실측). 카드 규칙이
  꺼진 보드에서도 개인 뷰는 숨어야 하므로 조기 반환보다 앞이어야 한다. 단일 블록 조회
  (`?block_id=`)도 같은 함수를 타므로 ID를 알아도 받을 수 없다(FR-014의 서버 쪽).
- **Alternatives considered**: 스토어 쿼리에서 WHERE로 제외 — `fields`는 JSON이라 세 DB
  분기가 필요하고, 방송 경로는 어차피 메모리 판정이다. 기각.

## 결정 6 (R6): 공용→개인 전환은 "제외 대상이 있는 tombstone"으로 알린다

- **Decision**: `PatchBlockAndNotify` · `PatchBlocksAndNotify`에서 patch 전후 모드가
  `!private → private`로 바뀐 뷰에 대해, 기존 `BroadcastBlockChange(teamID, block)`(필터가
  만든 사람에게만 전달)에 더해 `a.wsAdapter.BroadcastBlockDeleteExcept(teamID, block.ID, block.BoardID, block.CreatedBy)`를
  호출한다. ws 어댑터는 `getUserIDsForTeamAndBoard` 결과에서 제외 대상을 빼고 ID만 담은
  삭제 블록을 보낸다. `ClusterMessage`에 `ExcludeUsers []string`을 더해 다른 노드도 같은
  제외를 적용한다(`EnsureUsers`와 대칭).
- **Rationale**: 전환 방송은 만든 사람 외에는 걸러지므로 그들의 Redux에는 공용이던 옛
  블록이 남는다(빌더 검토 지적). tombstone은 ID · BoardID · DeleteAt만 담아 내용 유출이
  없고, webapp은 기존 `deleteAt` 처리로 탭을 지운다. 제외를 수신자 단계에서 하면 payload에
  만든 사람 ID를 실을 필요가 없다.
- **Alternatives considered**:
  - 필터가 "개인 뷰 tombstone이면 만든 사람을 뺀다"고 판정 — payload에 `createdBy`가 실려야
    하고, 만든 사람이 자기 개인 뷰를 실제로 지울 때(`deletedBlockMessage`가 전체 블록을
    보냄)와 구분이 안 되어 만든 사람이 삭제 통지를 못 받는다. 기각.
  - 모든 사용자에게 tombstone 뒤 만든 사람에게만 재전송 — 순서 보장이 없어 만든 사람
    화면에서 뷰가 깜빡이거나 사라진다. 기각.
  - webapp이 자체 판단 — 서버가 보내지 않은 정보를 알 수 없다. 불가.

## 결정 7 (R7): 마지막 비개인 뷰 보호는 서버 · webapp 양쪽

- **Decision**: 서버 — 전환(`→ private`)과 삭제 판정 때 `a.store.GetBlocksWithType(boardID, model.TypeView)`로
  뷰를 읽어 `DeleteAt == 0 && mode != private`인 수를 센다. 1이고 대상이 그 뷰면
  `NewErrBadRequest("the board must keep at least one shared view")`. webapp —
  `viewTabs`의 `canDelete`를 "보이는 뷰 수"가 아니라 "비개인 뷰 수 > 1"로 바꾸고, 권한
  메뉴의 개인 항목도 같은 조건으로 숨긴다.
- **Rationale**: 빌더 검토가 지적한 구멍. 내 개인 뷰도 "보이는 뷰"에 들어가므로 지금
  셈으로는 다른 모두에게 뷰가 0개인 보드가 만들어진다(FR-016 · SC-007).
- **Alternatives considered**: 뷰 0개 보드를 webapp이 처리(빈 상태 화면 · 자동 생성) —
  지금 코드에 그 상태를 다루는 분기가 없고 새 화면이 필요하다(원칙 II). 기각.

## 결정 8 (R8): 보드 복제는 남의 개인 뷰를 빼고, 내보내기는 그대로

- **Decision**: `sqlstore.duplicateBoard`가 댓글을 거르는 루프에
  `model.ViewHiddenFrom(b, userID)`도 건다. 복제된 공용 · 관리자 뷰는 `fields.accessMode`를
  그대로 들고 간다. 내보내기(`blocksForArchive`)는 이미 `GetBlocksForBoardForUser`를 타므로
  R5의 필터가 적용되어 변경이 없다.
- **Rationale**: 그대로 두면 A의 개인 뷰 구성이 B의 개인 뷰가 되어 반목표에 걸린다
  (FR-027). 댓글 제외가 같은 자리에서 같은 모양으로 이미 있어 패턴 안이다.
- **Alternatives considered**: App `DuplicateBoard`에서 사후 삭제 — 이미 삽입된 뒤라
  방송 · 파일 복사가 먼저 나간다. 기각.

## 결정 9 (R9): 관리자 정리 API는 전용 엔드포인트 둘

- **Decision**: `server/api/views.go`에 `registerViewsRoutes`:
  - `GET /boards/{boardID}/views/private` → `[]model.PrivateViewSummary{ID, Title, CreatedBy, CreateAt}`
  - `DELETE /boards/{boardID}/views/private/{viewID}` → `{}`
  둘 다 `PermissionManageBoardRoles`. App: `GetPrivateViewsForBoard(boardID)`,
  `DeletePrivateViewAsAdmin(boardID, viewID, userID)` — 후자는 대상이 개인 뷰인지 확인한 뒤
  관문을 건너뛰는 내부 삭제(`deleteBlockUnchecked`)를 부른다. 방송은 `deletedBlockMessage`로
  전체 블록이 나가고 R5 필터가 만든 사람에게만 전달한다. 만든 사람의 표시 이름은 webapp이
  `octoClient.getUsersList(ids)`로 가져온다.
- **Rationale**: 일반 블록 경로는 R5 필터와 R3 관문이 막으므로 관리자도 닿지 못한다.
  전용 경로가 유일한 우회이고, 그 경로가 관리자 권한만 요구하도록 한 곳에서 보인다.
  요약에 구성(필터 · 정렬)을 싣지 않아 목록이 뷰 내용을 드러내지 않는다(FR-023).
- **Alternatives considered**: 기존 `DELETE /blocks/{id}`에 관리자 우회 — 관문 함수에
  "관리자면 개인 뷰도 지운다"는 예외가 생겨 FR-011의 단순함이 깨진다. 기각.

## 결정 10 (R10): webapp 화면은 기존 패턴을 그대로

- **Decision**:
  - `viewAccess.ts`(순수 함수): `viewAccessMode(view)`, `isViewHiddenFrom(view, userId)`,
    `viewConfigLocked({mode, isAdmin})`, `accessModeTargets({mode, isAdmin, isCreator, isLastShared})`.
  - `hooks/viewAccess.ts`: `useViewAccess(view, sharedViewCount)`가 `getMe` · `canManageBoard` ·
    `canEditBoardProperties`를 묶어 `{mode, isAdmin, isCreator, locked, targets, canChange}`를 준다.
  - `viewHeaderAccessMenu.tsx`: 정렬 메뉴와 같은 `MenuWrapper` + `Button` + `Menu.Text`.
    버튼 라벨 = 현재 모드 이름. `targets`에 있는 항목만 렌더. `canChange`가 false면
    `disabled` + 툴팁.
  - `viewHeader.tsx`: `canManageViewOptions = (canEditBoardProperties || canManageBoard) && !locked`.
    잠금일 때 안내 문구는 새 키 `ViewHeader.admin-only-view`.
  - `viewTabs.tsx` · `viewTabMenu.tsx`: `canRename={!locked}` · `canDelete={!locked && sharedViews.length > 1}`.
    `handleDuplicate`는 사본에서 `accessMode`를 지운다.
  - `emptyCardButton.tsx` · `newCardButtonTemplateItem.tsx`: 기본 템플릿 지정 항목을
    `locked`면 `disabled`.
  - `store/views.ts`: `getCurrentBoardViews` · `getViewsByBoard` · `getSortedViews`가
    `isViewHiddenFrom(view, me.id)`를 거른다(방어).
  - `shareBoard/privateViewsSection.tsx`: `BoardPermissionGate ManageBoardRoles` 안에
    `.tabs-content` 제목/설명 + 행 목록(이름 · 만든 사람 · 날짜 · 삭제 `Button`) +
    `ConfirmationDialogBox`. 열릴 때 `getPrivateViews` → `getUsersList`.
  - `mutator.changeViewAccessMode(boardId, viewId, oldMode, newMode)`는 `changeViewSortOptions`와
    같은 낙관적 갱신 + undo 모양.
  - `warnIfRefused`의 고정 문구는 그대로 두되, 뷰 메뉴는 화면에서 먼저 막히므로 거절은
    예외 경로에서만 보인다. 문구 일반화는 범위 밖.
- **Rationale**: 원칙 II. 같은 화면 · 같은 역할의 컨트롤이 이미 있으므로 새 시각 언어를
  만들지 않는다.
- **Alternatives considered**: 권한 메뉴를 뷰 탭 메뉴 안에 넣기 — 사용자가 헤더 메뉴
  줄 끝으로 지정했다. 기각. 잠긴 메뉴를 숨기기 — 010은 숨겼지만 이 기능은 "왜 못
  바꾸는지"를 알려야 해서 비활성 + 툴팁이 맞다(FR-021 · 022).

## 결정 10-보충 (R10b): 뷰 fallback은 지금 없다 — 새로 만든다

- **실측**: [teamToBoardAndViewRedirect.tsx:82](../../webapp/src/pages/boardPage/teamToBoardAndViewRedirect.tsx#L82)는
  `!viewID || viewID === '0'`일 때만 lastViewId 또는 첫 뷰로 리다이렉트한다. 주소에 모르는
  viewId가 있으면 [workspace.tsx:146-148](../../webapp/src/components/workspace.tsx#L146-L148)이
  `board && !activeView`로 `null`을 그린다 — 빈 화면이다. 분석(C1)에서 발견했다.
- **Decision**: 같은 컴포넌트에 분기를 더한다. `boardViews`가 로드됐고(길이 > 0)
  `params.viewId`가 그 안에 없으면, lastViewId가 목록에 있으면 그것으로, 아니면
  `boardViews[0]`으로 `navigate(replace)`하고 lastViewId를 갱신한다. `boardViews`는
  R10의 걸러진 셀렉터(`getCurrentBoardViews`)이므로 개인 뷰는 목록에 없다.
- **Rationale**: 개인 뷰 주소 직접 접근(FR-014)과 공용→개인 전환 tombstone(FR-013) 두
  경우 모두 "현재 viewId가 보이는 목록에 없다"로 귀결되어 한 분기로 덮인다.
- **Alternatives considered**: workspace에서 `!activeView`일 때 첫 뷰를 그린다 — 주소와
  화면이 어긋나고 lastViewId도 그대로 남는다. 기각.

## 결정 11 (R11): 서버도 뷰 복제 사본을 공용으로 만든다

- **Decision**: `App.DuplicateBlock`에서 원본이 뷰면 (a) R3 관문(`viewWriteDuplicate`)을
  거치고, (b) 복사 뒤 사본 뷰 블록의 `accessMode`를 `DeletedFields`로 지우는 patch를
  같은 호출 안에서 적용한다.
- **Rationale**: webapp의 뷰 복제는 `insertBlock`을 써서 사본을 직접 만들므로 거기서
  `accessMode`를 지우면 되지만, duplicate 엔드포인트로 뷰를 복제하면 관리자 뷰 사본이
  팀원 소유의 관리자 뷰가 된다. 서버가 진실이므로 서버도 FR-026을 지킨다.

## 결정 12 (R12): 기준선을 먼저 채취한다

- **Decision**: 구현 전에 `make server-test` · `npm run test` · `npm run check-types` ·
  `npm run check`의 실패 목록을 `specs/022-view-permission/baseline.md`에 남긴다(010 선례).
  완료 판정은 이 목록과의 diff다.
- **Rationale**: 깨끗한 상태에서도 실패가 있다(server 7~8건, webapp 다수). 개수로 판정하면
  회귀를 놓친다(constitution 원칙 I).

## 회귀 위험 지점

- `FilterBlocksForUser`에 추가하는 앞단 필터는 **뷰 블록만** 건드려야 한다. 카드 · 댓글
  경로의 기존 테스트(`blocks_test.go`의 property access 케이스)가 그대로 통과해야 한다.
- `PatchBlocksAndNotify`는 배치를 통째로 거절한다. 관문 거절도 같은 규칙을 따른다 —
  허용된 절반만 적용하면 undo 스택이 어긋난다(기존 주석).
- `handlePatchBlocks`는 `teamID`를 경로에서 받지만 실제 라우트에 없어 빈 값이 온다(기존
  동작). 전환 방송에서 `board.TeamID`를 쓰면 영향이 없다.
- `getCurrentBoardViews`에 `me` 의존이 생긴다. 셀렉터 입력에 `state.users.me`를 더하면
  memoize가 유지된다. `me`가 null인 공유 링크(읽기 전용)에서는 거르지 않는다 — 서버가
  이미 걸러 보낸다.
- 뷰 탭 메뉴는 `canEditBoardProperties`일 때만 열린다. 잠긴 뷰에서 이름 변경 · 삭제가
  빠지면 복제 하나만 남는 메뉴가 되는데, 이것이 의도다(FR-022).
