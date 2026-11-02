# Contract: 관리자용 개인 뷰 목록 · 삭제 API

**Spec**: [spec.md](../spec.md) | FR-023~FR-025

일반 블록 경로는 [private-view-filter.md](private-view-filter.md)의 F1과
[view-write-gate.md](view-write-gate.md)의 1단계가 막으므로 관리자도 남의 개인 뷰에 닿지
못한다. 이 두 엔드포인트가 유일한 우회이고 둘 다 `PermissionManageBoardRoles`를 요구한다.

## GET /api/v2/boards/{boardID}/views/private

이 보드의 모든 개인 뷰 요약.

**권한**: `HasPermissionToBoard(userID, boardID, ManageBoardRoles)`. 아니면 403.

**응답 200**

```json
[
  {"id": "view-id", "title": "내 작업 뷰", "createdBy": "user-id", "createAt": 1762000000000}
]
```

- `deleteAt == 0`인 뷰만. `title` 순 정렬.
- 구성(`fields`)은 싣지 않는다 — 목록이지 뷰가 아니다(FR-023).
- 개인 뷰가 없으면 `[]`.

**오류**: 보드 없음 404, 권한 부족 403.

## DELETE /api/v2/boards/{boardID}/views/private/{viewID}

개인 뷰 하나를 지운다.

**권한**: `ManageBoardRoles`. 아니면 403.

**판정**

```
block = GetBlock(viewID)
block.boardId != boardID           → 404
block.type != view                 → 404
ViewAccessModeOf(block) != private → 404   // 공용·관리자 뷰는 이 경로로 지우지 않는다
```

통과하면 관문을 건너뛰는 내부 삭제(`deleteBlockUnchecked`)로 지운다. 방송은 기존
`deletedBlockMessage`로 나가고 F2가 만든 사람에게만 전달한다.

**응답 200**: `{}`

## App 계층

```
GetPrivateViewsForBoard(boardID) ([]*model.PrivateViewSummary, error)
DeletePrivateViewAsAdmin(boardID, viewID, userID) error
```

API 핸들러는 권한 검사 뒤 이 둘만 부른다. `DeletePrivateViewAsAdmin`이 위 판정을 하고
`deleteBlockUnchecked`를 호출한다. `DeleteBlockAndNotify`는 "관문 + `deleteBlockUnchecked`"로
나눈다.

## 라우팅

`server/api/views.go`의 `registerViewsRoutes(r)`를 `api.go`의 `RegisterRoutes`에 등록한다.
두 핸들러 모두 `a.sessionRequired(...)`.

## webapp 클라이언트

```
octoClient.getPrivateViews(boardId): Promise<PrivateViewSummary[]>
octoClient.deletePrivateView(boardId, viewId): Promise<Response>
```

만든 사람 표시 이름은 `octoClient.getUsersList(createdByIds)`로 따로 가져온다. 이름을
못 찾은 사용자(탈퇴 등)는 ID를 그대로 보여 준다.

## 계약 검증 케이스

| ID | 호출자 | 요청 | 기대 | FR |
|---|---|---|---|---|
| A-01 | admin | GET, 개인 뷰 2 · 공용 뷰 1 | 200, 개인 뷰 2건만, fields 없음 | FR-023 |
| A-02 | editor | GET | 403 | FR-025 |
| A-03 | admin | GET, 개인 뷰 없음 | 200, `[]` | FR-023 |
| A-04 | admin | DELETE 개인 뷰 | 200, 블록 deleteAt 찍힘, 방송 수신자 = 만든 사람 | FR-024 |
| A-05 | editor | DELETE 개인 뷰 | 403 | FR-025 |
| A-06 | admin | DELETE 공용 뷰 | 404 | FR-024 |
| A-07 | admin | DELETE 다른 보드의 뷰 ID | 404 | FR-024 |
| A-08 | admin | DELETE 이미 지운 뷰 | 404 또는 200 멱등 — 기존 `DeleteBlock`의 "없는 블록 삭제는 오류 아님"을 따른다 | FR-024 |
