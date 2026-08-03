# 조직 관리 테이블 의존성 통지

- 작성일: 2026-08-03
- 작성 주체: `okrbest/okrbest-plugin-boards` (Boards 플러그인)
- 대상: `okrbest/okrbest` (메인 서버)
- 계기: `specs/002-card-property-access` (속성 기준 카드 접근 권한)

## 요지

Boards 플러그인이 메인 서버 소유 테이블 **3개를 읽기 전용으로 직접 조회**한다. 쓰기·마이그레이션은 하지 않는다.

**스키마를 바꿀 때 알려달라.** 이 문서의 유일한 요청이다.

## 의존 대상

| 테이블 | 읽는 컬럼 | Boards 용도 |
|---|---|---|
| `OrgUnits` | `ID` · `TeamID` · `Name` · `Type` · `ParentID` · `Active` | 본부·부서 셀렉터, 조상 집합 계산 |
| `PositionDefinitions` | `ID` · `TeamID` · `Code` · `Name` · `Rank` · `Kind` · `FullVisibility` · `Active` | 직책 셀렉터(`Kind='duty'`만), 전체보기 판정 |
| `UserOrgProfiles` | `TeamID` · `UserID` · `PrimaryOrgUnitID` · `PrimaryDutyID` · `EffectiveFrom` · `EffectiveTo` | 사용자 소속·직책 판정 |

`PrimaryPositionID`(직위)와 `ExtraPositions`는 읽지 않는다. Boards는 직책(`Kind='duty'`)만 쓴다.

## 깨지는 변경

아래가 바뀌면 Boards가 오동작하거나 권한 판정이 틀어진다.

- 위 컬럼의 **삭제·이름 변경·타입 변경**
- `OrgUnits.Type` 값 집합 변경 (현재 `division` / `department`)
- `OrgUnits.ParentID`의 계층 의미 변경 (현재 자식 → 부모, 빈 문자열이면 최상위)
- `PositionDefinitions.Kind` 값 집합 변경 (현재 `duty` / `position`)
- `PositionDefinitions.FullVisibility`의 **의미 변경**
- `UserOrgProfiles`의 PK 변경 (현재 `(TeamID, UserID)`)
- `EffectiveFrom` / `EffectiveTo`의 **단위·0의 의미 변경** (현재 밀리초, 0은 무제한)

## 참고

플러그인이 Mattermost 소유 테이블을 직접 읽는 것은 이 저장소의 기존 관례다. `sqlstore/user.go`의 `baseUserQuery`가 `Users`를, `searchUsersByTeam`이 `TeamMembers`를 같은 방식으로 읽는다.

Boards 쪽 설계 근거는 `specs/002-card-property-access/research.md` R5에 있다.
