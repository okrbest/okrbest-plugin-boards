# Implementation Plan: 본부·부서 속성과 조직 기반 선택지 좁히기

**Branch**: `005-org-scoped-properties` | **Date**: 2026-08-08 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-org-scoped-properties/spec.md`

## Summary

카드에 본부·부서를 적을 속성 종류 둘을 더하고, 거기 적힌 값으로 그다음 선택지를
좁힌다 — 본부가 부서를, 본부·부서가 담당자를 좁힌다.

접근은 **읽기 전용 조직 데이터를 한 번 받아 화면에서 계산**하는 쪽이다. 사람
선택기가 Redux를 동기로 읽고 세 화면에서 쓰이므로, 좁히기를 서버 왕복으로 만들면
배선이 넓게 흔들린다(research R1). 서버 몫은 엔드포인트 하나뿐이고 나머지는 전부
webapp 순수 함수다.

새 타입을 얹기 전에 **선행 정리가 하나 있다.** 다중값·사람 판정이 `'multiPerson'`
같은 문자열 비교로 12개 파일 20군데에 흩어져 있어(research R2), 그대로 두면 새
타입마다 20군데를 훑어야 하고 하나만 놓쳐도 조용한 결함이 남는다.

## Technical Context

**Language/Version**: Go 1.24.6 (server), TypeScript 5.7 + React 19 (webapp)

**Primary Dependencies**: Gorilla Mux, Squirrel (server) / Redux Toolkit, react-select (webapp)

**Storage**: 새 스키마 없음. 카드 속성값은 기존 `Block.Fields["properties"]` JSON을
쓰고, 조직 데이터는 메인 서버 소유 테이블(`OrgUnits`, `UserOrgProfiles`)을 읽기만 한다

**Testing**: `go test -race ./...` (colocated `_test.go`) / Jest + React Testing
Library (colocated `*.test.tsx`)

**Target Platform**: Mattermost 플러그인 (min_server_version 10.7.0)

**Project Type**: 단일 저장소 플러그인 — `server/`(Go) + `webapp/`(React)

**Performance Goals**: 조직 데이터는 보드를 열 때 한 번 받는다. 좁히기는 순수 함수
계산이라 선택지를 열 때마다 서버 왕복이 없다

**Constraints**: 좁히기는 입력 편의이지 접근 통제가 아니다 — 서버는 저장 시 값을
검증하지 않는다(spec Assumptions). 조직 마스터는 읽기만 하며 이 플러그인이 정리를
결정하지 않는다

**Scale/Scope**: 새 속성 타입 2개, 새 엔드포인트 1개, 선행 정리 20군데,
필터 패널 1개. 검증 기준 조직은 본부 7개·부서 18개·사용자 65명

## Constitution Check

*GATE: Phase 0 전에 통과해야 하고, Phase 1 설계 후 재확인한다.*

| 원칙 | 판정 | 근거 |
|---|---|---|
| **I. 패키지별 품질 게이트** | 통과 | webapp·server 둘 다 닿으므로 `make webapp-ci`·`make server-lint`·`make server-test`를 모두 실행한다. 인터페이스 변경으로 mock을 바꾸면 `make generate`를 같은 변경에 포함한다. 판정은 실패 스위트 목록 diff로 한다([quickstart.md](./quickstart.md) 6절) |
| **II. 레이어 경계·기존 패턴** | 통과 | 새 엔드포인트는 `api → app → store` 순서를 지키고 App·Store에 새 메서드를 만들지 않는다(`GetUserOrgProfiles` 재사용). UI는 기존 패턴을 차용한다 — 에디터는 `multiselect`, 필터 패널은 `person` 갈래, 사람 좁히기는 `PersonSelector`에 선택적 prop 추가. **새 SCSS 파일·새 위젯·색상 하드코딩 없음** |
| **III. 타입·오류 처리** | 통과 | `as any`·`@ts-ignore` 없이 `PropertyTypeEnum`·`FilterValueType` 유니온을 확장한다. 서버 오류는 `model.NewErrPermission()` 등 도메인 생성자를 쓴다 |
| **IV. 동작 변경 시 테스트 동반** | 통과 (단서 있음) | 좁히기 셀렉터는 순수 함수라 단위 테스트가 쉽다. 엔드포인트는 app·api 테스트, 에디터·선택기는 컴포넌트 테스트. **선행 정리(research R2)만 예외** — 행동을 바꾸지 않는 정리이므로 기존 테스트가 그대로 통과하는 것이 증거다. 새 테스트를 쓰면 오히려 "행동이 바뀌었다"는 잘못된 신호가 된다 |
| **V. i18n 동기화** | 통과 | 속성 종류 이름·자리표시·필터 문구를 `webapp/i18n/en.json`·`ko.json`에 같은 변경으로 넣는다([contracts/property-types.md](./contracts/property-types.md) 7절) |
| **VI. Upstream·라이선스** | 통과 | 라이선스 헤더 유지, 플러그인 ID·API 경로 불변. 새 파일은 `properties/`·`api/org.go` 등 기존 구조 안에 만들어 업스트림 머지 충돌을 늘리지 않는다 |
| **VII. DB 마이그레이션** | 해당 없음 | 스키마 변경이 없다. 카드 속성값은 기존 자유 형식 JSON이고 조직 테이블은 메인 서버 소유다 |
| **VIII. 브랜치·커밋·PR** | 통과 | `005-org-scoped-properties` 브랜치, Conventional Commits, PR 경유. 선행 정리와 기능 추가를 **다른 커밋으로** 나눈다 — 한 변경 = 한 관심사 |
| **IX. Spec 주도 워크플로** | 통과 | brainstorming → specify → plan 순서를 거쳤다. 산출물은 `specs/005-org-scoped-properties/`에 커밋한다 |

**위반 없음.** Complexity Tracking 기록 불필요.

## Project Structure

### Documentation (this feature)

```text
specs/005-org-scoped-properties/
├── plan.md                        # 이 파일
├── spec.md                        # 요구사항 정본
├── research.md                    # Phase 0 — 결정과 근거
├── data-model.md                  # Phase 1 — 저장 형식과 파생 집합
├── quickstart.md                  # Phase 1 — 종단 검증 절차
├── contracts/
│   ├── org-profiles-api.md        # 새 엔드포인트 계약
│   └── property-types.md          # 속성 타입이 주변 코드와 맺는 계약
├── checklists/
│   └── requirements.md            # 명세 품질 검증
└── tasks.md                       # Phase 2 — /speckit-tasks 산출물 (아직 없음)
```

### Source Code (repository root)

```text
server/
├── api/
│   └── org.go                     # [수정] GET /boards/{boardID}/org-profiles 추가
└── app/
    └── org_master.go              # [변경 없음] GetUserOrgProfiles 재사용

webapp/src/
├── properties/
│   ├── types.tsx                  # [수정] isMultiValue·isPersonLike 추가
│   ├── index.tsx                  # [수정] 새 타입 둘 등록
│   ├── orgDivision/               # [신규] property.tsx + 에디터
│   ├── orgDepartment/             # [신규] property.tsx + 에디터
│   ├── multiselect/·multiperson/· # [수정] 새 능력에 값 채우기
│   │   person/·select/ 등
│   └── ...
├── store/
│   └── orgMaster.ts               # [수정] 소속 보관 + 좁히기 셀렉터
├── components/
│   ├── personSelector.tsx         # [수정] allowedUserIds prop 추가
│   ├── viewHeader/filterPanel/
│   │   └── filterValuePanel.tsx   # [수정] 'orgUnit' 갈래 + 전용 패널
│   ├── table/·kanban/·centerPanel # [수정] 문자열 비교 → 레지스트리 조회
│   └── ...
├── blocks/board.ts                # [수정] PropertyTypeEnum 확장
├── mutator.ts                     # [수정] 본부 변경 시 부서 정리
├── csvExporter.ts                 # [수정] 조직 값 내보내기 예외
└── octoClient.ts                  # [수정] getOrgProfiles 추가

webapp/i18n/
├── en.json                        # [수정] 새 문자열
└── ko.json                        # [수정] 새 문자열
```

**Structure Decision**: 기존 플러그인 구조를 그대로 쓴다. 새 디렉터리는
`webapp/src/properties/` 아래 속성 타입 둘뿐이며, 이는 기존 속성 타입이 모두
따르는 관례다(`person/`, `multiselect/` 등). 서버에는 새 파일을 만들지 않고
조직 조회가 모여 있는 `api/org.go`에 핸들러 하나를 더한다.

## 단계 나누기

명세의 사용자 이야기 우선순위를 따르되, 선행 정리를 맨 앞에 둔다.

| 단계 | 내용 | 근거 |
|---|---|---|
| **0. 선행 정리** | `isMultiValue`·`isPersonLike` 도입, 20군데 호출부 교체 | research R2. 이걸 먼저 하면 이후 단계에서 새 타입이 자동으로 포함된다 |
| **1. 데이터 경로** | 엔드포인트 + `octoClient` + `orgMaster` 보관 + 좁히기 셀렉터 | 이후 모든 단계가 이 위에 선다. 셀렉터는 순수 함수라 UI 없이 단위 테스트로 검증된다 |
| **2. 속성 타입 (P1)** | 타입 둘 등록, 에디터, 표시 | spec P1. 여기까지면 조직을 카드에 적을 수 있다 |
| **3. 부서 좁히기 (P2)** | 부서 에디터가 셀렉터를 쓰고, 본부 변경 시 정리 | spec P2 |
| **4. 사람 좁히기 (P3)** | `PersonSelector` prop + `confirmPerson` 배선 | spec P3 |
| **5. 필터 (P4)** | `'orgUnit'` 갈래 + 전용 패널 | spec P4. research R3에서 규모가 person 패널에 준한다고 확인 — **따로 떼어도 앞 단계가 완결된다** |
| **6. 그룹화·CSV (P4)** | CSV 예외 추가. 그룹화는 0단계 덕에 추가 작업 없음 | spec P4 |

각 단계는 독립적으로 검증 가능하며, 1~4까지만 해도 명세의 핵심 가치가 성립한다.

## Complexity Tracking

> Constitution Check에 위반이 없으므로 비워 둔다.
