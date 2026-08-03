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

## 요청 4 — 조직 정보 미등록 사용자 정리 (우선순위: 상 · 운영)

### 문제

**코드 문제가 아니라 데이터 문제다.** 2026-08-03 로컬 개발 DB 기준:

```
UserOrgProfiles 행       15
  PrimaryOrgUnitID 있음  15
  PrimaryDutyID 있음      9   ← 팀장 6, 본부장 3
  PrimaryPositionID 있음  8
활성 사용자              20   ← 5명은 행 자체가 없다
```

Boards의 속성 기준 접근 권한은 **조직 정보가 없는 사용자를 접근 불가로 처리한다**(FR-021, 의도된 동작). 규칙을 켠 보드에서 그 5명은 해당 카드를 통째로 볼 수 없게 된다.

### 요청

기능을 실사용 전환하기 전에 전 사용자의 조직 배정을 채워달라. 특히:

- `UserOrgProfiles` 행이 없는 사용자 5명
- `PrimaryDutyID`가 비어 있는 사용자 6명 — 직책 조건이 걸린 규칙에서 제외된다

### 참고

Boards 쪽에는 별도 안전장치를 두지 않기로 확정했다. 보드 관리자는 규칙을 우회해 항상 전체 접근이 가능하므로 잘못 설정해도 복구 경로가 있다.

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
| 4 | **조직 정보 미등록 사용자 정리** | **상** | **해당 사용자가 규칙 적용 카드를 못 본다** |
| 5 | 기능 플래그 연동 정책 확인 | 하 | 플래그와 무관하게 동작 |

**요청 4만 실사용 전에 반드시 필요하다.** 1~3·5는 구조 개선이며 지금 없어도 기능은 완성된다.
