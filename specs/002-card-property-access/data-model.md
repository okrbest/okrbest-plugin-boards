# Phase 1 Data Model: 속성 기준 카드 접근 권한

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Research**: [research.md](research.md)

신규 테이블과 마이그레이션은 없다(R1). 규칙은 기존 보드 문서의 JSON 컬럼에 저장하고, 조직 마스터는 기존 테이블을 읽기 전용으로 조회한다.

---

## 1. 저장 엔티티

### 1.1 RuleSet — 규칙 집합

보드와 1:1. `focalboard_boards.properties` JSON의 `propertyAccess` 키에 저장한다.

```jsonc
"propertyAccess": {
  "enabled": false,
  "updatedBy": "",
  "updatedAt": 0,
  "rules": [ /* AccessRule[] */ ]
}
```

| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `enabled` | boolean | ✓ | 규칙 적용 여부. 기본 `false` (FR-003) |
| `updatedBy` | string | | 마지막으로 규칙을 저장한 사용자 ID. 서버가 채운다 (FR-033, FR-035) |
| `updatedAt` | number | | 그 시각(밀리초). 서버가 채운다 |
| `rules` | AccessRule[] | ✓ | 규칙 행 목록. 빈 배열 허용. 개수 상한 없음 (FR-013) |

`propertyAccess` 키 자체가 없으면 `enabled=false`, `rules=[]`와 동일하게 취급한다.

### 1.2 AccessRule — 규칙 행

| 필드 | 타입 | 필수 | 참조 | 설명 |
|---|---|---|---|---|
| `id` | string | ✓ | | 행 식별자. 클라이언트가 생성 |
| `propertyId` | string | ✓ | `board.cardProperties[].id` | 카드 속성. **이름이 아닌 id로 저장**해 속성명 변경에 견딘다 |
| `propertyValueId` | string | ✓ | `cardProperties[].options[].id` | 속성값 옵션 |
| `divisionId` | string | | `OrgUnits.id` (`type='division'`) | 본부. 빈 문자열이면 제약 없음 |
| `departmentId` | string | | `OrgUnits.id` (`type='department'`) | 부서. 빈 문자열이면 제약 없음 |
| `dutyId` | string | | `PositionDefinitions.id` (`kind='duty'`) | 직책. 빈 문자열이면 제약 없음 |
| `permission` | enum | ✓ | | `viewer` \| `commenter` \| `editor` (FR-010) |

**검증 규칙**

| 규칙 | 근거 |
|---|---|
| `propertyId`·`propertyValueId`·`permission`은 비어 있을 수 없다 | FR-011 |
| `divisionId`·`departmentId`·`dutyId` 중 최소 하나는 비어 있지 않아야 한다 | FR-011 — 셋 다 비면 전원 접근이라 규칙의 의미가 없다 |
| `permission`은 세 값 중 하나여야 한다 | FR-010 |
| 조직·직책 축은 **id 존재 여부를 저장 시점에 검증하지 않는다** | 마스터가 외부에서 관리되어 나중에 사라질 수 있다. 판정 시점에 매칭 실패로 처리하고 화면에 표시한다 (FR-036) |

**세 축 모두 id로 저장한다.** `UserOrgProfiles`가 조직·직책을 모두 id로 들고 있어 변환 없이 대조된다(R5).

### 1.3 제거 대상 잔재

`properties`에 남아 있으나 코드 참조가 없는 키. 보드를 저장할 때 제거한다.

```
card_acl_rules · card_acl_enabled · card_acl_org_map · board_owner_user_id
```

---

## 2. 조회 전용 엔티티

### 2.1 OrgUnit — 조직 단위

기존 `OrgUnits` 테이블. 이 기능은 읽기만 한다.

| 컬럼 | 사용 |
|---|---|
| `id` | 규칙의 `divisionId`·`departmentId`, `UserOrgProfiles.PrimaryOrgUnitID`의 값 |
| `teamid` | 팀 스코프 필터 |
| `name` | 셀렉터 표시 |
| `type` | `division`(본부) \| `department`(부서) 구분 |
| `parentid` | 계층. 부서 → 본부. 빈 문자열이면 최상위 |
| `active` | `false`면 셀렉터에서 제외 |

**계층 규칙**: 사용자 소속에서 `parentid`를 따라 최상위까지 올라가며 조상 집합을 만든다. 본부 조건은 그 집합에 `divisionId`가 포함되는지로 판정한다(FR-017). 현재 2단계지만 일반형으로 구현한다.

### 2.2 Duty — 직책

기존 `PositionDefinitions` 테이블 중 `kind='duty'`인 행만.

| 컬럼 | 사용 |
|---|---|
| `id` | 규칙의 `dutyId`, `UserOrgProfiles.PrimaryDutyID`의 값 |
| `code` | 표시·디버깅용. 판정에는 쓰지 않는다 |
| `teamid` | 팀 스코프 필터 |
| `name` | 셀렉터 표시 |
| `rank` | 셀렉터 정렬 |
| `kind` | `duty`만 사용. `position`(직위)은 전 구간 배제 (FR-024) |
| `fullvisibility` | 켜져 있으면 최소 열람자 하한 (FR-022) |
| `active` | `false`면 셀렉터에서 제외 |

### 2.3 UserOrgProfile — 사용자 조직 정보

메인 서버가 소유한 `UserOrgProfiles` 테이블. PK `(TeamID, UserID)`. 이 기능은 읽기만 한다.

| 컬럼 | 사용 |
|---|---|
| `TeamID` | 보드의 팀으로 조회 범위를 좁힌다 |
| `UserID` | 대상 사용자 |
| `PrimaryOrgUnitID` | `OrgUnits.id`. 본부·부서 조건의 기준 |
| `PrimaryDutyID` | `PositionDefinitions.id` (`kind='duty'`). 직책 조건의 기준 |
| `PrimaryPositionID` | 직위 — **읽지 않는다** (FR-024) |
| `ExtraPositions` | 부가 직위 — **읽지 않는다** |
| `EffectiveFrom` · `EffectiveTo` | 유효기간(밀리초). 0이면 무제한 |

**유효기간 판정**: 현재 시각을 `now`라 할 때, `EffectiveFrom == 0 || EffectiveFrom <= now` 이고 `EffectiveTo == 0 || now < EffectiveTo` 인 행만 유효하다. 유효하지 않으면 조직 정보 미등록과 동일하게 처리한다.

행이 없거나 `PrimaryOrgUnitID`가 비어 있으면 조직 정보 미등록으로 보고 조직 조건을 만족하지 못한 것으로 처리한다(FR-021).

---

## 3. 판정 값 객체

### 3.1 CardPermission — 카드 권한 등급

```
none < viewer < commenter < editor < manage
```

- `none`~`editor`는 규칙이 부여할 수 있는 범위. `manage`는 보드 관리자·시스템 관리자 전용(FR-014).
- `max`/`min` 비교를 위해 순서가 있는 등급으로 다룬다.
- 기존 보드 권한 등급과 같은 어휘를 쓴다. 보드 권한을 그대로 반환하는 경로(FR-015)에서 변환이 필요 없다.

### 3.2 Evaluator — 평가기

요청당 `(userID, board)`로 1회 생성한다. 상태는 불변이며 판정은 부작용이 없다.

| 필드 | 계산 시점 | 설명 |
|---|---|---|
| `isAdmin` | 생성 | 보드 관리자 또는 시스템 관리자인가 |
| `floor` | 생성 | 전체보기 하한. 사용자 직책의 `fullvisibility`로 결정. `viewer` 또는 `none` |
| `boardPermission` | 생성 | 기존 보드 단위 권한 |
| `enabled` | 생성 | 규칙 스위치 |
| `orgGateByProperty` | 생성 | `(propertyId, valueId)` → 그 카드조건에 조직행이 존재하는지, 그리고 U가 통과하는지 |
| `grantByProperty` | 생성 | `(propertyId, valueId)` → U에게 적용되는 행들의 최대 권한 |

`For(card) → CardPermission`은 카드의 속성값을 훑어 위 두 맵을 조회한다. 규칙 순회가 없다(R3).

---

## 4. 관계

```
Board ─1:1─ RuleSet ─1:N─ AccessRule
                              │
                              ├─ propertyId/propertyValueId → Board.cardProperties
                              ├─ divisionId/departmentId    → OrgUnit (읽기 전용)
                              └─ dutyId                     → Duty (읽기 전용)

User ─1:1─ UserOrgProfile ─N:M─ OrgUnit
                            └──N:M─ Duty

(User, Board) → Evaluator → (Card) → CardPermission
```

규칙은 보드 문서 안에 있으므로 보드를 복제·템플릿화하면 함께 복사된다(FR-012). 조직 마스터는 외부 소유이므로 참조 무결성을 이 기능이 보장하지 않는다 — 판정 시점 매칭 실패로 흡수한다(FR-036).

---

## 5. 상태 전이

`RuleSet.enabled`만 상태를 갖는다.

```
꺼짐 ──(관리자가 스위치를 켬)──▶ 켜짐
켜짐 ──(관리자가 스위치를 끔)──▶ 꺼짐
```

- 꺼짐: 규칙을 평가하지 않는다. 모든 카드가 보드 권한을 따른다(FR-003 수용 시나리오 US1-6).
- 켜짐: 판정 알고리즘(research.md R6)이 동작한다.
- 규칙 행은 스위치 상태와 무관하게 저장·수정·삭제할 수 있다. 꺼진 상태로 규칙을 다 만든 뒤 켜는 흐름을 허용한다.
