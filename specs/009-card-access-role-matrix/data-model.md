# 데이터 모델: 카드 접근 권한을 역할 매트릭스로 정한다

저장 자리가 둘이다. 새 테이블도 마이그레이션도 없다 — 둘 다 이미 있는 JSON 칸을 쓴다.

| 무엇 | 어디 | 왜 |
|---|---|---|
| 직책 묶음 | `focalboard_teams.settings.dutyTiers` | 회사 조직 구조라 팀 공통 (FR-011a) |
| 규칙·매트릭스 | `board.properties.propertyAccess` | 보드마다 다를 수 있다 |

## 1. 저장 형태 — 팀

```jsonc
// focalboard_teams.settings
{
  "dutyTiers": [
    {"id": "tier-1", "name": "대표",    "dutyIds": ["duty-ceo"]},
    {"id": "tier-2", "name": "C-Level", "dutyIds": ["duty-cso", "duty-coo", "duty-cfo", "duty-cgo"]},
    {"id": "tier-3", "name": "팀장",    "dutyIds": ["duty-tl"]},
    {"id": "tier-4", "name": "팀원",    "dutyIds": ["duty-member"]}
  ]
}
```

`Team.Settings`는 `map[string]interface{}`고 `upsertTeamSettings`가 이미 있다
([team.go:59](../../server/services/store/sqlstore/team.go#L59)). 다른 키를 쓰는 값이 있어도
`dutyTiers`만 읽고 쓴다 — `board.properties`를 여러 기능이 나눠 쓰는 것과 같다.

## 2. 저장 형태 — 보드

```jsonc
{
  "propertyAccess": {
    "enabled": true,
    "updatedBy": "...",
    "updatedAt": 0,

    "rules": [
      {
        "id": "rule-1",
        "propertyId": "prop-type",
        "propertyValueIds": ["opt-objective", "opt-key-result"],  // 새로 생김 (FR-008)
        "propertyValueId": "",                                     // 기존 — 한 값짜리
        "tierId": "tier-3",                                        // 새로 생김 (FR-011)
        "dutyId": "",                                              // 기존 — 직책 하나
        "relation": "sameDivision",                                // 새로 생김 (FR-002)
        "orgPropertyId": "prop-division",                          // 새로 생김 (FR-006)
        "assigneePropertyId": "",                                  // 새로 생김 (FR-006)
        "divisionId": "",                                          // 기존 — 절대값
        "departmentId": "",                                        // 기존 — 절대값
        "permission": "viewer",
        "source": "matrix"                                         // 새로 생김 (FR-021)
      }
    ]
  }
}
```

## 3. 필드가 서로를 이기는 순서

새 필드와 기존 필드가 겹치는 자리가 셋이다. **읽는 쪽이 새 필드를 먼저 보고, 없으면 기존
필드로 떨어진다.** 기존 보드는 새 필드가 전부 비어 있으므로 지금과 똑같이 읽힌다(FR-001, FR-016).

| 축 | 새 필드 | 기존 필드 | 규칙 |
|---|---|---|---|
| 카드 값 | `propertyValueIds` | `propertyValueId` | 새 필드가 비어 있지 않으면 그것을 쓴다 |
| 직책 | `tierId` | `dutyId` | `tierId`가 있으면 그것을 쓴다 |
| 조직 | `relation` | `divisionId` · `departmentId` | `relation`이 있으면 절대값 두 칸을 **무시한다** |

셋째만 "무시"다. 관계와 절대값이 같은 축을 두고 다투므로 둘을 함께 적용하면 어느 쪽이
답인지 규칙을 읽어서는 알 수 없다.

## 4. 직책 묶음

| 필드 | 뜻 |
|---|---|
| `id` | 규칙이 가리키는 값 |
| `name` | 사람이 읽는 이름. 매트릭스의 열 제목이 된다 |
| `dutyIds` | 조직 마스터의 직책 ID들 |

- 순서가 없다. 등급이 아니다 (FR-013).
- `dutyIds`가 하나뿐인 묶음도 여럿인 묶음과 똑같이 취급한다 (FR-013).
- 한 직책이 여러 묶음에 들 수 있다. 걸린 규칙 중 가장 높은 권한이 간다 (FR-014).
- 마스터에 없는 직책 ID가 남아 있어도 지우지 않는다. 아무에게도 안 걸릴 뿐이다 —
  마스터는 메인 서버 소유다.

### 누가 읽고 누가 고치나 (FR-011b)

| | 읽기 | 고치기 | 판정 |
|---|---|---|---|
| 시스템 관리자 | ✅ | ✅ | `HasPermissionTo(userID, PermissionManageSystem)` |
| 팀 관리자 | ✅ | ✅ | `HasPermissionToTeam(userID, teamID, PermissionManageTeam)` |
| 보드 관리자 | ✅ | ❌ | `ManageBoardRoles` — 규칙을 짜려면 묶음을 봐야 한다 (FR-011c) |
| 그 외 | ❌ | ❌ | |

`boards.go:650`이 이미 **팀 관리자를 보드 관리자로 올려준다.** 팀 관리자에게 편집을 주는
것이 기존 규칙과 어긋나지 않는다.

클라이언트는 팀 관리자 여부를 직접 못 본다 — `IUser.roles`는 시스템 역할만 담는다. 서버가
묶음을 내려줄 때 `canEdit` 플래그를 함께 준다.

## 5. 관계

| 값 | 뜻 | 읽는 속성 |
|---|---|---|
| `""` | 관계를 안 쓴다. 절대값으로 읽는다 | — |
| `any` | 조직을 안 따진다 | — |
| `sameDivision` | 카드의 본부 = 내 본부 | `orgPropertyId` |
| `otherDivision` | 카드의 본부 ≠ 내 본부 | `orgPropertyId` |
| `sameDepartment` | 카드의 부서 = 내 부서 | `orgPropertyId` |
| `mine` | 내가 만들었거나 내가 담당자 | `assigneePropertyId` |

**성립 판정** (research R3)

- `sameDivision` · `sameDepartment` — 카드 값이 내 소속 단위의 조상 집합에 있다
- `otherDivision` — 양쪽 다 값이 있고, 카드 값이 조상 집합에 **없다**
- `mine` — 카드 작성자가 나이거나, `assigneePropertyId` 속성에 내 ID가 있다
- 어느 쪽이든 비교할 값이 없으면 성립하지 않는다 (FR-007)

`any`와 `""`는 판정 결과가 같지만 구분한다. `""`는 "관계를 안 쓰는 옛 규칙"이고 `any`는
"관계를 쓰는데 조직을 안 따진다"이다. 후자는 `gated`로 센다 — 매트릭스 대표 열이 여기
해당한다.

## 6. 검증

저장할 때 막는 것들이다. 지금 `validatePropertyAccessSettings`가 하는 일에 넷을 더한다.

| 검사 | 이유 |
|---|---|
| `relation`이 목록에 없는 값이면 거절 | 모르는 관계를 통과시키면 판정이 조용히 달라진다 |
| `relation`이 본부·부서 계열인데 `orgPropertyId`가 비면 거절 | 볼 속성이 없으면 절대 성립하지 않아 죽은 규칙이 된다 |
| `relation=mine`인데 `assigneePropertyId`가 비면 **통과** | 작성자만으로 판정된다. 담당자 속성은 선택이다 |
| 사람 쪽 조건이 하나도 없으면 거절 (기존) | 모두에게 권한을 주는 줄은 실수다 |

**`tierId`가 팀의 묶음에 없어도 거절하지 않는다.** 묶음은 팀이, 규칙은 보드가 가지므로
저장 시점이 다르다. 팀 관리자가 묶음을 지우면 그 묶음을 쓰던 보드의 규칙이 저장된 채로
남는데, 그 보드를 저장할 때 400을 내면 관계없는 편집까지 막힌다. 그런 규칙은 아무에게도
안 걸리고 화면이 깨진 규칙으로 표시한다 (FR-024).

묶음 쪽 검증은 따로다.

| 검사 | 이유 |
|---|---|
| 고칠 권한이 없으면 거절 | FR-011b |
| `name`이 비면 거절 | 매트릭스 열 제목이 빈칸이 된다 |
| `dutyIds`에 마스터에 없는 ID가 있어도 **통과** | 마스터가 메인 서버 소유라 저장 시점에 맞다고 보장할 수 없다 — 002가 조직·직책 ID를 검사하지 않는 것과 같다 |

## 7. 표준 프리셋

카드 접근 권한을 처음 켤 때 깔리는 여섯 줄이다 (FR-019). 유형 속성과 값은 OKR 사다리
설정(`board.properties.okrBoard`)에서 읽는다. 직책 묶음은 사용자가 만든다 — 이름으로
추정하지 않는다 (research R9).

**팀에 묶음이 아직 없으면** 규칙은 깔리되 `tierId`가 빈 채로 남고 아무에게도 안 걸린다.
화면이 "묶음부터 정하세요"를 띄운다.

| # | 카드 값 | 묶음 | 관계 | 권한 |
|---|---|---|---|---|
| 1 | 세 값 전부 | 대표 | `any` | 편집 |
| 2 | 세 값 전부 | C-Level | `sameDivision` | 편집 |
| 3 | 세 값 전부 | C-Level | `otherDivision` | 댓글 |
| 4 | Objective, Key Result | 팀장, 팀원 | `sameDivision` | 조회 |
| 5 | Tasks | 팀장 | `sameDepartment` | 편집 |
| 6 | Tasks | 팀원 | `mine` | 편집 |

4번이 묶음 둘을 가리킨다. 규칙 한 줄이 묶음 하나만 가리키므로 실제로는 두 줄이 된다 —
표에서는 한 칸 행위로 보이고 저장은 두 줄이다. 여섯 칸이 일곱 줄이 되는 자리다.

## 8. API

묶음이 팀에 있으므로 읽고 쓰는 길이 필요하다. 규칙은 지금처럼 보드 저장에 실려 간다.

| 메서드 | 경로 | 하는 일 |
|---|---|---|
| `GET` | `/teams/{teamID}` | 이미 있다. 응답의 `settings`에 `dutyTiers`가 실린다 |
| `PUT` | `/teams/{teamID}/dutyTiers` | 새로 만든다. 시스템 관리자 또는 팀 관리자만 |

`GET`은 이미 있으므로 응답에 `canEditDutyTiers` 플래그를 더한다. 클라이언트가 팀 관리자
여부를 직접 못 보기 때문이다.

라우팅은 `server/api/teams.go`에 등록한다 — `API → App → Store` 흐름을 지킨다 (원칙 II).

## 9. 클라이언트 타입

`webapp/src/blocks/board.ts`의 `PropertyAccessRule`에 새 필드를 더한다. 서버 JSON 태그와
필드 이름을 맞춘다 — 지금도 그렇게 맞춰져 있다.

`DutyTier` 타입과 팀 설정 슬라이스를 새로 만든다. 조직 마스터가 이미 팀 단위 스토어를
갖고 있으므로(`store/orgMaster`) 같은 모양으로 둔다.
