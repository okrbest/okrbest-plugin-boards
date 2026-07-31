# Implementation Plan: 보드 접근 권한(ACL) 및 소유자 개념 제거

**Branch**: `feat/permission` | **Date**: 2026-08-01 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-remove-board-acl/spec.md`

## Summary

`feat/permission` 브랜치가 도입한 부서·직위 기반 보드 접근 제어(ACL)와 보드 소유자 개념을 걷어낸다. 두 개념 모두 `main`에 존재하지 않는 브랜치 신규 자산이므로 제거는 신규 기능 철회다.

기술적 접근은 **소비자에서 생산자 방향으로 층별 절단**이다. 웹앱 UI·클라이언트 → API 라우트·핸들러 → 앱 계층 목록 확장 → 저장소 인터페이스 → 권한 서비스 분기 → 모델 타입 → 스키마 순으로 자르며, 각 단계가 빌드·테스트를 통과하는 상태로 끝난다. 마지막 모델 제거 단계에서 컴파일 에러가 하나라도 나면 앞 단계에 누락이 있다는 신호이므로, "모델부터 지우고 컴파일러를 지도로 삼는" 기법의 검증력을 절차 안에 흡수한다.

삭제 권한은 `main`의 판정으로 되돌린다. `PermissionSatisfies`의 `DeleteBoard` 하드 차단을 제거하고 `BuildCapabilities`의 `canDeleteBoard`를 권한 등급 비교로 바꾸면, 보드 관리자와 팀 관리자 승격 경로가 자동으로 삭제 권한을 되찾는다([research.md](research.md) R-001).

## Technical Context

**Language/Version**: Go 1.24.6 (`go.mod`, `Makefile`의 `GOTOOLCHAIN` 핀), TypeScript 5.7 / React 19, Node 20.11 (`.nvmrc`)

**Primary Dependencies**: Gorilla Mux (라우팅), Squirrel (쿼리 빌더), gomock (목 생성), Redux Toolkit (웹앱 상태), Jest + React Testing Library

**Storage**: PostgreSQL / MySQL / SQLite 3종 지원. 스키마 변경은 `server/services/store/sqlstore/migrations/`에 번호 순 SQL 템플릿으로 추가

**Testing**: Go `go test -race ./...`(colocated `_test.go`), webapp Jest(colocated `*.test.tsx`)

**Target Platform**: Mattermost 서버 플러그인 (`min_server_version` 10.7.0), 플러그인 ID `focalboard`

**Project Type**: 단일 저장소 플러그인 — Go 서버 + React 웹앱을 한 번들로 배포

**Performance Goals**: 보드 목록·검색에서 팀 전체 보드를 훑는 후보 조회 경로 제거(SC-008). 접근 권한 확장은 후보 보드를 전량 끌어와 항목별로 평가했다. 그 경로가 사라지면 조회량이 사용자가 실제 접근 가능한 보드 수로 한정되므로 성능은 개선 방향으로만 움직인다. 판정은 시간 측정이 아니라 구조 확인으로 한다

**Constraints**: 3종 데이터베이스 백엔드 모두에서 동작. `.down.sql`은 `SELECT 1;` 한 줄(원칙 VII). 라이선스 헤더 유지(원칙 VI). 서버는 `API → App → Store` 단방향(원칙 II)

**Scale/Scope**: 서버 파일 5개 삭제 + 8개 축소, 웹앱 파일 6개 수정, 마이그레이션 1개 추가 + 1개 수정, 템플릿 헬퍼 1개 추가. 제거되는 HTTP 엔드포인트 8개

미해결(NEEDS CLARIFICATION) 항목 없음. 스택과 제약이 constitution과 기존 코드에서 모두 확정된다.

## Constitution Check

*GATE: Phase 0 이전 통과 필수. Phase 1 이후 재검사.*

| 원칙 | 판정 | 근거 |
|---|---|---|
| I. 패키지별 품질 게이트 | ⚠️ 조건부 | `make webapp-ci`·`make server-lint`는 통과 요구. `make server-test`는 사전 실패로 전체 통과 불가 — Complexity Tracking 참조 |
| II. 레이어 경계 준수 | ✅ | 제거만 하며 새 호출을 만들지 않는다. `API → App → Store` 단방향 유지 |
| III. 타입·오류 처리 엄격성 | ✅ | `as any`·`@ts-ignore` 도입 없음. 빈 `catch` 도입 없음 |
| IV. 동작 변경 시 테스트 동반 | ✅ | 삭제 권한 판정이 바뀌므로 두 권한 서비스의 기존 테스트 기대값을 같은 커밋에서 복원한다([research.md](research.md) R-005) |
| V. i18n 동기화 | ✅ | `en.json`·`ko.json`에 관련 키 0건 확인. 대상 문자열은 전부 컴포넌트 인라인이며 코드와 함께 사라진다 |
| VI. Upstream·라이선스 충실성 | ✅ | 포크 고유 기능을 걷어내므로 upstream과의 divergence가 줄어 머지 충돌 표면이 감소한다. 라이선스 헤더·플러그인 ID 무변경 |
| VII. DB 마이그레이션 규율 | ✅ (위반 해소) | 000048은 `.up`/`.down` 쌍으로 추가하고 `.down`은 `SELECT 1;`. 3종 백엔드는 템플릿 헬퍼로 흡수. **현재 위반 중인 000047의 `.down`도 함께 바로잡는다**(FR-018) |
| VIII. 집중 브랜치 + Conventional Commits | ✅ | 한 관심사(접근 권한·소유자 제거). 단계별 커밋에 `refactor:`/`chore:` 접두사 사용 |
| IX. Spec 주도 개발 워크플로 | ✅ | brainstorming → specify → plan 경로를 따랐다. 명세 정본은 `specs/001-remove-board-acl/` |

**게이트 통과**: 원칙 I 조건부를 Complexity Tracking에 문서화한 상태로 통과.

### Phase 1 이후 재검사

설계 산출물([data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md))을 만든 뒤 재평가했다. 판정 변동 없음.

추가로 확인한 사항:

- **원칙 II**: 인터페이스 축소(`PermissionsService`에서 `ResolveOrgContext` 제거, `Store`에서 메서드 2개 제거)가 레이어 방향을 바꾸지 않는다. 상위 계층이 하위 계층을 덜 부르게 될 뿐이다
- **원칙 I의 목 재생성 조항**: `Store` 인터페이스 변경이 있으므로 `make generate`가 필수다. 실행 순서 3단계에 명시했다
- **원칙 VII의 3종 백엔드 조항**: `dropIndexIfNeeded` 헬퍼 신규 추가로 충족한다. 헬퍼 없이 마이그레이션 파일에 방언 분기를 쓰면 이 조항을 형식적으로는 만족하지만 재사용성을 잃는다([research.md](research.md) R-002)

## Project Structure

### Documentation (this feature)

```text
specs/001-remove-board-acl/
├── spec.md                            # /speckit-specify 산출물
├── plan.md                            # 이 파일
├── research.md                        # Phase 0 — 설계 결정 5건
├── data-model.md                      # Phase 1 — 엔티티 제거·변경·유지
├── quickstart.md                       # Phase 1 — 검증 절차
├── contracts/
│   └── board-permissions-api.md       # Phase 1 — HTTP·내부 인터페이스 계약
├── checklists/
│   └── requirements.md                # 명세 품질 검증 결과
└── tasks.md                           # /speckit-tasks 산출물 (아직 없음)
```

### Source Code (repository root)

```text
server/
├── api/
│   ├── boards.go                      # 라우트 8개 제거, 소유권 이전 핸들러 제거
│   ├── board_permissions.go           # 390줄 → 약 50줄 (permissions/me만 유지)
│   ├── members.go                     # 소유자 예외 가드 2곳 제거
│   ├── search.go                      # 디버그 헤더 호출부 제거
│   ├── permissions_debug.go           # 파일 삭제
│   └── permissions_debug_test.go      # 파일 삭제
├── app/
│   ├── boards.go                      # 목록·검색 확장 로직 제거
│   └── org_master.go                  # 파일 삭제
├── model/
│   ├── board_permissions.go           # 303줄 → 약 120줄, BuildCapabilities·PermissionSatisfies 수정
│   ├── board_permissions_test.go      # 접근 권한 평가 테스트 제거
│   └── org_context.go                 # 파일 삭제
├── services/
│   ├── permissions/
│   │   ├── permissions.go             # 인터페이스에서 ResolveOrgContext 제거
│   │   ├── mmpermissions/             # ACL·조직 컨텍스트·소유자 분기 절제
│   │   └── localpermissions/          # 동일
│   └── store/
│       ├── store.go                   # 메서드 2개 제거
│       ├── mockstore/                 # make generate로 재생성
│       └── sqlstore/
│           ├── board.go               # onlyWithACL 분기 제거
│           ├── public_methods.go      # 래퍼 2개 제거
│           ├── org_role_options.go    # 파일 삭제
│           ├── migrate.go             # dropIndexIfNeeded 헬퍼 추가
│           └── migrations/
│               ├── 000047_*.down.sql  # SELECT 1;로 교체
│               └── 000048_*.sql       # 신규 추가 (up/down)
└── integrationtests/
    └── board_test.go                  # 접근 권한 통합 테스트 제거

webapp/src/
├── blocks/board.ts                    # ACL 타입·isOwner 필드 제거
├── octoClient.ts                      # ACL·소유권 이전 메서드, 디버그 헤더 로깅 제거
├── hooks/permissions.tsx              # DeleteBoard 특례 제거, adminPermissions 복원
└── components/
    ├── shareBoard/
    │   ├── shareBoard.tsx             # ACL 섹션 + 소유권 이전 UI 제거
    │   ├── shareBoard.scss            # ACL 클래스 7개 제거
    │   ├── userPermissionsRow.tsx     # isOwner prop·분기 제거
    │   └── userPermissionsRow.test.tsx
    └── sidebar/sidebar.test.tsx       # 접근 권한 전제 테스트 제거
```

**Structure Decision**: 기존 저장소 구조를 그대로 사용한다. 신규 디렉터리나 모듈을 만들지 않는다. 제거 작업이므로 파일 이동·리네임도 하지 않는다 — 원칙 VI("업스트림과의 구조 변경 최소화")에 부합한다.

## 실행 순서

아래 표는 **계층 절단 논리**다 — 왜 소비자부터 자르는지, 어느 지점이 검증 장치인지를 보여준다. 실제 실행 순서의 정본은 [tasks.md](tasks.md)의 Phase 구성이며, 거기서는 같은 작업을 사용자 스토리 단위로 재조합해 각 스토리가 독립적으로 배포 가능하도록 묶었다. 두 문서가 어긋나면 **tasks.md를 따른다**.

각 단계는 빌드가 통과하는 상태로 끝나야 한다. 세부 검증 명령은 [quickstart.md](quickstart.md)에 있다.

| # | 단계 | 산출 | 검증 |
|---|---|---|---|
| 0 | 기준선 확보 | `/tmp/before-*.txt` 3개 | 파일 생성 확인 |
| 1 | 웹앱 ACL UI·소유권 이전 UI·클라이언트·타입 제거 | 웹앱 6개 파일 | `npm run build`, jest 델타 |
| 2 | API 라우트·핸들러·디버그·소유권 이전·members 가드 제거 | 서버 api 6개 파일 | `go build` |
| 3 | 앱 계층 확장 + 저장소 메서드 제거, `make generate` | app·store | `go build`, server 테스트 델타 |
| 4 | 권한 서비스 ACL·조직·소유자 분기 절제, 테스트 기대값 복원 | permissions 3개 + 테스트 2개 | server 테스트 델타 |
| 5 | 모델 타입 제거, `BuildCapabilities`·`PermissionSatisfies` 수정 | model 3개 파일 | 참조 0 확인 |
| 6 | `dropIndexIfNeeded` 헬퍼 + 000048 추가 + 000047 down 수정 | migrate.go, 마이그레이션 3개 | 마이그레이션 적용, 규약 검사 |
| 7 | 최종 검증 | — | quickstart 전 단계 |

**0단계를 앞에 두는 이유**: 이 브랜치는 접근 권한과 무관한 실패를 이미 다수 갖고 있어 완료 판정을 델타로 해야 한다. 기준선을 잃으면 SC-005를 판정할 수 없다.

**4단계에 테스트 복원을 묶는 이유**: 원칙 IV가 동작 변경과 테스트를 같은 변경에 담을 것을 요구한다. 삭제 권한 판정이 바뀌는 단계가 4·5단계이므로 그 자리에 기대값 복원을 둔다.

**5단계가 검증 장치인 이유**: 앞 단계에서 참조를 모두 걷어냈다면 모델 타입 삭제 시 컴파일 에러가 없어야 한다. 에러가 나면 누락 지점을 컴파일러가 정확히 지목한다.

## Complexity Tracking

> Constitution Check에 정당화가 필요한 항목만 기록한다.

| 위반 | 왜 필요한가 | 기각한 더 단순한 대안 |
|---|---|---|
| **원칙 I — `make server-test` 전체 통과 불가** | 이 브랜치에서 `go test ./...`는 3개 패키지 13개 테스트가 실패한다. `app`(8건, gomock 기대값 불일치), `model`(1건, 표시 형식 변경 미반영), `sqlstore`(4건, 마이그레이션 000045의 SQLite 문법 오류). **동일한 실패가 `main`에서도 재현되므로 이번 작업이 도입한 것이 아니다.** 절대 통과를 게이트로 삼으면 이 브랜치의 어떤 변경도 머지할 수 없다. 따라서 "작업 전후 실패 목록을 비교해 신규 실패 0건"을 게이트로 대체한다(SC-005). 판정 근거는 [quickstart.md](quickstart.md) 2단계 명령 출력으로 제시한다 | *사전 실패를 이번 작업에서 함께 수정*: 세 실패군은 서로 다른 기능(보드 멘션 마이그레이션, 보드 패치 목, 사용자 표시 형식)에 속한다. 한 변경에 묶으면 원칙 VIII("한 변경 = 한 관심사")를 위반하고 리뷰 범위가 폭증한다. 별도 과제로 분리하는 편이 옳다. 특히 000045의 SQLite 수정은 접근 권한과 무관한 보드 멘션 기능의 자산이다 |
| **`dropIndexIfNeeded` 헬퍼 신규 추가** | 엄밀히는 제거 작업에 새 코드를 더하는 것이다. 인덱스 정리를 컬럼 삭제에 맡기면 MySQL에 이름과 내용이 어긋나는 인덱스가 남는다(PostgreSQL은 인덱스 전체 삭제, MySQL은 컬럼만 제외). 원칙 VII이 3종 백엔드 동작을 요구하므로 방언 차이를 어딘가에서 흡수해야 한다 | *마이그레이션 파일에 방언 분기 SQL 직접 작성*: 이 저장소는 이미 같은 목적의 헬퍼 8종을 갖고 있다. 파일에 분기를 쓰면 헬퍼 설계 의도에 역행하고 다음 마이그레이션에서 복제된다. *인덱스 방치*: MySQL 운영 환경에 오해를 부르는 인덱스가 영구히 남는다 |

### 범위 밖으로 남기는 사전 결함

아래는 이번 작업이 건드리지 않는다. 각각 별도 과제다.

| 결함 | 규모 | 비고 |
|---|---|---|
| 권한 훅의 상태 접근 방어 부재 | jest 15건 | `useHasPermissions`가 selector를 가드보다 먼저 평가해 최소 mock 상태에서 크래시. 훅 순서 수정 자체는 옳으나 selector 방어가 없다 |
| 스냅샷 미갱신 + 권한 게이팅 파생 | jest 15건 | 마크업 변경 의도 확인 후 갱신 필요 |
| redux-mock-store × redux-thunk v3 비호환 | jest 6건 + tsc 다수 | `main`에도 존재 |
| preact ESM 트랜스폼 누락 | suite 7개 실행 불가 | `main`에도 존재 |
| 마이그레이션 000045 SQLite 문법 오류 | server 4건 | `main`에도 존재. 보드 멘션 기능 자산 |
| 팀 관리자의 보드 멤버십 요구 조건 | 동작 차이 | `main`은 멤버십 없이 허용. 삭제뿐 아니라 모든 권한에 걸침. quickstart 6단계에서 실제 동작만 기록 |
