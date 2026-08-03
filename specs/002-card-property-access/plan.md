# Implementation Plan: 속성 기준 카드 접근 권한

**Branch**: `002-card-property-access` | **Date**: 2026-08-03 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/002-card-property-access/spec.md`

## Summary

카드 속성값(어떤 카드)과 사용자 조직·직책(누구)을 조합한 규칙으로 **카드 단위 접근 권한**을 판정한다. 판정은 "조직은 관문, 직책은 가산, 전체보기는 하한"이며, 규칙 밖 카드는 기존 보드 권한을 그대로 따른다.

기술 접근은 **평가기 단일 관문 + 보드 문서 저장**이다. `server/app/`에 사용자 컨텍스트를 받는 얇은 평가 계층을 두고, 블록을 반환하거나 변경하는 모든 경로가 그 관문을 지나게 한다. 규칙은 `board.properties`의 JSON 키에 저장해 DB 마이그레이션 없이 시작하고, 보드 복제·템플릿화에 자연히 따라가게 한다.

카드 속성값은 `focalboard_blocks.fields`에 `json` 타입으로 들어 있고 이 저장소는 PostgreSQL·MySQL·SQLite 3방언을 지원한다. 속성값 조건을 SQL로 밀어넣는 건 실용적이지 않으므로 **필터링은 조회 후 메모리에서** 한다. 대신 요청당 사용자별 허용 맵을 1회 선계산해 카드당 판정을 맵 조회로 만든다.

## Technical Context

**Language/Version**: Go 1.24.6 (server), TypeScript 5.7 + React 19 (webapp), Node 20.11

**Primary Dependencies**: Gorilla Mux + Squirrel (server), Redux Toolkit 2.11 + react-select 5.2 (webapp)

**Storage**: 규칙은 `focalboard_boards.properties` JSON 컬럼. 조직 정보는 메인 서버 소유 `OrgUnits`·`PositionDefinitions`·`UserOrgProfiles` 테이블을 **읽기 전용 직접 조회**(기존 `sqlstore/user.go`가 `Users`를 직접 읽는 관례와 동일). 신규 테이블·마이그레이션 없음

**Testing**: `go test -race ./...` (colocated `_test.go`), Jest + React Testing Library (colocated `*.test.tsx`)

**Target Platform**: Mattermost 플러그인(플러그인 ID `focalboard`), API 경로 `/plugins/focalboard/api/v2/`

**Project Type**: 단일 저장소 플러그인 — `server/`(Go) + `webapp/`(React)

**Performance Goals**: 규칙 100개 보드에서 카드 목록 표시 시간이 규칙 없는 같은 보드 대비 20% 이내 (SC-006). 평가기 생성은 요청당 1회, 카드당 판정은 맵 조회

**Constraints**: 서버 전면 집행 — 클라이언트 우회 요청에도 동일 적용(FR-031). 카드 제외 시 자식 블록(설명·댓글·첨부) 동반 제외(FR-026). 실시간 알림은 수신자별 판정(FR-029)

**Scale/Scope**: 조직 마스터 본부 4 · 부서 10 · 직책 4. 조직 배정 15명(직책 9명). 실사용 보드 카드 수 수십~수천. 규칙 개수 상한 없음(FR-013)

## Constitution Check

*GATE: Phase 0 이전 통과 필수. Phase 1 이후 재확인.*

| 원칙 | 게이트 | 판정 |
|---|---|---|
| I. 패키지별 품질 게이트 | `webapp/`·`server/` 둘 다 변경 → `make webapp-ci` + `make server-lint` + `make server-test` 모두 실행하고 출력을 근거로 제시 | ✅ 계획에 반영 |
| II. 레이어 경계·기존 패턴 | 평가기는 `server/app/`에 둔다. `server/api/`가 store를 직접 부르지 않는다. 조직 마스터 조회는 `api → app → store` 단방향. **UI는 기존 shareBoard 패턴을 차용한다 — 아래 「UI 일관성 제약」 절** | ✅ |
| III. 타입·오류 엄격성 | `as any`·`@ts-ignore` 금지. Go 오류는 `model.NewErrForbidden()` 등 도메인 생성자 사용 | ✅ |
| IV. 동작 변경 시 테스트 동반 | 평가기 표 기반 단위 테스트 + 집행 지점별 통합 테스트 + UI 컴포넌트 테스트. 실패 테스트 우선(superpowers TDD) | ✅ |
| V. i18n 동기화 | 신규 UI 문자열은 `webapp/i18n/en.json`·`ko.json`을 같은 변경에서 갱신 | ✅ |
| VI. Upstream 충실성 | 라이선스 헤더 유지. 플러그인 ID `focalboard` 고정. 신규 파일은 기존 디렉터리 구조 안에 배치해 머지 충돌 최소화 | ✅ |
| VII. DB 마이그레이션 규율 | **마이그레이션 없음** — 규칙은 기존 `properties` JSON에 저장. 3방언 분기 불필요 | ✅ 해당 없음 |
| VIII. 집중 브랜치 + Conventional Commits | 브랜치 `002-card-property-access`(`feat/permission` 기반). 무관한 리팩터를 섞지 않는다 | ✅ |
| IX. Spec 주도 워크플로 | `specs/002-card-property-access/`에 명세 정본 커밋. 이 계획이 그 다음 단계 | ✅ |

**위반 없음.** Complexity Tracking 섹션 불필요.

한 가지 유의: 원칙 VII은 마이그레이션을 쓸 때의 규율이다. 이 계획은 마이그레이션을 만들지 않으므로 해당하지 않지만, 규칙이 아주 많아져 전용 테이블로 옮기게 되면 그때 원칙 VII이 적용된다(research.md R1 참조).

### Phase 1 이후 재확인

설계 산출물(research.md · data-model.md · contracts/ · quickstart.md)을 만든 뒤 다시 점검했다.

| 원칙 | 재확인 결과 |
|---|---|
| I | quickstart.md에 세 게이트 실행과 "출력을 근거로 제시" 요건을 완료 판정에 넣었다 |
| II | data-model.md의 Evaluator가 `app` 계층에만 존재한다. contracts/org-master-api.md의 두 경로는 `api → app → store`를 지난다. UI 일관성 제약 절에서 재사용 대상과 금지 사항을 명시하고 T030·T031·T032·T035로 집행한다 |
| III | 신규 Go 오류는 `403`(권한 없음)과 `400`(검증 실패)뿐이며 도메인 오류 생성자로 만든다. contracts에 코드가 명시돼 있다 |
| IV | contracts에 계약 테스트 항목 26건(C-01~07, S-01~07, E-01~12)을 정의했다. plan의 파일 구조에 테스트 파일이 포함돼 있다 |
| V | 신규 UI 문자열이 생기므로 `en.json`·`ko.json` 동시 갱신이 필요하다. 파일 구조에 명시했다 |
| VI | 신규 파일이 모두 기존 디렉터리 안이다. 새 최상위 디렉터리를 만들지 않는다. 신규 SCSS 파일도 만들지 않는다 |
| VII | 설계 확정 후에도 마이그레이션이 없다 |
| VIII | 브랜치 `002-card-property-access` 단일. 잔재 키 정리는 이 기능의 데이터 모델에 직접 속하므로 무관한 리팩터가 아니다 |
| IX | 산출물이 모두 `specs/002-card-property-access/`에 있다 |

**설계 후에도 위반 없음.**

## Project Structure

### Documentation (this feature)

```text
specs/002-card-property-access/
├── plan.md              # 이 파일
├── research.md          # Phase 0 산출물
├── data-model.md        # Phase 1 산출물
├── quickstart.md        # Phase 1 산출물
├── contracts/           # Phase 1 산출물
│   ├── org-master-api.md
│   └── property-access-rules.md
├── checklists/
│   └── requirements.md  # /speckit-specify 산출물
└── tasks.md             # /speckit-tasks 산출물 (이 명령이 만들지 않음)
```

### Source Code (repository root)

```text
server/
├── model/
│   ├── property_access.go            # 신규 — 규칙·규칙집합 타입, 권한 등급
│   └── org.go                        # 신규 — 조직 단위·직책 조회 응답 타입
├── app/
│   ├── property_access.go            # 신규 — 평가기(Evaluator) 생성·판정
│   ├── property_access_test.go       # 신규 — 표 기반 단위 테스트
│   ├── org_master.go                 # 신규 — 조직 마스터 조회 (읽기 전용)
│   ├── blocks.go                     # 수정 — 조회·변경 경로에 관문 적용
│   └── boards.go                     # 수정 — 규칙 저장 시 변경자 기록, 잔재 키 정리
├── api/
│   ├── org.go                        # 신규 — 조직 조회 라우트 2개
│   ├── blocks.go                     # 수정 — 사용자 컨텍스트를 app 계층에 전달
│   └── search.go                     # 수정 — 검색 결과 필터
├── ws/
│   └── plugin_adapter.go             # 수정 — 블록 브로드캐스트 수신자별 필터
└── services/store/
    ├── store.go                      # 수정 — 조직 마스터 조회 인터페이스 추가
    ├── mockstore/mockstore.go        # 재생성 — make generate
    └── sqlstore/org_master.go        # 신규 — OrgUnits·PositionDefinitions·UserOrgProfiles 조회

webapp/src/
├── blocks/board.ts                   # 수정 — PropertyAccessRule 타입 추가
├── store/
│   ├── orgMaster.ts                  # 신규 — 조직 마스터 슬라이스
│   └── orgMaster.test.ts             # 신규
├── octoClient.ts                     # 수정 — 조직 조회 메서드 2개
└── components/shareBoard/
    ├── propertyAccessSection.tsx     # 신규 — 섹션 컨테이너 + 사용 스위치
    ├── propertyAccessRow.tsx         # 신규 — 규칙 행(연쇄 셀렉터 6개)
    ├── propertyAccessSection.test.tsx # 신규
    ├── propertyAccessRow.test.tsx    # 신규
    ├── shareBoard.tsx                # 수정 — 섹션 삽입
    └── shareBoard.scss               # 수정 — 섹션 스타일 추가 (신규 SCSS 파일 없음)

webapp/i18n/{en,ko}.json              # 수정 — 신규 문자열
```

## UI 일관성 제약

**이 기능은 새 디자인을 도입하지 않는다.** 신규 UI 요소는 공유 팝업에 이미 있는 패턴을 차용한다. 새 컴포넌트·클래스·색상 값을 만들기 전에 `webapp/src/widgets/`와 `shareBoard.scss`에서 같은 역할의 기존 자산을 먼저 찾는다. 새 시각 요소가 불가피하면 그 이유를 과제 설명에 남긴다.

### 재사용 대상

| 자산 | 위치 | 신규 섹션에서의 용도 |
|---|---|---|
| `MenuWrapper` + `Menu.Text` + `CheckIcon` | `webapp/src/components/shareBoard/userPermissionsRow.tsx` (역할 드롭다운) | 셀렉터 6개 전부 |
| `.tabs-content` (padding 24px 32px, border-radius 8px) | `webapp/src/components/shareBoard/shareBoard.scss` | 섹션 컨테이너 |
| `.user-items` · `.user-item` · `.user-item__content` · `.user-item__button` | 같은 파일 | 규칙 행 레이아웃 |
| `.text-heading2` · `.text-light` | 전역 | 섹션 제목·설명 |
| `getSelectBaseStyle()` | `webapp/src/theme.ts` | react-select를 쓰게 될 경우에만 |
| CSS 변수 `--center-channel-color-rgb`, `--button-bg-rgb` | 전역 | 색상. 하드코딩 금지 |
| `Metropolis, sans-serif` | shareBoard.scss | 제목 폰트 |

### 축별 컨트롤 확정

여섯 셀렉터 전부 **`MenuWrapper` + `Menu.Text` 계열**로 통일한다. 멤버 행의 역할 드롭다운과 같은 컨트롤이므로 한 화면 안에서 조작 방식이 갈리지 않는다.

`react-select`는 쓰지 않는다. 그 컴포넌트는 원격 검색이 필요한 멤버 검색 전용이며, 이 섹션의 선택지는 전부 이미 로드된 유한 목록(속성 옵션 · 본부 4 · 부서 10 · 직책 4 · 권한 3)이라 원격 검색이 필요 없다.

### 스타일 파일

**신규 SCSS 파일을 만들지 않는다.** 섹션 스타일은 `shareBoard.scss`의 `.ShareBoardDialog` 블록 안에 추가한다. 같은 다이얼로그의 스타일이 두 파일로 갈리면 규격이 어긋나기 시작한다.

---

**Structure Decision**: 기존 레이어 구조(`api → app → store`)를 그대로 따르고 신규 파일을 각 레이어에 하나씩 추가한다. 평가기를 `server/app/property_access.go` 한 파일에 격리해 순수 함수에 가깝게 유지하고, 집행 지점은 그 평가기를 호출하기만 한다. UI는 `shareBoard.tsx`가 이미 큰 파일이므로 섹션을 별도 컴포넌트 파일로 분리해 `shareBoard.tsx`에는 삽입 지점만 남긴다.

## 조직 데이터 접근 — 현재와 이후

조직 마스터와 사용자 배정은 메인 서버 소유다. **지금은 같은 DB를 읽기 전용으로 직접 SELECT 한다**(research.md R5.1).

메인 서버가 아래 개선을 반영하면 내부 구현만 교체한다. `docs/upstream-org-role-requests.md` 부록 A·B 참조.

| 메인 서버 작업 | 반영 후 Boards 조치 |
|---|---|
| T1 읽기 전용 권한 헬퍼 분리 | 자체 경로는 유지하고 내부를 메인 서버 호출로 교체 |
| T2 `UserOrgProfileSummary`에 ID 추가 | `UserOrgProfiles` 직접 SELECT 제거 |
| T3 다건 조직 프로필 조회 | 웹소켓 수신자 필터의 `WHERE UserID IN (...)`을 API 호출로 교체 |
| T4 기능 플래그 정책 확정 | **없음** — 플래그를 읽지 않기로 확정. fail-open 회피 |

**이 계획의 과제(T004~T063)는 메인 서버 작업에 의존하지 않는다.** 자체 경로의 외부 계약(`/plugins/focalboard/api/v2/teams/{teamID}/org-units`·`/duties`)이 바뀌지 않으므로 웹앱도 영향받지 않는다.

## 구현 단계

명세의 우선순위(P1~P5)를 구현 순서로 옮긴 것이다. 각 단계는 독립적으로 검증 가능하다.

| 단계 | 대응 | 범위 | 완료 판정 |
|---|---|---|---|
| 1 | 기반 | 조직 마스터 조회(store·app·api) + 평가기 + 단위 테스트 | 평가기가 research.md 판정표대로 동작. 화면 변화 없음 |
| 2 | P1 전반 | 규칙 타입·저장·잔재 정리 + 공유 팝업 섹션 UI | 규칙을 저장·재조회할 수 있다. 아직 집행하지 않는다 |
| 3 | P1 완성 | 읽기 집행 — 블록·카드 조회에서 제외(자식 블록 동반) | 권한 없는 카드가 목록에서 사라진다 |
| 4 | P2 | 쓰기 집행(수정·삭제 거부) | 클라이언트 우회 요청이 거부된다 |
| 5 | P2 완성 | 검색 필터 + 웹소켓 수신자별 필터 | 검색·실시간 경로로 새지 않는다 |
| 6 | P3·P4 | 직책 가산과 전체보기 하한 (평가기에 이미 포함, 여기서는 UI·통합 검증) | 직책·전체보기 시나리오가 통과한다 |
| 7 | P5 | 마지막 변경자 기록·표시 | 다른 관리자 계정에서 변경자가 보인다 |

**3단계까지만 배포하면 화면상 격리는 보이지만 보안은 성립하지 않는다.** 4~5단계 없이 배포한다면 그 사실을 릴리스 노트에 명시해야 한다(spec User Story 2).

## Complexity Tracking

Constitution Check에 위반이 없으므로 작성하지 않는다.
