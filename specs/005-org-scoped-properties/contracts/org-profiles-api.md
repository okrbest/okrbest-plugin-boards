# 계약: 보드 사용자 소속 조회 API

**Feature**: `005-org-scoped-properties`

사람 선택지를 조직으로 좁히려면 화면이 각 사용자의 소속을 알아야 한다. 조직
마스터(본부·부서 목록)는 이미 `GET /teams/{teamID}/org-units`로 내려오지만,
**어떤 사용자가 어디 소속인지**는 노출되지 않는다. 이 계약이 그 하나를 더한다.

기존 조직 조회 계약은 `specs/002-card-property-access/contracts/org-master-api.md`에
있다. 문턱과 근거는 그쪽을 따른다.

---

## 엔드포인트

```
GET /plugins/focalboard/api/v2/boards/{boardID}/org-profiles
```

`server/api/org.go`에 등록한다. 조직 관련 읽기 전용 경로가 모인 자리다.

### 문턱

보드 열람 권한(`PermissionViewBoard`). 팀 단위가 아니라 보드 단위인 이유는
아래 "범위"에 있다.

### 요청

파라미터 없음.

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

보드를 열람할 수 없을 때.

### 응답 200 (빈 배열)

조직 관리 기능이 꺼져 있거나 이 팀에 소속 정보가 하나도 없을 때. 오류가 아니다 —
화면은 좁히지 않는 상태로 동작한다.

---

## 범위 — 왜 보드 단위인가

응답에 담는 사용자는 **그 보드가 사람 선택기에 이미 보여주는 사용자**로 한정한다.

팀 단위(`/teams/{teamID}/org-profiles`)로 만들 수도 있고 구현은 더 짧다. 그렇게
하지 않는 이유는 노출 범위다. 비공개 보드의 멤버 셋이 팀 전체 65명의 소속을 받을
이유가 없다. 사람 선택기의 원본이 보드 단위(`getBoardUsers`)이므로 보드 단위가
필요한 만큼과 정확히 일치한다.

공개 보드에서는 두 범위가 사실상 같아진다. 그래도 계약을 좁은 쪽으로 정의해 두면
나중에 보드 성격이 바뀌어도 노출이 따라 넓어지지 않는다.

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

화면은 보드를 열 때 한 번 받아 `store/orgMaster`에 보관한다. 조직 마스터와 같은
수명이다.

소속이 바뀌면 다음에 보드를 열 때 반영된다. 실시간 갱신은 하지 않는다 — 조직
개편은 드물고, 이 데이터가 낡아도 잘못된 선택지가 잠시 보일 뿐 저장은 막히지
않는다(서버가 값을 검증하지 않으므로).
