# 인터페이스 계약: 보드 권한 API

**Feature**: `001-remove-board-acl` | **Date**: 2026-08-01

이 플러그인은 `/plugins/focalboard/api/v2/` 경로로 HTTP 인터페이스를 노출한다. 이번 작업은 신규 엔드포인트를 만들지 않고 기존 엔드포인트를 제거하며, 남는 엔드포인트 하나의 응답 스키마를 축소한다.

## 1. 제거되는 엔드포인트

라우트 등록 지점: `server/api/boards.go`의 `registerBoardsRoutes`

| 메서드 | 경로 | 용도 |
|---|---|---|
| GET | `/org/units` | 부서 목록 조회 |
| GET | `/org/positions` | 직위 목록 조회 |
| GET | `/boards/{boardID}/acl` | 보드 접근 권한 항목 목록 조회 |
| PUT | `/boards/{boardID}/acl` | 보드 접근 권한 항목 전체 교체 |
| POST | `/boards/{boardID}/acl/entries` | 접근 권한 항목 추가 |
| DELETE | `/boards/{boardID}/acl/entries/{entryID}` | 접근 권한 항목 삭제 |
| GET | `/boards/{boardID}/permissions/preview` | 지정 사용자의 보드 권한 미리보기 |
| PUT | `/boards/{boardID}/owner` | 보드 소유권 이전 |

제거 후 이 경로들은 404를 반환한다.

`/permissions/preview`를 함께 제거하는 근거: 접근 권한 관리자용 진단 도구였고, 인가 검사가 `canManageBoardACL`(제거 대상)에 의존하며, 웹앱이 호출하지 않는다.

## 2. 유지되는 엔드포인트

### GET `/boards/{boardID}/permissions/me`

호출자 자신의 보드 권한 요약을 반환한다. 웹앱의 `boardPermissions` 상태 슬라이스가 소비하며 화면 권한 게이팅의 근거다.

**응답 스키마 (변경 전)**

```json
{
  "boardId": "string",
  "effectivePermission": "none | view | commenter | edit | manage | delete",
  "capabilities": {
    "canView": true,
    "canCommentCard": true,
    "canCreateCard": true,
    "canEditCard": true,
    "canDeleteCard": true,
    "canManageBoard": true,
    "canDeleteBoard": true
  },
  "derivedFrom": "owner | direct_acl | org_unit_acl | position_acl | org_position_acl | ceo_full_visibility | board_manager | member_role | team_admin_default | system_admin_override | deny",
  "isOwner": true
}
```

**응답 스키마 (변경 후)**

```json
{
  "boardId": "string",
  "effectivePermission": "none | view | commenter | edit | manage | delete",
  "capabilities": {
    "canView": true,
    "canCommentCard": true,
    "canCreateCard": true,
    "canEditCard": true,
    "canDeleteCard": true,
    "canManageBoard": true,
    "canDeleteBoard": true
  },
  "derivedFrom": "member_role | team_admin_default | system_admin_override | deny",
  "isOwner": "제거됨"
}
```

**변경 요약**

- `isOwner` 필드 제거
- `derivedFrom`의 가능한 값이 10개에서 4개로 축소
- `capabilities` 구조는 동일. `canDeleteBoard`의 산출 규칙만 소유자 여부에서 권한 등급 ≥ manage로 변경
- `effectivePermission`의 값 집합은 그대로 유지

**호환성**: `isOwner` 제거는 응답 축소다. 이 필드를 읽던 웹앱 코드도 같은 변경에서 제거되므로 클라이언트-서버 불일치는 발생하지 않는다. 플러그인은 서버와 웹앱이 한 번들로 배포되므로 버전 스큐가 없다.

## 3. 응답 헤더 변경

`GET /teams/{teamID}/boards`와 검색 엔드포인트가 진단용 헤더를 내보내고 있다. 전부 제거한다.

| 헤더 | 내용 |
|---|---|
| `X-Boards-Debug-TeamAccess` | 팀 접근 가능 여부 |
| `X-Boards-Debug-IsGuest` | 게스트 여부 |
| `X-Boards-Debug-IsCEO` | 전체공개 직위 보유 여부 |
| `X-Boards-Debug-BoardsCount` | 반환 보드 수 |
| `X-Boards-Debug-OrgContextSource` | 조직 컨텍스트 출처 |
| `X-Boards-Debug-OrgUnitIds` | 사용자 부서 목록 |
| `X-Boards-Debug-PositionCodes` | 사용자 직위 목록 |
| `X-Boards-Debug-FullVisibilityPositionIds` | 전체공개 직위 목록 |
| `X-Boards-Debug-IsCEO-FromProps` | 전체공개 판정 근거 |
| `X-Boards-Debug-IsCEO-FromFallback` | 전체공개 판정 근거 |

## 4. 동작이 바뀌는 엔드포인트

경로와 스키마는 그대로이고 결과만 달라진다.

| 메서드 | 경로 | 변화 |
|---|---|---|
| DELETE | `/boards/{boardID}` | 보드 관리자·팀 관리자·시스템 관리자가 삭제 가능해진다. 기존에는 소유자만 가능했다 |
| GET | `/teams/{teamID}/boards` | 접근 권한·전체공개로 확장되던 보드가 결과에서 빠진다 |
| POST | `/boards/search`, `/teams/{teamID}/boards/search` | 위와 동일 |
| DELETE | `/boards/{boardID}/members/{userID}` | 소유자 제거 금지 예외가 사라진다 |
| PUT | `/boards/{boardID}/members/{userID}` | 소유자 역할 변경 금지 예외가 사라진다 |

## 5. 내부 인터페이스 변경

### PermissionsService

```go
type PermissionsService interface {
    HasPermissionTo(userID string, permission *mmModel.Permission) bool
    HasPermissionToTeam(userID, teamID string, permission *mmModel.Permission) bool
    HasPermissionToChannel(userID, channelID string, permission *mmModel.Permission) bool
    HasPermissionToBoard(userID, boardID string, permission *mmModel.Permission) bool
    GetBoardPermissions(userID, boardID string) (*model.BoardPermissionsResponse, error)
    // ResolveOrgContext 제거
}
```

### Store

```go
type Store interface {
    // ...
    // GetBoardsInTeam(teamID string, onlyWithACL bool) 제거
    // GetBoardsInUserTeams(userID string, onlyWithACL bool) 제거
}
```

두 인터페이스 변경 모두 목 재생성(`make generate`)을 요구한다.

### model 패키지 공개 함수

| 함수 | 변경 |
|---|---|
| `BuildCapabilities(permission EffectiveBoardPermission, isOwner bool)` | → `BuildCapabilities(permission EffectiveBoardPermission)` |
| `PermissionSatisfies(effective, required)` | `DeleteBoard` 하드 차단 제거 |
| `ResolveBoardOwnerUserID(board *Board)` | 삭제 |
| `ParseBoardACLFromProperties`, `EvaluateBoardACLEntries`, `HasOrgScopedACLEntries` | 삭제 |
