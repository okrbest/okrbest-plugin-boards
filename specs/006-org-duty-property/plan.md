# Implementation Plan: 직책 속성

**Branch**: `006-org-duty-property` | **Date**: 2026-08-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/006-org-duty-property/spec.md`

## Summary

직책을 본부·부서와 같은 자리에 놓는다. 새 속성 타입 `orgDuty` 하나를 더하고, 카드에
직책을 여러 개 적고 거르고 묶고 내보낼 수 있게 한다.

**서버는 건드리지 않는다.** 직책 목록 엔드포인트도, 조직 마스터 조회도 005가 이미
만들어 뒀고 화면까지 실려 있다. 이번 작업은 실려 있는 데이터를 속성 체계에 연결하는
일이다.

기술적 핵심은 **복제하지 않고 넓히는 것**이다. 본부·부서 에디터는 이미 하나를 공유한다
(`orgUnitEditor`). 그 에디터도, 필터 패널도, 이름 해석도 실제로는 `{id, name}`만
쓴다. 직책 전용 복제본을 만들지 않고 입력 타입을 실제로 쓰는 만큼으로 낮춰 셋이 같은
경로를 지나게 한다 — 그래야 FR-012(세 속성이 한 몸처럼 움직인다)가 코드 구조로
보장된다.

## Technical Context

**Language/Version**: TypeScript 5.7 + React 19 (webapp 전용)

**Primary Dependencies**: Redux Toolkit, react-select (`ValueSelector` 경유)

**Storage**: 새 스키마 없음. 값은 기존 `Block.Fields["properties"]` JSON에 직책 ID
배열로 들어간다. 직책 마스터는 메인 서버 소유(`PositionDefinitions`)이며 읽기만 한다

**Testing**: Jest + React Testing Library, 대상 옆 colocated `*.test.tsx`

**Target Platform**: Mattermost 플러그인 (min_server_version 10.7.0)

**Project Type**: 단일 저장소 플러그인 — 이번 변경은 `webapp/`만 닿는다

**Performance Goals**: 서버 왕복 추가 0회. 직책 목록은 팀에 들어올 때 조직 마스터와
함께 이미 받아 두었고(`fetchOrgMaster`), 이 기능은 redux에 있는 것을 읽기만 한다

**Constraints**: 직책 마스터는 읽기 전용이다. 서버는 저장 시 값을 검증하지 않으므로,
사라진 직책 ID가 카드에 남는 상태를 정상으로 다뤄야 한다(FR-006)

**정렬**: 서버가 이미 서열·이름 순으로 정렬해 내려준다(`GetDutiesForTeam`). 화면에서
다시 정렬하지 않는다 — 순서의 정의가 두 곳에 생기면 갈라진다

**Scale/Scope**: 새 속성 타입 1개, 새 엔드포인트 0개, 접점 8곳. 검증 기준 조직은
활성 직책 9개(CEO·고문·본부장·CFO·CHRO·COO·CSO·팀장·팀원), 직위 9개(보이면 안 됨)

## Constitution Check

*GATE: Phase 0 전에 통과해야 하고, Phase 1 설계 후 재확인한다.*

| 원칙 | 판정 | 근거 |
|---|---|---|
| **I. 패키지별 품질 게이트** | 통과 | `webapp/`만 닿으므로 `make webapp-ci`가 게이트다. server 게이트는 해당 없음 — Go 파일을 하나도 바꾸지 않는다. 화면 동작이 바뀌므로 게이트만으로 부족하다: 빌드·배포 후 [quickstart.md](./quickstart.md)를 실제 계정으로 훑는다. 판정은 실패 스위트 목록 diff |
| **II. 레이어 경계·기존 패턴** | 통과 | 서버 무변경이라 레이어 경계는 해당 없음. UI는 전부 차용이다 — 에디터는 `orgUnitEditor` 공유, 필터는 기존 조직 패널, 묶기·내보내기는 기존 해석기를 넓힌다. **새 SCSS 파일 0개, 새 위젯 0개, 색상 하드코딩 0곳** |
| **III. 타입·오류 처리** | 통과 | `as any`·`@ts-ignore` 없이 `PropertyTypeEnum` 유니온을 확장한다. 에디터 props는 캐스팅이 아니라 **구조적 최소 타입**으로 낮춰 본부·부서·직책을 모두 받는다(research R1) |
| **IV. 동작 변경 시 테스트 동반** | 통과 | 네 갈래 모두 테스트를 동반한다 — 에디터(다중 선택·사라진 값), 필터 패널, 묶기 이름 해석, CSV. 0단계(준비)만 예외: 행동을 바꾸지 않는 타입 정리라 기존 테스트가 그대로 통과하는 것이 증거다 |
| **V. i18n 동기화** | 통과 | `PropertyType.OrgDuty`를 `en.json`·`ko.json`에 같은 변경으로 넣는다. 필터 검색창 문구는 기존 것을 재사용하므로 새 문자열은 하나뿐이다 |
| **VI. Upstream·라이선스** | 통과 | 라이선스 헤더 유지. 새 파일은 `webapp/src/properties/orgDuty/` 하나로, 기존 속성 타입이 모두 따르는 관례 안에 있다. 플러그인 ID·API 경로 불변 |
| **VII. DB 마이그레이션** | 해당 없음 | 스키마 변경이 없다 |
| **VIII. 브랜치·커밋·PR** | 통과 | `006-org-duty-property` 브랜치를 작업 시작 전에 만들었다. Conventional Commits, PR 경유 rebase 머지. 0단계(준비)와 기능 추가를 다른 커밋으로 나눈다 |
| **IX. Spec 주도 워크플로** | 통과 | brainstorming → specify → plan 순서를 거쳤다. 산출물은 `specs/006-org-duty-property/`에 커밋한다 |

**위반 없음.** Complexity Tracking 기록 불필요.

**Phase 1 설계 후 재확인 (2026-08-14)**: 판정 그대로다. 설계에서 접점이 하나 늘었지만
(묶기 이름 해석 — `canGroup`만으로는 ID가 찍힌다) 새 컴포넌트도 새 스타일도 아니라
원칙 II를 건드리지 않는다. 이름 해석 셀렉터를 스토어에 두는 결정(research R2)은
원칙 II의 "상태는 Redux 슬라이스로"와 결이 같다.

## Project Structure

### Documentation (this feature)

```text
specs/006-org-duty-property/
├── plan.md                        # 이 파일
├── spec.md                        # 요구사항 정본
├── research.md                    # Phase 0 — 결정과 근거
├── data-model.md                  # Phase 1 — 저장 형식과 이름 해석
├── quickstart.md                  # Phase 1 — 종단 검증 절차
├── contracts/
│   └── property-types.md          # 직책 타입이 주변 코드와 맺는 계약
├── checklists/
│   └── requirements.md            # 명세 품질 검증
└── tasks.md                       # Phase 2 — /speckit-tasks 산출물
```

### Source Code (repository root)

```text
webapp/src/
├── blocks/board.ts                # [수정] PropertyTypeEnum에 'orgDuty' 추가
├── properties/
│   ├── orgUnitEditor.tsx          # [수정] props 타입을 {id, name} 최소 구조로 낮춤
│   ├── orgDuty/                   # [신규] property.tsx + orgDuty.tsx
│   └── index.tsx                  # [수정] 레지스트리 등록 — 속성 유형 메뉴는 이걸 그린다
├── store/
│   └── orgMaster.ts               # [수정] 이름 해석용 셀렉터 추가 (본부·부서·직책 공용)
├── components/
│   ├── centerPanel.tsx            # [수정] 묶기 이름 해석에 직책 포함 (574행 분기)
│   └── viewHeader/filterPanel/
│       └── filterValuePanel.tsx   # [수정] 조직 필터 패널의 선택지 출처에 직책 추가
└── csvExporter.ts                 # [수정] 조직 타입 집합에 직책 추가 + 이름 출처 확장

webapp/i18n/
├── en.json                        # [수정] PropertyType.OrgDuty = "Duty"
└── ko.json                        # [수정] PropertyType.OrgDuty = "직책"
```

**Structure Decision**: 기존 구조를 그대로 쓴다. 새 디렉터리는
`webapp/src/properties/orgDuty/` 하나이며, 이는 모든 속성 타입이 따르는 관례다
(`person/`, `orgDivision/` 등). 서버 디렉터리는 열지 않는다.

**손대지 않는 곳** — 접점을 세는 것만큼 세지 않는 것을 밝히는 게 중요하다.

- `mutator.ts` — 본부가 바뀌면 부서를 정리하는 로직이 있다. 직책은 위아래 관계가
  없어 대응물이 없다(FR-003).
- `properties/person/confirmPerson.tsx` — 담당자 후보 좁히기. 직책은 참여하지
  않는다(FR-010).
- `components/shareBoard/` — 접근 규칙. 규칙 편집기가 선택지 목록을 가진 속성만
  고르는데 조직 속성은 그 목록이 늘 비어 있어, 본부·부서와 똑같이 자동으로 빠진다
  (FR-011). **코드를 고쳐서 막는 게 아니라 이미 구조가 막는다.**

## 단계 나누기

명세의 사용자 이야기 우선순위를 따르되, 준비 작업을 맨 앞에 둔다.

| 단계 | 내용 | 근거 |
|---|---|---|
| **0. 준비** | `PropertyTypeEnum` 확장, 에디터 props 타입 낮추기, 이름 해석 셀렉터 도입 | research R1·R2. 행동을 바꾸지 않는다. 이걸 먼저 하면 이후 단계가 분기 대신 등록으로 끝난다 |
| **1. 속성 타입 (P1)** | `orgDuty` 등록 + 에디터 + i18n | spec P1. 여기까지면 카드에 직책을 적을 수 있다 — 그 자체로 쓸 만하다 |
| **2. 필터·묶기 (P2)** | 필터 패널 선택지 출처, 묶기 이름 해석 | spec P2. 둘 다 "이름을 어디서 가져오나" 하나의 문제라 같이 간다 |
| **3. 내보내기 (P3)** | CSV 조직 타입 집합 확장 | spec P3. 앞 단계와 독립이라 따로 떼도 된다 |

1단계까지만 해도 명세의 핵심 가치가 성립한다. 2·3단계는 각각 독립으로 검증된다.

## Complexity Tracking

> Constitution Check에 위반이 없어 기록할 항목이 없다.
