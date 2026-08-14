# Implementation Plan: OKR Board로 사용

**Branch**: `008-okr-board-mode` | **Date**: 2026-08-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/008-okr-board-mode/spec.md`

## Summary

보드에 "이건 OKR 보드다"를 한 번 표시하면, 그다음부터 새 카드의 유형이 단계에 맞게
채워진다. 1단계 Objective, 2단계 Key Results, 3단계 이상 Tasks.

**서버를 닿는다.** 006·007과 다른 점이고 이번 계획의 중심이다. 최상위 카드는
클라이언트가 만들지만 하위 카드는 서버가 부모를 읽어 만들기 때문이다. 클라이언트가
속성을 실어 보내면 서버가 부모 상속 블록을 통째로 건너뛰므로, 하위 카드를
클라이언트에서 채우면 본부·부서가 안 내려간다 — 실제 회귀다
([research.md](./research.md) R4).

설정은 **이름이 아니라 옵션 ID**로 단계를 가리킨다. 사용자가 `Tasks`를 `할 일`로
바꿔도 단계가 유지되어야 하기 때문이다(FR-005).

## Technical Context

**Language/Version**: Go 1.24.6 (server), TypeScript 5.7 + React 19 (webapp)

**Primary Dependencies**: Gorilla Mux, Squirrel (server) / Redux Toolkit (webapp)

**Storage**: 새 스키마 없음. 설정은 기존 `board.properties` JSON에 키 하나로 들어간다.
유형 속성 자체는 기존 `board.card_properties` 구조를 그대로 쓴다

**Testing**: `go test -race ./...` (colocated `_test.go`) / Jest + React Testing
Library (colocated `*.test.tsx`)

**Target Platform**: Mattermost 플러그인 (min_server_version 10.7.0)

**Project Type**: 단일 저장소 플러그인 — 이번 변경은 `server/`와 `webapp/` 둘 다 닿는다

**Performance Goals**: 추가 왕복 0회. 서버는 `CreateSubCard`에서 이미 보드를 읽고
있고, 클라이언트는 이미 받아 둔 보드 객체에서 설정을 읽는다

**Constraints**: 자동 채움은 시작값이지 유지 조건이 아니다. 만든 뒤에는 아무도
되돌리지 않는다(FR-010)

**카드 생성 입구**: 최상위 생성 호출부는 10곳인데 `centerPanel`의 `addCard`로 모였다가
**보기에 기본 템플릿이 있으면 `addCardFromTemplate`으로 갈라진다.** 하위 생성은 표와
카드 상세 둘인데 둘 다 `mutator.createSubCard`를 지나 서버 `CreateSubCard`로 간다.
**채울 자리는 셋이다** — 빈 카드, 템플릿 카드, 하위 카드

**템플릿 카드의 깊이**: 0이라고 가정할 수 없다. 블록 복제가 `depth`를 그대로 복사하고,
"New template from card"가 하위 카드에서도 열린다. 깊이는 만들어진 카드에서 읽는다
(FR-006a)

**Scale/Scope**: 새 엔드포인트 0개, 새 스키마 0개. 접점 webapp 4곳 + server 2곳

## Constitution Check

*GATE: Phase 0 전에 통과해야 하고, Phase 1 설계 후 재확인한다.*

| 원칙 | 판정 | 근거 |
|---|---|---|
| **I. 패키지별 품질 게이트** | 통과 | `webapp/`·`server/` 둘 다 닿으므로 `make webapp-ci`·`make server-lint`·`make server-test`를 모두 실행한다. **CI가 `server-test`를 집행하지 않으므로 로컬 실행 출력을 완료 근거로 제시한다.** 화면 동작이 바뀌므로 배포 후 [quickstart.md](./quickstart.md)를 실제 계정으로 훑는다 |
| **II. 레이어 경계·기존 패턴** | 통과 | 서버는 `API → App → Store` 순서를 지킨다 — 새 엔드포인트 없이 `app/cards.go`의 기존 생성 흐름 안에서만 움직이고 store를 직접 부르지 않는다. UI는 접근 규칙 섹션의 모양(제목·설명·스위치)을 차용한다. **새 SCSS 파일 0개, 새 위젯 0개** |
| **III. 타입·오류 처리** | 통과 | `as any`·`@ts-ignore` 없이 진행한다. Go 오류는 `model.NewErrBadRequest()` 등 도메인 생성자를 쓴다. 보드 설정은 자유 형식 JSON에서 오므로 읽을 때 형태를 확인하고, 깨진 값은 "설정 없음"으로 떨어뜨린다 |
| **IV. 동작 변경 시 테스트 동반** | 통과 | 깊이→값 매핑과 설정 읽기는 순수 함수라 양쪽에서 단위 시험이 쉽다. 서버는 `app/cards_test.go`에 깊이별 시험과 **부모 상속이 끊기지 않는지**를 더한다(FR-008, SC-003) |
| **V. i18n 동기화** | 통과 | 체크박스 제목·설명을 `en.json`·`ko.json`에 같은 변경으로 넣는다. **속성 이름 `유형`과 값 이름은 번역하지 않는다** — 번역하면 이미 만들어 둔 속성을 못 알아본다(spec Assumptions) |
| **VI. Upstream·라이선스** | 통과 | 라이선스 헤더 유지. 새 파일은 기존 디렉터리 안에 만든다. 플러그인 ID·API 경로 불변 |
| **VII. DB 마이그레이션** | 해당 없음 | 스키마 변경이 없다. `board.properties`와 `card_properties`는 기존 JSON 칼럼이다 |
| **VIII. 브랜치·커밋·PR** | 통과 | `008-okr-board-mode` 브랜치를 작업 전에 만들었다. Conventional Commits, PR 경유 rebase 머지 |
| **IX. Spec 주도 워크플로** | 통과 | brainstorming → specify → plan 순서를 거쳤다. 산출물은 `specs/008-okr-board-mode/`에 커밋한다 |

**위반 없음.** Complexity Tracking 기록 불필요.

**Phase 1 설계 후 재확인 (2026-08-14)**: 판정 그대로다. 설계가 새로 만든 것은 Go
모델 하나(설정 읽기·쓰기)와 webapp 순수 함수 하나, 그리고 공유 대화상자 섹션 하나다.
셋 다 기존 패턴을 그대로 따른다. 서버에서 채우는 자리가 `fillDefaultConditionValues`
바로 옆이라 레이어가 새로 생기지 않는다.

## Project Structure

### Documentation (this feature)

```text
specs/008-okr-board-mode/
├── plan.md                        # 이 파일
├── spec.md                        # 요구사항 정본
├── research.md                    # Phase 0 — 결정과 근거
├── data-model.md                  # Phase 1 — 설정 형태와 채움 규칙
├── quickstart.md                  # Phase 1 — 종단 검증 절차
├── contracts/
│   └── okr-board-mode.md          # 설정과 채움이 주변과 맺는 계약
├── checklists/
│   └── requirements.md            # 명세 품질 검증
└── tasks.md                       # Phase 2 — /speckit-tasks 산출물
```

### Source Code (repository root)

```text
server/
├── model/
│   └── okr_board.go               # [신규] 설정 형태와 읽기 (propertyAccess 패턴)
└── app/
    └── cards.go                   # [수정] CreateSubCard에서 깊이 값으로 유형을 덮는다

webapp/src/
├── blocks/board.ts                # [수정] 설정 타입
├── okrBoard.ts                    # [신규] 깊이→값 매핑, 설정 읽기 (순수 함수)
├── components/
│   ├── shareBoard/
│   │   ├── shareBoard.tsx         # [수정] 접근 권한 섹션 위에 새 섹션을 끼운다
│   │   └── okrBoardSection.tsx    # [신규] 체크박스와 켤 때의 준비
│   └── centerPanel.tsx            # [수정] addCard가 1단계 값을 싣는다
└── mutator.ts                     # [수정] 속성 준비와 설정 저장을 한 번에 쓴다

webapp/i18n/
├── en.json                        # [수정] 체크박스 문구
└── ko.json                        # [수정] 체크박스 문구
```

**Structure Decision**: 서버는 새 파일 하나(`model/okr_board.go`)만 만든다 —
`model/property_access.go`가 같은 일을 하는 짝이라 옆에 둔다. webapp의 순수 함수는
`src/okrBoard.ts`에 둔다. 007에서 조직 색을 `properties/orgLabels.ts`에 얹은 것과 같은
판단이지만, 이번 규칙은 속성 유형이 아니라 **보드 전체**에 관한 것이라
`properties/` 아래가 아니다.

**손대지 않는 곳**

- `mutator.createSubCard`와 `octoClient.createSubCard` — 클라이언트는 하위 카드의
  유형에 관여하지 않는다. 속성을 실어 보내는 순간 부모 상속이 끊긴다
  ([research.md](./research.md) R4).
- 카드 복제·가져오기·실행 취소 경로 — 범위 밖이다.
- `Constants.maxCardDepth`와 하위 카드 규칙 — 그대로다.
- 002의 접근 규칙 판정 — 이 기능은 그 뒤에 서고, 규칙이 정한 값을 덮지 않는다
  ([research.md](./research.md) R5).

## 단계 나누기

명세의 사용자 이야기 우선순위를 따르되, 양쪽이 공유하는 규칙을 맨 앞에 둔다.

| 단계 | 내용 | 근거 |
|---|---|---|
| **0. 규칙** | 설정 형태를 서버·클라이언트 양쪽에 세운다. 깊이→값 매핑, 설정 읽기 | 세 이야기가 모두 이 위에 선다. 순수 함수라 UI 없이 검증된다 |
| **1. 표시 (P1)** | 공유 대화상자 섹션, 속성 준비, 설정 저장 | spec US1. 여기까지면 보드가 OKR 보드임을 기억한다 |
| **2. 최상위 채움 (P2)** | `addCard`가 1단계 값을 싣는다 | spec US2 앞쪽. 클라이언트만 닿는다 |
| **3. 하위 채움 (P2)** | `CreateSubCard`가 깊이 값으로 유형을 덮는다 | spec US2 뒤쪽. **서버 게이트가 여기서 걸린다** |
| **4. 안 건드림 확인 (P2)** | 이미 있는 값·사용자가 바꾼 값·끈 보드 | spec US3. 앞 단계들의 반대편이라 따로 검증한다 |

1단계까지만 해도 "이 보드는 OKR 보드"라는 표시가 남는다. 2단계는 클라이언트만,
3단계는 서버만 닿으므로 따로 배포해도 각각 완결된다.

## Complexity Tracking

> Constitution Check에 위반이 없어 기록할 항목이 없다.
