# 계약: 팀원 소속 조회 API

**Feature**: `005-org-scoped-properties`

사람 선택지를 조직으로 좁히려면 화면이 각 사용자의 소속을 알아야 한다. 조직
마스터(본부·부서 목록)는 이미 `GET /teams/{teamID}/org-units`로 내려오지만,
**어떤 사용자가 어디 소속인지**는 노출되지 않는다. 이 계약이 그 하나를 더한다.

기존 조직 조회 계약은 `specs/002-card-property-access/contracts/org-master-api.md`에
있다. 문턱과 근거는 그쪽을 따른다.

---

## 엔드포인트

```
GET /plugins/focalboard/api/v2/teams/{teamID}/org-profiles
```

`server/api/org.go`에 등록한다. 조직 관련 읽기 전용 경로가 모인 자리다.

### 문턱

팀 열람 권한(`PermissionViewTeam`). 같은 파일의 `org-units`·`duties`와 같다.

### 요청

파라미터 없음.

### 대상

그 팀의 활성 멤버 중 **봇을 제외한 전원**. `TeamMembers`에서 얻으며 요청자 자신도
포함한다.

### 응답 200

```json
[
  {"userId": "kgxikzmnetb8zku7pzsayfbk1w", "orgUnitId": "o9hrktz6tbgn3c74hsyzoc57nh"},
  {"userId": "3699rjzi1irabmc57hsfcptjpa", "orgUnitId": "ndrn1qq69b8btpgohrez3m1khy"}
]
```

| 필드 | 뜻 |
|---|---|
| `userId` | 사용자 ID |
| `orgUnitId` | 그 사용자가 속한 조직 단위 ID. 본부일 수도 부서일 수도 있다 |

**소속이 없는 사용자는 목록에 나오지 않는다.** 빈 `orgUnitId`를 돌려주지 않고
행 자체를 생략한다 — "소속 없음"과 "빈 문자열 소속"을 화면이 구별할 필요가 없다.

### 응답 403

팀을 열람할 수 없을 때.

### 응답 200 (빈 배열)

조직 관리 기능이 꺼져 있거나 이 팀에 소속 정보가 하나도 없을 때. 오류가 아니다 —
화면은 좁히지 않는 상태로 동작한다.

---

## 범위 — 왜 팀 단위인가

사람 선택기는 보드 사용자만 보여주지 않는다. `webapp/src/components/personSelector.tsx`의
`loadOptions`는 `allowAddUsers`가 참이면 `client.searchTeamUsers()`로 **팀 전체를
서버 검색**하고, 결과를 "보드 멤버"와 "보드 멤버 아님"으로 나눠 보여준다.
`allowAddUsers`는 공개 보드(`type=O`)이거나 멤버 관리 권한이 있으면 참이므로,
검증 대상인 FY27 KKV OKR 보드가 정확히 그 경우다.

보드 단위로 소속을 내려보내면 **검색으로 새로 나타나는 사용자의 소속을 알 수 없어**
좁힘이 성립하지 않는다. 후보 풀이 팀 전체이므로 소속 데이터도 같은 범위여야 한다.

노출은 이미 있는 조직 조회와 같은 수준이다. `org-units`·`duties`가 팀 열람 문턱으로
조직 이름을 내려보내고 있고, 메인 서버의 `org-profile-summary`가 팀원에게 소속을
보여준다(`server/api/org.go` 주석). 이 계약은 그 경계를 넓히지 않는다.

---

## 레이어

constitution 원칙 II(API → App → Store)를 지킨다.

```
server/api/org.go        핸들러 — 권한 확인, 대상 사용자 결정, 직렬화
server/app/org_master.go GetUserOrgProfiles(teamID, userIDs)  ← 이미 있음
server/services/store/   UserOrgProfiles 조회                  ← 이미 있음
```

**App·Store에 새 메서드를 만들지 않는다.** `GetUserOrgProfiles`가 이미
`(teamID, userIDs)`를 받아 맵을 돌려준다.

---

## 캐시

화면은 팀에 진입할 때 한 번 받아 `store/orgMaster`에 보관한다. 이미 org-units·
duties를 팀 단위로 받는 `fetchOrgMaster`에 얹으면 요청 시점이 늘지 않는다.

소속이 바뀌면 다음에 보드를 열 때 반영된다. 실시간 갱신은 하지 않는다 — 조직
개편은 드물고, 이 데이터가 낡아도 잘못된 선택지가 잠시 보일 뿐 저장은 막히지
않는다(서버가 값을 검증하지 않으므로).
