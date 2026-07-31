# Phase 1 데이터 모델: 보드 접근 권한(ACL) 및 소유자 개념 제거

**Feature**: `001-remove-board-acl` | **Date**: 2026-08-01

제거 작업이므로 신규 엔티티가 없다. 이 문서는 사라지는 것, 남는 것, 형태가 바뀌는 것을 구분한다.

## 1. 제거되는 엔티티

### 1-1. 보드 접근 권한 항목 (BoardACLEntry)

`boards.properties` JSON의 `board_acl_entries` 키에 배열로 저장된다. 별도 테이블이 없다.

| 필드 | 설명 |
|---|---|
| `id` | 항목 식별자 |
| `subjectType` | `user` \| `org_unit` \| `position` \| `org_position` |
| `subjectId` | 대상 식별자 |
| `orgUnitId` | 부서 식별자 (`org_unit`·`org_position`일 때) |
| `positionCode` | 직위 코드 (`position`·`org_position`일 때) |
| `permission` | 부여 권한 등급 |

관련 상수: `BoardACLPropertyKey`, `BoardACLManagersKey`
관련 함수: `ParseBoardACLFromProperties`, `EvaluateBoardACLEntries`, `HasOrgScopedACLEntries`

**저장된 데이터 처리**: 삭제하지 않는다(FR-014). 읽는 경로가 사라지므로 무시된다.

### 1-2. 부서·직위 선택지 (ACLSubjectOption)

| 필드 | 설명 |
|---|---|
| `id` | 부서 또는 직위 식별자 |
| `name` | 표시 이름 |

원본은 외부 시스템이 관리하며 이 저장소는 조회만 했다. 조회 경로(`app/org_master.go`, `sqlstore/org_role_options.go`)가 사라진다.

### 1-3. 사용자 조직 프로필 (UserOrgProfile)

사용자의 부서·직위·전체공개 여부. `model/org_context.go`에 정의되며 접근 권한 평가와 전체공개 규칙에만 쓰였다.

관련 사용자 속성 키: `org_unit_ids`, `position_codes`, `is_ceo`

### 1-4. 보드 소유자

`boards.properties` JSON의 `board_owner_user_id` 키. 명시 지정이 없으면 `boards.created_by`로 폴백했다.

관련 상수: `BoardOwnerUserIDKey`
관련 함수: `ResolveBoardOwnerUserID`

**저장된 데이터 처리**: 삭제하지 않는다(FR-014).

## 2. 형태가 바뀌는 엔티티

### 2-1. 보드 권한 요약 (BoardPermissionsResponse)

유지하되 필드 하나가 빠진다.

| 필드 | 변경 |
|---|---|
| `boardId` | 유지 |
| `effectivePermission` | 유지 |
| `capabilities` | 유지 (구조 동일, 산출 근거 변경) |
| `derivedFrom` | 유지 (가능한 값 축소 — 아래) |
| `isOwner` | **삭제** |

`derivedFrom`이 가질 수 있는 값:

| 값 | 상태 |
|---|---|
| `member_role` | 유지 |
| `team_admin_default` | 유지 |
| `system_admin_override` | 유지 |
| `deny` | 유지 |
| `owner` | 삭제 |
| `direct_acl` | 삭제 |
| `org_unit_acl` | 삭제 |
| `position_acl` | 삭제 |
| `org_position_acl` | 삭제 |
| `ceo_full_visibility` | 삭제 |
| `board_manager` | 삭제 |

### 2-2. 권한 능력 (BoardPermissionCapabilities)

필드 구성은 그대로다. `canDeleteBoard`의 산출 규칙만 바뀐다.

| 필드 | 산출 규칙 (변경 전) | 산출 규칙 (변경 후) |
|---|---|---|
| `canView` | 등급 ≥ 1 | 동일 |
| `canCommentCard` | 등급 ≥ 2 | 동일 |
| `canCreateCard` | 등급 ≥ 3 | 동일 |
| `canEditCard` | 등급 ≥ 3 | 동일 |
| `canDeleteCard` | 등급 ≥ 3 | 동일 |
| `canManageBoard` | 등급 ≥ 4 | 동일 |
| `canDeleteBoard` | **소유자 여부** | **등급 ≥ 4** |

`BuildCapabilities`의 시그니처에서 `isOwner` 인자가 사라진다.

## 3. 유지되는 엔티티

### 3-1. 유효 권한 등급 (EffectiveBoardPermission)

6개 값과 등급 매핑 모두 유지한다.

| 값 | 등급 |
|---|---|
| `none` | 0 |
| `view` | 1 |
| `commenter` | 2 |
| `edit` | 3 |
| `manage` | 4 |
| `delete` | 4 (레거시 값, `manage`와 동일 취급) |

### 3-2. 보드 멤버 역할

변경 후 권한 판정의 유일한 근거. 기존 구조 그대로다.

| 역할 | 산출 등급 |
|---|---|
| `admin` (SchemeAdmin) | `manage` |
| `editor` (SchemeEditor) | `edit` |
| `commenter` (SchemeCommenter) | `commenter` |
| `viewer` (SchemeViewer) | `view` |

## 4. 스키마 변경

### 4-1. 제거 대상

| 대상 | 테이블 | 도입 |
|---|---|---|
| `has_acl_entries` 컬럼 | `boards` | 마이그레이션 000047 |
| `has_acl_entries` 컬럼 | `boards_history` | 마이그레이션 000047 |
| `idx_boards_team_id_has_acl_entries` 인덱스 | `boards` | 마이그레이션 000047 |

### 4-2. 신규 마이그레이션

`000048_drop_has_acl_entries_from_boards`

`.up.sql`은 템플릿 헬퍼만 호출한다 — `dropIndexIfNeeded`(신규 추가), `dropColumnIfNeeded` × 2.

`.down.sql`은 `SELECT 1;` 한 줄이다(원칙 VII).

### 4-3. 기존 마이그레이션 수정

`000047_add_has_acl_entries_to_boards.down.sql`을 `SELECT 1;`로 교체한다(FR-018). `.up.sql`은 이미 적용된 이력이므로 건드리지 않는다.

## 5. 권한 판정 흐름 변화

**변경 전**

```
소유자인가?           → 예: manage 등급, isOwner=true, 삭제 허용
접근 권한 항목 평가    → 일치: 해당 등급
조직 컨텍스트 해석     → 부서·직위 기반 등급
공개 보드 최소 역할    → 등급
명시적 멤버 역할       → 등급
팀 관리자 승격        → manage 등급
전체공개 직위         → 등급 0이면 commenter로 승격
삭제 판정             → isOwner 단독
```

**변경 후**

```
공개 보드 최소 역할    → 등급
명시적 멤버 역할       → 등급
팀 관리자 승격        → manage 등급
삭제 판정             → 등급 ≥ 4
```

## 6. 저장소 인터페이스 변화

`Store` 인터페이스에서 두 메서드가 제거된다.

| 메서드 | 용도 | 도입 |
|---|---|---|
| `GetBoardsInTeam(teamID string, onlyWithACL bool)` | 접근 권한 확장용 후보 조회 | 브랜치 신규 |
| `GetBoardsInUserTeams(userID string, onlyWithACL bool)` | 검색 확장용 후보 조회 | 브랜치 신규 |

두 메서드 모두 `main`에 존재하지 않으므로 시그니처 원복이 아니라 삭제다. `mockstore.go`는 `make generate`로 재생성한다.
