# Phase 0 조사: 보드 접근 권한(ACL) 및 소유자 개념 제거

**Feature**: `001-remove-board-acl` | **Date**: 2026-08-01

Technical Context에 미해결(NEEDS CLARIFICATION) 항목은 없다. 기술 스택과 제약이 constitution과 기존 코드에서 모두 확정되기 때문이다. 대신 설계 결정에 근거가 필요한 5개 지점을 조사했다.

---

## R-001: 삭제 권한 판정을 어떤 지점에서 되돌릴 것인가

**Decision**: `PermissionSatisfies`의 하드 차단을 제거하고, `BuildCapabilities`의 `CanDeleteBoard` 산출을 소유자 여부에서 권한 등급 비교로 바꾼다. 두 권한 서비스(`mmpermissions`, `localpermissions`)의 `HasPermissionToBoard`에 있는 `DeleteBoard` 특례 분기를 삭제한다.

**Rationale**: `PermissionSatisfies`(`server/model/board_permissions.go:240`)가 `required == PermissionDeleteBoard`일 때 무조건 `false`를 반환한다. 이 때문에 일반 등급 비교 경로로는 삭제가 절대 통과하지 못하고, 오직 `IsOwner` 특례만 통과시킨다.

```go
func PermissionSatisfies(effective EffectiveBoardPermission, required *mmModel.Permission) bool {
	if required == PermissionDeleteBoard {
		return false
	}
	requiredLevel := ACLPermissionFromBoardPermission(required)
	return EffectivePermissionRank(effective) >= EffectivePermissionRank(requiredLevel)
}
```

`EffectivePermissionRank`에서 `Manage`는 4다. 보드 관리자(`SchemeAdmin`)와 팀 관리자 승격 경로 모두 `EffectiveBoardPermissionManage`를 산출하므로, 하드 차단만 풀면 두 주체가 자동으로 삭제 권한을 되찾는다. 별도 분기를 새로 만들 필요가 없다.

**Alternatives considered**:

- *`HasPermissionToBoard`에 `SchemeAdmin` 검사를 직접 추가*: `main`의 형태에 가깝지만, 브랜치는 이미 등급 기반 판정으로 통일되어 있다. 판정 근거를 두 벌로 만들면 `GetBoardPermissions`가 내놓는 요약과 실제 권한 판정이 어긋날 수 있다.
- *`EffectiveBoardPermissionDelete` 등급을 실제로 사용*: 현재 이 값은 `EffectivePermissionRank`에서 `Manage`와 같은 4로 취급되며 주석에 "Legacy value"로 표시돼 있다. 살려 쓰면 등급 체계가 5단계로 늘어나고 모든 판정 지점을 재검토해야 한다.

---

## R-002: 인덱스 제거를 어떻게 이식성 있게 처리할 것인가

**Decision**: `migrate.go`의 `GetTemplateHelperFuncs`에 `dropIndexIfNeeded` 헬퍼를 8번째로 추가하고, 마이그레이션 파일은 헬퍼만 호출한다.

**Rationale**: 컬럼 삭제에 인덱스 정리를 맡기면 백엔드별로 결과가 갈린다.

| 백엔드 | `has_acl_entries` 컬럼 삭제 시 `(team_id, has_acl_entries)` 인덱스 |
|---|---|
| PostgreSQL | 인덱스 전체가 함께 삭제된다 |
| MySQL | 컬럼만 인덱스에서 빠지고 `(team_id)` 단일 인덱스가 원래 이름으로 남는다 |
| SQLite | `genDropColumnIfNeeded`가 건너뛰므로 컬럼과 인덱스 모두 남는다 |

MySQL에 이름과 내용이 어긋나는 인덱스가 잔존하는 것이 문제다. 이 저장소는 이미 방언 차이를 흡수하는 헬퍼 7종(`addColumnIfNeeded`, `dropColumnIfNeeded`, `createIndexIfNeeded`, `renameTableIfNeeded`, `renameColumnIfNeeded`, `doesTableExist`, `doesColumnExist`, `addConstraintIfNeeded`)을 갖고 있으므로, 대칭 헬퍼를 추가하는 것이 기존 설계와 일관된다.

인덱스 이름은 `getIndexName(tableName, columns)`(`migrate.go:699`)로 얻는다. `createIndexIfNeeded`와 같은 함수를 써야 생성 시 이름과 정확히 일치한다.

방언별 구현 근거:

- PostgreSQL: `DROP INDEX IF EXISTS <name>` 지원
- SQLite: `DROP INDEX IF EXISTS <name>` 지원
- MySQL: `IF EXISTS`를 지원하지 않으므로 `genCreateIndexIfNeeded`가 쓰는 `INFORMATION_SCHEMA.STATISTICS` 조회 + `PREPARE`/`EXECUTE` 패턴을 반대로 적용한다

**Alternatives considered**:

- *마이그레이션 파일에 방언 분기 SQL 직접 작성*: 헬퍼 설계 의도에 역행하고 다음 마이그레이션에서 같은 분기가 복제된다.
- *인덱스를 방치*: MySQL 운영 환경에 오해를 부르는 인덱스가 영구히 남는다.

---

## R-003: 되돌리기 스크립트를 어떻게 작성할 것인가

**Decision**: 신규 마이그레이션의 `.down.sql`은 `SELECT 1;` 한 줄로 작성한다. 규약을 위반하고 있는 기존 000047의 `.down.sql`도 같은 형태로 수정한다.

**Rationale**: constitution 원칙 VII이 이를 요구하고 `.github/workflows/lint-server.yml`의 `down-migrations` 잡이 집행한다.

```yaml
- name: assert that down migrations are SELECT 1 scripts
  run: |
    echo 'SELECT 1;' > downmigration
    for file in server/services/store/sqlstore/migrations/*.down.sql; do diff -Bw downmigration $file; done
```

현재 상태 확인 결과 000044·000045·000046의 `.down.sql`은 `SELECT 1;`이지만 000047은 실제 `ALTER TABLE ... DROP COLUMN IF EXISTS` 문을 담고 있다. `diff -Bw`는 결정적이므로 이 CI 잡은 실패 상태다. 즉 이 브랜치는 현재 constitution 원칙 VII을 위반하고 있으며, 이번 작업이 그 위반을 해소한다.

brainstorming 단계에서는 000048의 `.down.sql`에 컬럼 복구 SQL을 넣기로 했으나, 그 결정은 규약 위반이었으므로 폐기한다.

**Alternatives considered**:

- *000047을 그대로 두고 000048만 규약 준수*: CI 잡이 디렉터리 전체를 검사하므로 여전히 실패한다.
- *000047 파일 자체를 삭제*: 이미 실환경에 적용된 마이그레이션이라 이력에서 지우면 적용 기록과 어긋난다.

---

## R-004: SQLite 경로를 어떻게 검증할 것인가

**Decision**: 신규 마이그레이션의 SQLite 동작은 헬퍼 위임으로 안전성을 확보하되, 실제 적용 검증은 MySQL/PostgreSQL에서 수행한다. 로컬 `make server-test`로는 검증되지 않는다는 사실을 명시하고 넘어간다.

**Rationale**: 마이그레이션 000045가 SQLite에서 실패한다.

```
driver: sqlite, message: failed when applying migration, command: apply_migration,
originalError: near "EXISTS": syntax error,
query: ALTER TABLE test_board_mentions ADD COLUMN IF NOT EXISTS post_id VARCHAR(36) DEFAULT '';
```

SQLite는 `ADD COLUMN`에 `IF NOT EXISTS`를 지원하지 않는다. 헬퍼 `addColumnIfNeeded`를 쓰지 않고 raw SQL을 쓴 것이 원인이다. 마이그레이션 체인이 000045에서 끊기므로 로컬 SQLite 테스트는 000048까지 도달하지 못한다. 이 실패는 `main`에도 존재하며 이번 작업이 도입한 것이 아니다.

000047도 같은 패턴을 갖고 있으나 000045에서 먼저 끊겨 아직 드러나지 않았다.

**Alternatives considered**:

- *000045를 함께 수정해 SQLite 체인을 복구*: 매력적이지만 이번 명세의 범위 밖이며(Out of Scope), 000045는 다른 기능(보드 멘션)의 자산이다. 별도 과제로 분리하는 편이 원칙 VIII("한 변경 = 한 관심사")에 맞다. 다만 이 결정이 원칙 I의 품질 게이트에 미치는 영향은 plan.md의 Complexity Tracking에 기록한다.

---

## R-005: 기존 테스트를 어떻게 되돌릴 것인가

**Decision**: 삭제 권한 기대값을 `main`과 동일하게 되돌린다. 새 테스트를 작성하는 대신 `main`의 기대값을 복원하는 형태를 취한다.

**Rationale**: 두 권한 서비스의 테스트가 이미 삭제 권한을 다루고 있으며, 브랜치가 기대값만 바꿔놓았다. 조사한 변경 지점은 다음과 같다.

| 파일 | 테스트 케이스 | main | 현재 브랜치 | 조치 |
|---|---|---|---|---|
| `mmpermissions_test.go` | `board admin` | `hasPermissionTo`에 `PermissionDeleteBoard` 포함 | 제거됨 | 복원 |
| `mmpermissions_test.go` | `elevate board viewer permissions` | `hasPermissionTo`에 포함 | 제거됨 | 복원 |
| `mmpermissions_test.go` | `board owner can delete board` | 존재하지 않음 | 추가됨 | 삭제 |
| `localpermissions_test.go` | `admin` | `hasPermissionTo`에 포함 | `hasNotPermissionTo`로 이동 | 복원 |

`editor`·`commenter`·`viewer` 케이스는 양쪽 모두 `hasNotPermissionTo`에 `PermissionDeleteBoard`를 두고 있어 변경이 필요 없다. 이것이 FR-011(편집자 이하 삭제 불가)의 회귀 방어가 된다.

`elevate board viewer permissions` 케이스가 특히 중요하다. 이 테스트는 보드 열람자이면서 팀 관리자인 사용자를 다루며, 복원 후 통과하려면 팀 관리자 승격 경로가 `Manage` 등급을 산출하고 그 등급이 삭제를 통과시켜야 한다. R-001의 설계가 옳다면 자동으로 통과한다 — 설계 검증 장치 역할을 한다.

**Alternatives considered**:

- *별도 특성화 테스트를 새로 작성*: brainstorming 단계에서는 절제 전 특성화 테스트 확보를 0단계로 두었다. 조사 결과 해당 테스트가 이미 존재하므로 신규 작성은 중복이다. 대신 기대값 복원을 절제와 같은 커밋에 넣어 원칙 IV(동작 변경 시 테스트 동반)를 만족한다.

---

## 부수 확인 사항

**i18n**: `webapp/i18n/en.json`·`ko.json`에 접근 권한·소유자 관련 키가 0건이다. 해당 문자열은 모두 컴포넌트 안에 `defaultMessage`로만 존재한다. 따라서 원칙 V의 동기화 요구는 이번 작업에 적용되지 않는다. (문자열을 코드에 인라인으로 둔 것 자체가 원칙 V 위반이지만, 제거 대상 코드이므로 함께 사라진다.)

**목 재생성**: `Store` 인터페이스에서 `GetBoardsInTeam`·`GetBoardsInUserTeams` 두 메서드가 빠진다. `mockstore.go`는 현재 2인자 시그니처로 최신 상태이므로 `make generate`로 재생성해야 한다. 원칙 I이 요구한다.

**린트 부수 효과**: 조직 컨텍스트 해석 코드를 제거하면 현재 `golangci-lint`가 지적 중인 항목이 함께 사라진다 — `dogsled`(빈 식별자 4개), `exhaustive`(권한 열거 switch 누락) 4건 중 3건, `gocritic ifElseChain` 1건.
