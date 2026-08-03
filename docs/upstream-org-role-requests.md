# 메인 서버 조직 관리(Org Role Management) 개선 요청

- 작성일: 2026-08-03
- 요청 주체: `okrbest/okrbest-plugin-boards` (Boards 플러그인)
- 대상: `okrbest/okrbest` — `server/channels/api4/team.go`, `server/channels/app/org_role.go`, `server/public/model/org_role.go`
- 계기: `specs/002-card-property-access` (속성 기준 카드 접근 권한) 구현

## 배경

Boards 플러그인이 카드 단위 접근 권한을 판정하려면 사용자의 **본부·부서·직책**을 알아야 한다. 그 데이터는 메인 서버의 조직 관리 기능이 소유한다.

| 테이블 | 소유 | 플러그인 사용 |
|---|---|---|
| `OrgUnits` | 메인 서버 | 읽기 전용 |
| `PositionDefinitions` | 메인 서버 | 읽기 전용 (`kind='duty'`만) |
| `UserOrgProfiles` | 메인 서버 | 읽기 전용 |

**현재 플러그인은 이 세 테이블을 같은 DB에서 직접 SELECT 한다.** 저장소 관례상 문제는 없다 — 플러그인은 이미 `sqlstore/user.go`의 `baseUserQuery`로 `Users`를, `searchUsersByTeam`으로 `TeamMembers`를 직접 읽는다. 쓰기·마이그레이션은 하지 않으며 스키마 소유권은 메인 서버에 둔다.

아래는 그럼에도 메인 서버 쪽에서 해주면 좋은 것들이다. **전부 선택 사항이며, 없어도 플러그인 기능은 동작한다.**

---

## 요청 1 — 마스터 목록 읽기 권한 완화 (우선순위: 중)

### 문제

`getTeamOrgUnits`·`getTeamPositions`가 `requireOrgRoleManagement`를 요구한다.

```go
// server/channels/api4/team.go
hasSystemPermission := c.App.SessionHasPermissionTo(..., model.PermissionSysconsoleReadUserManagementTeams)
hasTeamPermission   := c.App.SessionHasPermissionToTeam(..., model.PermissionManageTeamRoles)
```

즉 **팀 관리자 이상**만 조직 목록을 읽을 수 있다.

Boards의 규칙 편집 화면은 **보드 관리자**(`ManageBoardRoles`)면 열려야 한다. 보드 관리자가 팀 관리자가 아닌 경우가 일반적이므로, 이 API로는 셀렉터를 채울 수 없다.

### 현재 대응

플러그인이 자체 읽기 전용 경로를 만들어 DB를 직접 읽는다.

```
GET /plugins/focalboard/api/v2/teams/{teamID}/org-units
GET /plugins/focalboard/api/v2/teams/{teamID}/duties
```

권한 기준은 **팀 조회 가능**(`PermissionViewTeam`)이다. 조직도의 부서명·직책명은 팀 구성원에게 기밀이 아니라고 판단했다.

### 요청

조직 **마스터 목록 조회**(이름·계층 수준)를 팀 구성원이 읽을 수 있게 열어달라. 두 가지 방식 중 편한 쪽:

- **A.** 기존 GET의 권한을 `PermissionViewTeam`으로 낮추고, 쓰기(POST·PUT)만 현행 유지
- **B.** 읽기 전용 경로를 따로 추가 — 예 `GET /teams/{team_id}/org-units/public`

반영되면 플러그인은 자체 경로를 유지하되 내부 구현을 메인 서버 호출로 바꿀 수 있다.

### 판단 근거

`getUserOrgProfileSummary`가 이미 **팀 구성원 읽기 가능**으로 열려 있고 `division_name`·`department_name`·`duty_name`을 반환한다. 즉 조직명 자체는 이미 팀 구성원에게 공개되는 정보다. 마스터 목록만 관리자 전용인 것은 일관되지 않는다.

---

## 요청 2 — `UserOrgProfileSummary`에 ID 포함 (우선순위: 하)

### 문제

`/teams/{team_id}/users/{user_id}/org-profile-summary`가 **이름만** 반환한다.

```go
type UserOrgProfileSummary struct {
    DivisionName   *string `json:"division_name"`
    DepartmentName *string `json:"department_name"`
    DutyName       *string `json:"duty_name"`
    PositionName   *string `json:"position_name"`
}
```

권한 판정에는 ID가 필요하다. 이름은 중복·변경될 수 있어 식별자로 쓸 수 없다.

### 현재 대응

플러그인이 `UserOrgProfiles`를 직접 읽어 `PrimaryOrgUnitID`·`PrimaryDutyID`를 얻는다.

### 요청

`UserOrgProfileSummary`에 대응 ID 필드를 추가해달라 — `division_id`, `department_id`, `duty_id`. 이름 옆에 ID를 얹는 것이라 기존 소비자에 영향이 없다.

**단, 이것만으로는 요청 3이 해결되지 않는다.** 이 경로는 사용자 1명씩만 조회한다.

---

## 요청 3 — 다건 조직 프로필 조회 (우선순위: 중)

### 문제

Boards는 **웹소켓 브로드캐스트 수신자별로** 카드 권한을 판정해야 한다. 수신자가 N명이면 N명의 조직 정보가 한 번에 필요하다.

현재 경로는 둘 다 부적합하다.

- `/users/{user_id}/org-profile-summary` — 1건씩. N회 호출은 비용이 곱해진다
- `/org-profiles` — 다건이지만 `requireOrgRoleManagement`(관리자 전용)

### 현재 대응

플러그인이 `UserOrgProfiles`를 `WHERE TeamID = ? AND UserID IN (...)`로 한 번에 읽는다.

### 요청

팀 구성원이 호출할 수 있는 **다건 조회**를 추가해달라.

```
POST /teams/{team_id}/org-profiles/by-ids
Body: ["userId1", "userId2", ...]
```

응답은 요청 2의 ID 포함 요약 형태면 충분하다. 권한은 `PermissionViewTeam` + 각 대상에 대한 `UserCanSeeOtherUser` 검사.

---

## 요청 4 — 조직 정보 미등록 사용자 정리 ~~(우선순위: 상 · 운영)~~ **철회**

**2026-08-03 철회.** 메인 서버 검토(부록 A-0 항목 4)의 지적이 옳았고, Boards 쪽에서 재검증해 확인했다.

```
활성 사용자 20 = 봇 5 + 사람 15
kkv 팀 멤버(봇 제외) 15 / UserOrgProfiles 보유 15 / 누락 0
```

**원인**: 분모를 잘못 잡았다. `UserOrgProfiles`는 팀 단위 테이블이므로 분모는 전체 사용자가 아니라 **팀 멤버**이며, 여기에 봇 5개가 섞여 있었다. 누락은 0명이다.

`PrimaryDutyID`가 빈 6명도 결손이 아니다 — 직책(팀장·본부장)은 전원이 갖는 값이 아니다. 사원에게 직책이 없는 것이 정상이며, Boards 설계에서도 직책은 관문이 아니라 가산 조건이다(FR-018). 직책 없는 사용자도 조직 조건만으로 권한을 얻는다.

**따라서 실사용 전환 전에 필요한 데이터 작업은 없다.**

---

## 요청 5 — 기능 플래그 연동 정책 확인 (우선순위: 하)

조직 관리 API는 전부 `FeatureFlags.EnableOrgRoleManagement` 뒤에 있다(기본 켜짐, 꺼지면 `501`).

Boards는 **DB를 직접 읽으므로 이 플래그의 영향을 받지 않는다.** 플래그가 꺼진 상태에서도 속성 기준 접근 권한이 계속 동작한다.

### 확인이 필요한 것

플래그를 끄는 것이 "조직 관리 기능 전체를 비활성화"를 뜻한다면, Boards도 규칙 평가를 멈추는 게 맞다. 반대로 "관리 화면만 감춘다"는 뜻이라면 현행이 맞다.

정책이 정해지면 Boards가 그에 맞춰 플래그를 읽도록 하겠다.

---

## 요약

| # | 요청 | 우선순위 | 없으면 |
|---|---|---|---|
| 1 | 마스터 목록 읽기 권한 완화 | 중 | 플러그인이 DB 직접 읽기 유지 |
| 2 | `UserOrgProfileSummary`에 ID 포함 | 하 | 동일 |
| 3 | 다건 조직 프로필 조회 경로 | 중 | 동일 |
| 4 | ~~조직 정보 미등록 사용자 정리~~ | **철회** | — (근거 오류, 누락 0명) |
| 5 | 기능 플래그 연동 정책 확인 | 하 | 플래그와 무관하게 동작 |

**필수 항목은 없다.** 요청 4가 철회되면서 실사용 전에 반드시 필요한 작업이 사라졌다. 1~3은 구조 개선이며 지금 없어도 Boards 기능은 완성된다. 5는 정책 결정이다.

---

# 부록 A — 메인 서버 작업계획서

- 작성일: 2026-08-03
- 작성 근거: `okrbest/okrbest` 저장소 소스 직접 대조 + 개발 DB 실측
- 범위: **소스·설정 변경만.** 개발 DB 데이터 등록·보정 항목은 제외한다 (요청 4 — 아래 검증 결과 참조)
- 대상 저장소: `okrbest/okrbest` (메인 서버). 이 계획을 실행하는 주체는 메인 서버 쪽이며, Boards는 반영 후 후속 조치만 한다

## A-0. 검증 결과

| # | 문서 주장 | 검증 | 계획 포함 |
|---|---|---|---|
| 1 | `getTeamOrgUnits`·`getTeamPositions`가 팀 관리자 이상 요구 | **사실** — `requireOrgRoleManagement` (`api4/team.go:2006`) | T1 |
| 2 | `UserOrgProfileSummary`가 이름만 반환 | **사실** — `model/org_role.go:65` | T2 |
| 3 | `/org-profiles`가 관리자 전용 + 다건 부적합 | **사실** — `api4/team.go:2244`가 `ListUserOrgProfiles(teamID)`로 팀 전체를 반환. ID 필터·페이지네이션 없음 | T3 |
| 4 | 활성 사용자 20 중 5명 프로필 없음 | **근거 오류** — 20에 봇 5개가 포함돼 있었다. `UserOrgProfiles`는 팀 단위 테이블이므로 분모는 팀 멤버다. kkv 팀 멤버 15명 전원 프로필 보유, **누락 0명** | 제외 (데이터 항목) |
| 5 | 플래그가 API 전체를 501로 막음 | **사실** — `feature_flags.go:128` 기본 `true`, 개별 조회까지 501 | T4 |

요청 4 실측 (개발 DB, 2026-08-03):
```
UserOrgProfiles 행 15 / PrimaryOrgUnitID 15 / PrimaryDutyID 9 / PrimaryPositionID 8
users(deleteat=0) 20  ← 그중 봇 5
kkv 팀 멤버(활성·봇 제외) 15 / 프로필 없는 멤버 0
```
`PrimaryDutyID`가 빈 6명은 결손이 아니다 — 직책(팀장·본부장)은 전원이 갖는 값이 아니다.


## A-1. 작업 목록

### T1 — 조직 마스터 목록 읽기 권한 분리

**목적**: 규칙 편집 화면에서 보드 관리자가 본부·부서·직책 셀렉터를 채울 수 있게 한다 (요청 1).

**대상**: `server/channels/api4/team.go`

**주의 — 원문 제안 A(기존 권한 하향)는 채택하지 않는다.** `requireOrgRoleManagement`는 읽기·쓰기 핸들러 12개가 공유하며 감사 로그 조회(`getTeamOrgRoleAuditLogs`)도 포함한다. 여기를 낮추면 감사 로그까지 열린다. **읽기 전용 헬퍼를 분리한다.**

```go
// 신규. 기능 플래그 검사는 유지하고 권한만 팀 조회로 낮춘다.
func requireOrgRoleRead(c *Context) bool {
	if !c.App.Config().FeatureFlags.EnableOrgRoleManagement {
		c.Err = model.NewAppError("requireOrgRoleRead", "api.team.org_roles.feature_disabled.app_error", nil, "", http.StatusNotImplemented)
		return false
	}
	if !c.App.SessionHasPermissionToTeam(*c.AppContext.Session(), c.Params.TeamId, model.PermissionViewTeam) {
		c.SetPermissionError(model.PermissionViewTeam)
		return false
	}
	return true
}
```

호출부 교체 2곳:
- `getTeamPositions` (`team.go:2031`) — `requireOrgRoleManagement` → `requireOrgRoleRead`
- `getTeamOrgUnits` (`team.go:2108`) — 동일

쓰기(`createTeamPosition`·`updateTeamPosition`·`createTeamOrgUnit`·`updateTeamOrgUnit`)와 감사 로그는 **현행 유지**.

**부수 결정 필요**: `includeInactive=true` 쿼리 파라미터를 일반 구성원에게도 허용할지. 비활성 조직 단위 노출이 부담이면 읽기 경로에서는 `false`로 강제한다.

**검증**: 팀 관리자 아닌 일반 구성원 세션으로 `GET /api/v4/teams/{team_id}/org-units` 200 확인. 팀 비구성원은 403.

---

### T2 — `UserOrgProfileSummary`에 ID 필드 추가

**목적**: 이름 대신 ID로 권한을 판정한다 (요청 2). T3의 응답 계약이 여기에 의존하므로 **T3보다 먼저 끝나야 한다.**

**대상**: `server/public/model/org_role.go`, `server/channels/app/org_role.go`

구현 비용이 낮다 — `GetUserOrgProfileSummary`(`app/org_role.go:417`)가 이미 `profile`(ID 전부 보유)을 받아 이름만 추출해 버리고 있다.

```go
type UserOrgProfileSummary struct {
	TeamID string `json:"team_id"`
	UserID string `json:"user_id"`

	DivisionID     *string `json:"division_id"`     // 신규
	DivisionName   *string `json:"division_name"`
	DepartmentID   *string `json:"department_id"`   // 신규
	DepartmentName *string `json:"department_name"`
	DutyID         *string `json:"duty_id"`         // 신규
	DutyName       *string `json:"duty_name"`
	PositionID     *string `json:"position_id"`     // 신규
	PositionName   *string `json:"position_name"`
}
```

**주의 — `division_id`/`department_id` 분리는 원본 스키마와 1:1이 아니다.** `UserOrgProfile`의 소속 필드는 `PrimaryOrgUnitID` **하나**다. 부서에 배정된 사용자의 `division_id`는 부모를 거슬러 채워야 하며, 그 분기 로직은 이름을 채우는 기존 코드(`app/org_role.go:439-453`)에 이미 있다. 같은 `switch` 안에서 ID도 함께 대입한다.

**미결정**: `division_id`/`department_id`로 쪼갤지, `primary_org_unit_id` 하나만 노출할지. Boards의 규칙 스키마가 본부/부서를 구분해 저장한다면 전자가 맞다. **Boards 쪽에서 확정해 회신할 것.**

기존 소비자(이름만 읽는 UI)에는 영향이 없다 — 필드 추가일 뿐이다.

**검증**: `GET /api/v4/teams/{team_id}/users/{user_id}/org-profile-summary` 응답에 ID 4개 포함. 부서 배정자는 `division_id`·`department_id` 둘 다, 본부 직속 배정자는 `division_id`만 채워진다.

---

### T3 — 다건 조직 프로필 조회 경로 신설

**목적**: FR-029(실시간 변경 알림을 권한 있는 사용자에게만 전달) — 웹소켓 브로드캐스트 수신자 N명의 조직 정보를 한 번에 조회한다 (요청 3).

**대상**: `api4/team.go`, `app/org_role.go`, `store/sqlstore/org_role_store.go`

셋 중 가장 크다. 세 계층을 모두 건드린다.

**API 계약**
```
POST /api/v4/teams/{team_id}/org-profiles/by-ids
Body:     ["userId1", "userId2", ...]
Response: []UserOrgProfileSummary        // T2의 ID 포함 형태
```

**권한**: `PermissionViewTeam` + 대상별 `UserCanSeeOtherUser`. `getUserOrgProfileSummary`(`team.go:2202`)가 이미 쓰는 패턴을 그대로 따른다 — `ViewTeam` → `UserCanSeeOtherUser` → `GetTeamMember`.

**응답 정책**: 볼 수 없는 사용자는 403으로 전체를 실패시키지 말고 **응답에서 제외**한다. 브로드캐스트 필터링 용도이므로 부분 결과가 자연스럽다. 팀 멤버가 아니거나 프로필이 없는 사용자도 마찬가지로 생략한다 — 호출자는 "응답에 없으면 조직 정보 없음"으로 해석한다.

**배치 상한**: 요청 ID 개수 상한 **1000**, 초과 시 `400`.

값의 근거 — 메인 서버에서 상한을 둔 `by-ids` 계열은 전부 1000이다.

| 엔드포인트 | 상한 | 위치 |
|---|---|---|
| `POST /channels/{team}/ids` | 1000 | `maxListSize` 상수 (`api4/channel.go:18`, 사용 `:1861`) |
| `POST /channels/members/ids` | 1000 | 같은 상수 (`api4/channel.go:2084`) |
| `POST /posts/ids` | 1000 | 하드코딩 (`api4/post.go:645`) |
| `POST /users/ids` | 없음 | 빈 배열만 거절 (`api4/user.go:1047`) |
| `POST /teams/{team}/members/ids` | 없음 | 동일 (`api4/team.go:764`) |
| `POST /users/status/ids` | 없음 | ID 길이 검증만 (`api4/status.go:61`) |

**신규 상수를 선언하지 않는다.** `maxListSize`는 `package api4`의 패키지 스코프 상수이고 `team.go`도 같은 패키지이므로 임포트 없이 그대로 참조한다. 새로 만들면 같은 의미의 1000이 세 군데로 늘어난다. 상수를 공용 파일로 옮기는 리팩터도 하지 않는다 — upstream이 `channel.go`를 건드릴 때마다 충돌한다.

```go
userIDs, err := model.SortedArrayFromJSON(r.Body)   // 중복 제거 포함
if err != nil {
	c.Err = model.NewAppError("getOrgProfilesByIds", model.PayloadParseError, nil, "", http.StatusBadRequest).Wrap(err)
	return
} else if len(userIDs) == 0 {
	c.SetInvalidParam("user_ids")
	return
}
if len(userIDs) > maxListSize {
	c.Err = model.NewAppError("getOrgProfilesByIds",
		"api.team.org_profiles_by_ids.invalid_body.request_error",
		map[string]any{"MaxLength": maxListSize}, "", http.StatusBadRequest)
	return
}
```

**파싱은 반드시 `model.SortedArrayFromJSON`을 쓴다.** 이 헬퍼가 중복 ID를 제거한다(`model/utils.go:508-517` — "Remove duplicate IDs as it can bring a significant load to the database"). `json.Decode`로 직접 받으면 같은 ID를 1000번 보내는 증폭을 막지 못한다.

에러 메시지 i18n 키가 신규이므로 `server/i18n/en.json` 추가와 함께 `ko.json` 번역을 동반해야 한다 (constitution 원칙 V).

**참고 — 상한이 없어도 무한은 아니다.** 전역 요청 본문 제한이 기본 300,000바이트다(`ServiceSettings.MaximumPayloadSizeBytes`, `model/config.go:999`, 적용 `web/handlers.go:209-212`). ID 하나가 약 29바이트이므로 약 10,300개에서 `413`으로 잘린다. 개수 상한은 코드 상수, 바이트 상한은 설정값으로 관리 계층이 다르다 — 운영 중 조정 가능한 것은 후자뿐이다.

**성능 — 이 작업의 핵심 주의점**

기존 `GetUserOrgProfileSummary`를 N번 호출하면 안 된다. 그 함수는 사용자 1명마다 `ListOrgUnits`와 `ListPositionDefinitions`를 **각각 다시 조회**한다(`app/org_role.go:429`, `:458`). N명이면 마스터 조회가 2N회 발생한다.

다건 경로는 이렇게 구성한다:
1. `ListOrgUnits(teamID)` 1회 → `map[ID]*OrgUnit`
2. `ListPositionDefinitions(teamID)` 1회 → `map[ID]*PositionDefinition`
3. 신규 store 메서드로 프로필 일괄 조회 1회
4. 메모리에서 해석

**신규 store 메서드**
```go
// org_role_store.go — 기존 ListUserOrgProfiles(:210)를 복제해 ID 필터만 추가
func (ss *SqlStore) ListUserOrgProfilesByUserIDs(teamID string, userIDs []string) ([]*model.UserOrgProfile, error) {
	query := ss.getQueryBuilder().
		Select("TeamID", "UserID", "PrimaryPositionID", "PrimaryDutyID", "PrimaryOrgUnitID",
			"ExtraPositions", "EffectiveFrom", "EffectiveTo", "CreateAt", "UpdateAt").
		From("UserOrgProfiles").
		Where(sq.Eq{"TeamID": teamID, "UserID": userIDs})
	// ...
}
```

기존 `getTeamOrgProfiles`(`team.go:2244`, 관리자 전용·팀 전체 반환)는 **손대지 않는다.** 관리 화면 용도로 그대로 둔다.

**검증**: 일반 구성원 세션으로 팀 멤버 5명 ID를 보내 5건 수신. 다른 팀 사용자 ID를 섞으면 그 건만 빠진다. 상한 초과 시 400.

---

### T4 — 기능 플래그 의미 확정 (정책)

**목적**: 요청 5. **코드 변경 없음. 결정과 문서화만.**

현재 구현은 `EnableOrgRoleManagement`가 꺼지면 **조직 관리 API 전체**를 501로 막는다 — 관리 화면뿐 아니라 팀 구성원용 개별 조회(`getUserOrgProfileSummary`)까지 포함한다. 즉 설계 의도는 "관리 화면만 감춤"이 아니라 **"기능 전체 비활성화"**로 읽힌다.

이 해석을 채택하면 **Boards도 플래그가 꺼졌을 때 규칙 평가를 멈춰야 일관된다.**

메인 서버가 강제할 수단은 없다 — Boards는 DB를 직접 읽으므로 API 게이트를 우회한다. 따라서 Boards 쪽에서 플래그를 읽어 스스로 판단해야 한다. 플러그인은 `p.API.GetConfig()`로 접근할 수 있다 (`Config.FeatureFlags`는 `access:"*_read"`, `model/config.go:4002`).

**메인 서버 산출물**: 위 해석을 `server/channels/api4/team.go`의 `requireOrgRoleManagement` 주석과 spec 문서에 명시. **Boards 산출물**: 없음 — 부록 B-3의 결정 참조.

## A-2. 순서와 의존

```
T1 ──────────────► (독립)
T2 ──► T3          T3의 응답이 T2의 ID 포함 요약 형태
T4 ──────────────► (독립, 코드 변경 없음)
```

권장 순서: **T2 → T1 → T3 → T4**. T2가 가장 작고 T3의 선행이며, T1은 독립이라 언제든 끼울 수 있다.

규모 판단: T1·T2는 단일 PR로 처리 가능. **T3은 store 계층까지 내려가므로 `/speckit-specify`로 명세를 먼저 만드는 편이 낫다.**

## A-3. 반영 후 Boards 쪽 후속 조치

각 작업이 메인 서버에 반영된 뒤 Boards가 할 일이다. **반영 전에는 현행 DB 직접 읽기를 유지한다** — 기능은 이미 완성돼 있고 서두를 이유가 없다.

| 메인 서버 작업 | Boards 후속 |
|---|---|
| T1 | 자체 경로(`/teams/{teamID}/org-units`, `/duties`)는 유지하되 내부 구현을 메인 서버 호출로 교체. 외부 계약은 안 바뀐다 |
| T2 | 판정용 ID를 API에서 얻을 수 있게 된다. `UserOrgProfiles` 직접 SELECT 제거 가능 |
| T3 | 웹소켓 수신자 필터링의 `WHERE UserID IN (...)` 직접 조회를 API 호출로 교체 |
| T4 | **없음** — Boards는 플래그를 읽지 않기로 확정 (부록 B-3) |

**메인 서버가 Boards에 회신 요청하는 항목 1건**: T2의 필드 구성 — `division_id`/`department_id` 분리 vs `primary_org_unit_id` 단일. Boards 규칙 스키마가 본부와 부서를 구분해 저장하는지에 달려 있다.

---

# 부록 B — Boards 회신 (2026-08-03)

부록 A의 검토에 대한 Boards 쪽 응답이다.

## B-1. A-0 검증 결과 수용

| # | 서버 검토 | Boards 확인 |
|---|---|---|
| 1 | `requireOrgRoleManagement`가 팀 관리자 이상 요구 | 동의 |
| 2 | `UserOrgProfileSummary`가 이름만 반환 | 동의 |
| 3 | `/org-profiles`가 관리자 전용·ID 필터 없음 | 동의 |
| 4 | **요청 4는 근거 오류** | **재검증해 확인. 요청 철회.** 분모를 팀 멤버가 아닌 전체 사용자로 잡았고 봇 5개가 섞여 있었다 |
| 5 | 플래그가 개별 조회까지 501 | 동의 |

T1의 판단 — **원문 제안 A(기존 권한 하향)를 기각하고 읽기 전용 헬퍼 `requireOrgRoleRead`로 분리**한 것에 동의한다. `requireOrgRoleManagement`가 감사 로그 조회까지 공유한다는 지적을 놓쳤다. 분리가 맞다.

T1의 부수 결정(`includeInactive` 허용 여부)에 대한 의견: **읽기 경로에서는 `false`로 강제해도 무방하다.** Boards의 셀렉터는 활성 항목만 필요하다(FR-008). 비활성 조직에 걸린 기존 규칙은 판정 시점 매칭 실패로 흡수한다(FR-036).

## B-2. 회신 요청 항목 — T2 필드 구성

> `division_id`/`department_id`로 쪼갤지, `primary_org_unit_id` 하나만 노출할지.

**답: 쪼개주되, `primary_org_unit_id`도 함께 노출해달라.** 둘 다 필요하다.

**쪼개는 것이 맞는 이유** — Boards 규칙 스키마는 본부와 부서를 **별도 조건으로** 저장한다.

```jsonc
{ "divisionId": "...", "departmentId": "...", "dutyId": "...", "permission": "viewer" }
```

두 축은 독립적으로 지정·생략되며 각각 다른 매칭 규칙을 갖는다.

| 축 | 매칭 |
|---|---|
| 부서 | 사용자 소속과 **직접 일치** |
| 본부 | 사용자 소속의 **조상 집합에 포함** |

**원본도 필요한 이유** — 조상 판정이 계층 깊이에 의존하지 않아야 한다.

현재 조직도는 `division → department` 2단계뿐이고, 그 범위에서는 `division_id`/`department_id` 쌍이 조상 판정을 완전히 대체한다. 그러나 Boards 명세는 계층이 깊어질 수 있다고 보고 **일반형으로 판정**하기로 했다(FR-017, spec.md Edge Cases). 3단계 이상이 되면 편의 필드 두 개로는 표현되지 않는다.

`primary_org_unit_id`(원본)만 있으면 Boards가 스스로 조상을 계산할 수 있다 — 셀렉터용으로 `OrgUnits` 목록을 이미 받으므로 `parentId` 체인을 따라가면 된다.

**정리**

| 필드 | 용도 |
|---|---|
| `primary_org_unit_id` | **판정 기준.** Boards가 조상 집합을 계산해 본부·부서 조건을 모두 해결 |
| `division_id` · `department_id` | 편의 필드. 기존 UI 소비자와 2단계 전제가 유효한 호출자용 |
| `duty_id` | 직책 조건 판정 |
| `position_id` | Boards는 쓰지 않는다 (직위 배제, FR-024) |

**대안 제안**: 조상 계산을 서버가 맡는 게 낫다고 판단되면 `division_id`/`department_id` 대신 `ancestor_org_unit_ids: []string`(자신 포함, 루트까지)를 주는 방법도 있다. 계층 깊이와 무관하게 한 필드로 끝나고 Boards는 포함 여부만 보면 된다. 다만 기존 UI 소비자가 이름 필드를 쓰고 있으므로 **`division_id`/`department_id` 유지 + `primary_org_unit_id` 추가**가 변경 폭이 가장 작다.

## B-3. T4 — Boards 쪽 미결

부록 A-2가 T4를 "코드 변경 없음, 결정과 문서화만"으로 분류했으나, **Boards 쪽에는 동작 변경이 따른다.** 그리고 그 동작에 판단이 필요하다.

플래그가 꺼졌을 때 Boards가 규칙 평가를 멈추면, **이전에 숨겨져 있던 카드가 전부 다시 보인다.** 접근 제어 기능이 설정 플래그 하나로 열리는(fail-open) 구조가 된다.

세 가지 선택지가 있다.

| 안 | 플래그 off 시 동작 | 성격 |
|---|---|---|
| 열림 | 규칙 평가 중단 → 모든 카드가 보드 권한대로 | 부록 A 해석과 일관. **fail-open** |
| 잠김 | 규칙은 계속 평가, 규칙 편집 UI만 감춤 | 기밀 유지. 조직 데이터를 못 읽으면 전원 차단 위험 |
| 유지 | 플래그를 읽지 않는다 (현행) | 조직 관리 화면과 Boards 규칙이 독립적으로 동작 |

**Boards 결정 (2026-08-03): 「유지」 — 플래그를 읽지 않는다.**

근거는 둘이다.

1. **fail-open을 피한다.** 접근 제어 기능이 설정 플래그 하나로 열리면, 플래그를 끄는 사람이 카드 노출까지 열린다는 사실을 알기 어렵다. 의도치 않은 정보 노출 경로를 만들지 않는다.
2. **판정에 필요한 데이터는 플래그와 무관하게 유효하다.** 플래그가 막는 것은 API 표면이지 `OrgUnits`·`PositionDefinitions`·`UserOrgProfiles`의 내용이 아니다. 플래그가 꺼져도 조직 배정은 그대로 존재하므로 판정 결과가 달라질 이유가 없다.

즉 Boards의 규칙 평가는 조직 관리 화면의 노출 여부와 **독립적으로** 동작한다. 규칙을 끄고 싶으면 보드별 스위치(`propertyAccess.enabled`)를 쓴다 — 그쪽이 의도가 명확하고 보드 관리자가 직접 제어한다.

**메인 서버에 요청할 것은 없다.** 이 결정으로 T4의 Boards 산출물이 사라진다. 메인 서버는 플래그 의미를 문서화하는 것만 하면 된다.

## B-4. 반영 시점

부록 A-3의 판단에 동의한다. **T1~T3이 반영되기 전에는 현행 DB 직접 읽기를 유지한다.** Boards 기능 구현을 이 작업들에 묶지 않는다.

반영되면 A-3 표대로 내부 구현만 교체한다. 자체 경로(`/plugins/focalboard/api/v2/teams/{teamID}/org-units`, `/duties`)의 외부 계약은 바뀌지 않으므로 웹앱은 영향받지 않는다.

## B-5. T3 상한 1000·파싱 변경 검토 (2026-08-03)

서버 쪽에서 배치 상한을 200 → **1000**으로 올리고 `model.SortedArrayFromJSON` 사용을 명시한 데 대한 Boards 확인이다.

**결론: Boards 코드에 지금 필요한 변경은 없다.** T3은 아직 없고 부록 A-3·B-4대로 반영 전까지 DB 직접 읽기를 유지하므로, 상한 값은 현재 코드에 닿지 않는다.

### 전환 시점에 유효한 것 셋

| 서버 변경 | Boards 영향 |
|---|---|
| 상한 200 → 1000 | **완화.** 200이면 분할 로직을 고려해야 했으나 1000은 사실상 걸리지 않는다 |
| `SortedArrayFromJSON` = 정렬 | 응답 순서가 요청 순서와 다르다. **인덱스 대응 금지, `userId` 키 맵으로 받는다** |
| 볼 수 없는 사용자 응답 제외 | "응답에 없으면 조직 정보 없음". Boards의 FR-021과 이미 일치 |

**1000이 걸리지 않는 근거** — 수신자 수 상한은 보드 멤버 수다(`보드 멤버 ∩ 활성 리스너`). 개발 DB 실측: 명시 멤버 최대 22명, 채널 연동 synthetic 포함 최대 54명. 두 자릿수다.

### 중복 제거 지적은 Boards에도 유효하다

`SortedArrayFromJSON`을 강제한 이유(중복 ID의 DB 부하 증폭)가 Boards의 현재 구현에도 그대로 적용된다. 웹소켓 필터가 `WHERE TeamID = ? AND UserID IN (...)`를 쓰기 때문이다.

`getUserIDsForTeamAndBoard`(`server/ws/plugin_adapter.go:215`)를 확인한 결과 **반환 경로 둘의 중복 보장이 다르다**. `ensureUserIDs`가 있으면 맵으로 dedup하지만, 없으면 nested loop의 `append` 결과를 그대로 반환한다. **블록 브로드캐스트가 후자를 탄다.**

실제로 중복이 생기지는 않는다 — 상류 `getMembersForBoard`가 implicit를 explicit에 대해 걸러내고 explicit는 PK로 유일하기 때문이다. 그러나 그 보장이 두 계층 아래 우연에 의존한다.

**조치**: Boards 과제 T043에 "조직 정보 일괄 조회 전 수신자 ID 중복 제거"를 명시했다. `research.md` R3에도 근거를 남겼다. 메인 서버에 요청할 것은 없다.

## B-6. T3 전환 계약 확인 — 및 통합 표면 문제 (2026-08-03)

서버가 정리한 전환 계약 2건에 대한 Boards 확인이다. **둘 다 수용하되, 계약 2에서 파생되는 문제 하나를 제기한다.**

### 계약 1 — 1000 초과 시 400

**청킹 로직을 넣지 않는다.** 수신자 수 상한이 보드 멤버 수이고(`보드 멤버 ∩ 활성 리스너`), 개발 DB 실측 최대 54명이다. 세 자릿수 여유가 있어 방어 코드의 값이 비용을 넘지 않는다.

대신 상한을 **넘었을 때 조용히 실패하지 않도록** 한다. 400을 받으면 로그에 수신자 수와 함께 남기고, 그 브로드캐스트는 보수적으로 처리한다(권한 판정 불가 → 전송하지 않음). 접근 제어이므로 fail-closed다.

### 계약 2 — 응답 개수 < 요청 개수

수용한다. 응답을 **`user_id` 키 맵으로 받고, 요청 순서·개수에 어떤 가정도 두지 않는다.** `len(resp) == len(req)` 같은 검증을 넣지 않는다.

응답에서 빠지는 사유는 셋이다 — 서버의 중복 제거, 볼 수 없는 사용자, 프로필 없는 사용자.

### 파생 문제 — Boards가 T3을 부를 수단이 없다

계약 2의 `UserCanSeeOtherUser`를 검토하다 확인한 것이다.

**1. 플러그인 통합 표면에 api4가 없다.**

Boards가 메인 서버 데이터를 얻는 경로는 `plugin.API`를 감싼 Go 메서드뿐이다(`server/api_adapter.go`). 확인 결과:

- `server/public/plugin/api.go`에 조직 관련 메서드가 **하나도 없다**
- `PluginHTTP`는 주석대로 *"inter-plugin requests to plugin APIs"* — 플러그인 간 호출용이며 api4 호출용이 아니다

따라서 T1~T3을 api4에만 추가하면 **부록 A-3의 "내부 구현을 메인 서버 호출로 교체"가 실행 불가능하다.** Boards는 계속 DB를 직접 읽게 된다.

**2. 권한 모델이 브로드캐스트 맥락과 안 맞는다.**

`UserCanSeeOtherUser`는 요청 사용자 관점의 검사인데, Boards가 T3을 쓰는 지점은 웹소켓 팬아웃이라 "요청 사용자"가 없다.

| 호출 주체 | 결과 |
|---|---|
| 변경을 일으킨 사용자 세션 | 그가 못 보는 수신자가 응답에서 빠짐 → Boards는 "조직 정보 없음"으로 해석 → **잘못된 차단** |
| 봇·시스템 토큰 | `UserCanSeeOtherUser`가 무의미해짐 |

계약 2를 그대로 따르면 **성격이 다른 두 사유가 같은 신호로 뭉개진다** — "조직 정보가 없다"(차단이 맞다)와 "호출자가 볼 권한이 없다"(차단이 아니다).

### 제안

셋 중 택일이라고 본다. **Boards는 A를 권한다.**

| | 방식 | 평가 |
|---|---|---|
| **A** | **현행 유지** — Boards가 DB를 계속 직접 읽는다. T1~T3은 다른 소비자(웹 클라이언트 등)를 위해 만들고 Boards는 쓰지 않는다 | 추가 작업 없음. 이미 동작하며 권한 맥락 불일치도 없다. `sqlstore/user.go`가 `Users`를 직접 읽는 기존 관례와 동일 |
| B | `plugin.API`에 조직 조회 메서드 추가 | 계층은 깔끔하지만 메인 서버의 플러그인 API 확장이 필요하고, 조직 기능이 Mattermost 코어 API 표면에 올라간다 |
| C | T3에서 `UserCanSeeOtherUser`를 선택적으로 만든다 (시스템 호출용 우회) | 권한 검사를 약화시키는 방향이라 권하지 않는다 |

**A를 택하면 이 문서의 T1~T3은 "다른 소비자를 위한 개선"으로 성격이 바뀐다.** Boards는 요청자가 아니게 되므로, 메인 서버가 그 작업의 우선순위를 자체 판단으로 정하면 된다.

이 판단은 메인 서버 쪽 회신을 받아 확정한다. 그때까지 Boards는 DB 직접 읽기로 구현을 진행한다 — 어느 결론이든 지금 코드가 버려지지 않는다.
