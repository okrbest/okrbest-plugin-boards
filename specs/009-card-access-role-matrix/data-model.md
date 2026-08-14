# 데이터 모델: 카드 접근 권한을 역할 매트릭스로 정한다

저장 위치는 `board.properties.propertyAccess` 하나다. 새 테이블도 마이그레이션도 없다.

## 1. 저장 형태

```jsonc
{
  "propertyAccess": {
    "enabled": true,
    "updatedBy": "...",
    "updatedAt": 0,

    // 새로 생김 — 직책 묶음 (FR-011)
    "tiers": [
      {"id": "tier-1", "name": "대표",    "dutyIds": ["duty-ceo"]},
      {"id": "tier-2", "name": "C-Level", "dutyIds": ["duty-cso", "duty-coo", "duty-cfo", "duty-cgo"]},
      {"id": "tier-3", "name": "팀장",    "dutyIds": ["duty-tl"]},
      {"id": "tier-4", "name": "팀원",    "dutyIds": ["duty-member"]}
    ],

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

## 2. 필드가 서로를 이기는 순서

새 필드와 기존 필드가 겹치는 자리가 셋이다. **읽는 쪽이 새 필드를 먼저 보고, 없으면 기존
필드로 떨어진다.** 기존 보드는 새 필드가 전부 비어 있으므로 지금과 똑같이 읽힌다(FR-001, FR-016).

| 축 | 새 필드 | 기존 필드 | 규칙 |
|---|---|---|---|
| 카드 값 | `propertyValueIds` | `propertyValueId` | 새 필드가 비어 있지 않으면 그것을 쓴다 |
| 직책 | `tierId` | `dutyId` | `tierId`가 있으면 그것을 쓴다 |
| 조직 | `relation` | `divisionId` · `departmentId` | `relation`이 있으면 절대값 두 칸을 **무시한다** |

셋째만 "무시"다. 관계와 절대값이 같은 축을 두고 다투므로 둘을 함께 적용하면 어느 쪽이
답인지 규칙을 읽어서는 알 수 없다.

## 3. 직책 묶음

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

## 4. 관계

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

## 5. 검증

저장할 때 막는 것들이다. 지금 `validatePropertyAccessSettings`가 하는 일에 넷을 더한다.

| 검사 | 이유 |
|---|---|
| `relation`이 목록에 없는 값이면 거절 | 모르는 관계를 통과시키면 판정이 조용히 달라진다 |
| `relation`이 본부·부서 계열인데 `orgPropertyId`가 비면 거절 | 볼 속성이 없으면 절대 성립하지 않아 죽은 규칙이 된다 |
| `relation=mine`인데 `assigneePropertyId`가 비면 **통과** | 작성자만으로 판정된다. 담당자 속성은 선택이다 |
| `tierId`가 `tiers`에 없으면 거절 | 화면에서 만들 수 없는 상태다. 지워진 묶음은 화면이 깨진 규칙으로 표시한다 |
| 사람 쪽 조건이 하나도 없으면 거절 (기존) | 모두에게 권한을 주는 줄은 실수다 |

`tiers`의 `dutyIds`에 마스터에 없는 ID가 있어도 거절하지 않는다. 마스터가 메인 서버
소유라 우리 쪽 저장 시점에 맞다고 보장할 수 없다 — 002가 조직·직책 ID를 검사하지 않는
것과 같은 이유다.

## 6. 표준 프리셋

카드 접근 권한을 처음 켤 때 깔리는 여섯 줄이다 (FR-019). 유형 속성과 값은 OKR 사다리
설정(`board.properties.okrBoard`)에서 읽는다. 직책 묶음은 사용자가 만든다 — 이름으로
추정하지 않는다 (research R8).

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

## 7. 클라이언트 타입

`webapp/src/blocks/board.ts`의 `PropertyAccessRule`에 같은 필드를 더한다. 서버 JSON 태그와
필드 이름을 맞춘다 — 지금도 그렇게 맞춰져 있다.

`board.properties`의 타입 유니온에 `tiers`를 담는 형태가 들어간다. 008이
`OkrBoardSettings`를 더한 것과 같은 자리다.
