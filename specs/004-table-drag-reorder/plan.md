# Implementation Plan: 표 보기 드래그 재정렬·중첩

**Branch**: `004-table-drag-reorder` | **Date**: 2026-08-05 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/004-table-drag-reorder/spec.md`

## Summary

표 보기에서 카드 왼쪽 핸들을 잡아 끌면 순서와 계층을 한 제스처로 바꾼다. 끄는 동안 놓일 경계에 선을 그려 결과를 미리 보여주고, 커서의 가로 위치가 계층 깊이를 정한다. 하위 카드를 거느린 카드는 서브트리째 움직인다.

계층 이동에 필요한 서버 기능은 이미 완비돼 있다 — `POST`/`DELETE /cards/{id}/link`와 자손 깊이 재귀 갱신·순환 검증. **이번 작업은 서버를 건드리지 않는 webapp 배선이다.**

핵심 설계는 "어디에 놓일 수 있는가"의 판정을 React와 무관한 순수 모듈 하나로 뽑는 것이다. 깊이는 **이웃 행**에 의존하므로 행 로컬 상태로 풀 수 없고, 규격의 대부분(경계 계산·깊이 클램프·순환 금지)이 이 모듈에 모인다. 덕분에 표를 렌더하지 않고 규칙 전체를 단위 테스트할 수 있다.

## Technical Context

**Language/Version**: TypeScript 5.7, React 19

**Primary Dependencies**: `react-dnd` 14 + `react-dnd-html5-backend`(기존), Redux Toolkit(기존), SCSS. **신규 의존성 없음.**

**Storage**: N/A — 기존 blocks/cards API를 그대로 쓴다. 스키마 변경 없음.

**Testing**: Jest + React Testing Library (colocated `*.test.ts` / `*.test.tsx`)

**Target Platform**: Mattermost 플러그인 webapp (데스크톱 브라우저, 마우스 입력)

**Project Type**: 기존 웹앱 화면의 상호작용 개선. 서버 변경 없음.

**Performance Goals**: 드래그 중 커서 이동이 프레임을 떨어뜨리지 않아야 한다. `react-dnd`의 `hover`는 픽셀마다 호출되므로 `requestAnimationFrame`으로 합친다. 목표는 프레임당 판정 1회.

**Constraints**:
- 서버 코드 무변경 (spec Assumptions)
- 칸반 드래그 무회귀 — `'card'` itemType과 `useSortable`을 유지한다 (FR-030)
- 신규 의존성 금지 — `@dnd-kit` 전환은 범위 밖 (design.md D6)
- 최대 깊이 5, 들여쓰기 눈금 22px는 현재 값 그대로 (spec Assumptions)

**Scale/Scope**: 화면 1개(표 보기). 신규 파일 5개, 수정 파일 4개, i18n 2개. 서버 0.

## Constitution Check

*GATE: Phase 0 전 통과 필수. Phase 1 설계 후 재확인.*

| 원칙 | 판정 | 근거 |
|---|---|---|
| I. 패키지별 품질 게이트 | 통과 | `webapp/`만 변경 → `make webapp-ci`가 게이트다. 서버 무변경이라 `server-lint`/`server-test`는 해당 없음. mock 재생성 불필요(인터페이스 무변경) |
| II. 레이어 경계·기존 패턴 | **조건부 통과 — Complexity Tracking 기재** | Redux 슬라이스·함수형 컴포넌트·SCSS+BEM 준수. 다만 **신규 시각 요소(드롭 인디케이터 선)와 신규 컴포넌트 5개**가 생긴다. 사용자가 명시적으로 요청한 디자인이므로 원칙의 예외 조건을 충족하나, 아래에 기재한다 |
| III. 타입·오류 처리 엄격성 | 통과 | `as any`·`@ts-ignore` 없이 작성한다. `DropIntent`를 명시 타입으로 두고 `null`로 "놓을 수 없음"을 표현해 옵셔널 체이닝 남용을 피한다 |
| IV. 동작 변경 시 테스트 동반 | 통과 | 신규 모듈마다 colocated 테스트. 현행 결함 3건(B1~B3) 수정에는 회귀 테스트를 붙인다 |
| V. i18n 동기화 | 통과 | 정렬 전환 확인 대화 문자열을 `en.json`·`ko.json`에 동시 추가 |
| VI. Upstream·라이선스 충실성 | 통과 | 신규 파일에 라이선스 헤더를 넣는다. 신규 파일은 전부 `webapp/src/components/table/`·`hooks/` 아래로, 디렉터리 이동·리네임 없음 |
| VII. DB 마이그레이션 규율 | 해당 없음 | 스키마 변경 없음 |
| VIII. 집중 브랜치·Conventional Commits | 통과 | `004-table-drag-reorder` 브랜치. 무관한 리팩터를 섞지 않는다 |

**원칙 II에 대한 부연.** 헌법은 "새 시각 언어 도입은 사용자가 명시적으로 새 디자인이나 수정을 요청했을 때만" 허용한다. 이번 요청이 정확히 그것이다 — "드랍할 위치가 선으로 표시되어 직관성을 제공함", "드래그 아이콘을 개선하고 싶음". 다만 신규 SCSS **파일**은 만들지 않고 기존 `table.scss`·`tableRow.scss`에 블록을 추가한다. 색상·간격은 CSS 변수를 쓴다.

### Phase 1 이후 재확인

Phase 1 산출물(data-model.md, contracts/, quickstart.md)을 쓴 뒤 재검토했다. 판정 변화 없음.

- 신규 컴포넌트 5개는 전부 표 보기 전용이며 `webapp/src/widgets/`의 재사용 위젯을 대체하지 않는다. 인디케이터와 같은 역할(드롭 위치 표시)을 하는 기존 위젯은 저장소에 없다 — 칸반의 `.dragover`는 행 배경 하이라이트라 대체재가 아니다.
- 드래그 핸들은 기존 `IconButton` + `CompassIcon icon='drag-vertical'`을 **그대로 재사용**하고 스타일만 바꾼다. 새 아이콘·새 위젯을 만들지 않는다.
- 확인 대화는 기존 `ConfirmationDialogBox`를 쓴다 (표에서 이미 쓰는 컴포넌트).

## Project Structure

### Documentation (this feature)

```text
specs/004-table-drag-reorder/
├── design.md            # brainstorming 산출물 — 결정 6건과 기각 대안
├── spec.md              # 명세 (US 5, FR 31, SC 7)
├── plan.md              # 이 파일
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   └── drop-target.md   # Phase 1 — 판정 모듈 계약
├── checklists/
│   └── requirements.md
└── tasks.md             # /speckit-tasks 산출물 (여기서 만들지 않음)
```

### Source Code (repository root)

```text
webapp/src/
├── components/table/
│   ├── tableDropTarget.ts           # 신규 — 순수 판정 모듈
│   ├── tableDropTarget.test.ts      # 신규
│   ├── tableDragContext.tsx         # 신규 — 표 단위 상태
│   ├── tableDragContext.test.tsx    # 신규
│   ├── tableDropIndicator.tsx       # 신규 — 선 1개
│   ├── tableDropIndicator.test.tsx  # 신규
│   ├── applyTableDrop.ts            # 신규 — DropIntent → mutator
│   ├── applyTableDrop.test.ts       # 신규
│   ├── subtree.ts                   # 신규 — 서브트리 수집 (id 목록·높이)
│   ├── subtree.test.ts              # 신규
│   ├── table.tsx                    # 수정 — B1·B2, Provider 감싸기
│   ├── table.scss                   # 수정 — 인디케이터 블록
│   ├── tableRow.tsx                 # 수정 — 핸들에 드래그 ref
│   ├── tableRow.scss                # 수정 — 핸들 가시성, 서브트리 반투명
│   └── tableRow.test.tsx            # 수정 — 배선 검증
├── hooks/
│   ├── useTableRowDrag.ts           # 신규 — 행 하나의 배선
│   └── useTableRowDrag.test.ts      # 신규
├── store/
│   ├── cards.ts                     # 수정 — B3 (하위 카드 cardOrder 정렬)
│   └── cards.test.ts                # 수정 — 회귀 테스트
└── styles/
    └── _z-index.scss                # 수정 — table-drop-indicator 슬롯

webapp/i18n/
├── en.json                          # 수정 — 정렬 전환 확인 문자열
└── ko.json                          # 수정
```

**Structure Decision**: 기존 `webapp/src/components/table/` 안에 모듈을 추가한다. 표 전용 코드가 이미 그곳에 모여 있고(`tableRow`, `tableGroup`, `tableSubCardRows` 등 13개 파일), 새 디렉터리를 파면 upstream 머지 충돌 면적만 넓어진다(원칙 VI).

행 단위 배선 훅만 `hooks/`에 둔다. 기존 `hooks/sortable.tsx`가 같은 역할을 하는 이웃이라 그 옆이 자연스럽다. **`sortable.tsx`는 손대지 않는다** — 칸반이 쓰고 있다.

## Complexity Tracking

> 원칙 II(기존 패턴 우선)에서 벗어나는 항목을 기재한다.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| 신규 시각 요소: 드롭 인디케이터 선 | 사용자가 명시적으로 요청("드랍할 위치가 선으로 표시"). 기존 피드백은 행 배경색뿐이라 앞/뒤·깊이를 구분하지 못한다 | 기존 `.dragover` 배경 유지 — 삽입 위치를 표현할 수 없다. 배경색만으로는 "이 행 앞"과 "이 행 뒤"가 같아 보이고, 계층 깊이는 아예 표현 불가 |
| 신규 컴포넌트 5개 | 판정(순수)·상태(컨텍스트)·표시(컴포넌트)·적용(액션)을 분리해야 규칙을 표 없이 테스트할 수 있다 | `tableRow.tsx`에 몰아넣기 — 깊이 판정이 이웃 행에 의존해 행 로컬로는 성립하지 않는다. `table.tsx`에 몰아넣기 — 이미 15KB이고 드롭 경로가 3갈래로 늘어난다 |
| 표 단위 React Context 신설 | 인디케이터는 표에 하나뿐이고, 깊이 클램프가 이웃 행 메트릭을 요구한다 | props 드릴링 — `Table → TableGroup → TableRows → TableRowExpandable → TableRow` 5단을 관통해야 한다. Redux 슬라이스 — 드래그 중에만 사는 휘발성 UI 상태라 전역 스토어에 둘 이유가 없다 |
| `hooks/sortable.tsx`를 고치지 않고 표 전용 훅 신설 | 칸반이 같은 훅을 쓴다. 공용 훅에 핸들 분리·hover 좌표 보고를 넣으면 칸반이 회귀 위험에 노출된다(FR-030) | 공용 훅 확장 — 표만 필요한 동작을 칸반에 강요하고, 회귀가 나면 이번 변경의 성패가 칸반 검증에 묶인다 |

**기재하지 않은 것**: 신규 SCSS 파일은 만들지 않는다(기존 `table.scss`·`tableRow.scss`에 추가). 신규 아이콘·위젯도 만들지 않는다(기존 `IconButton` + `CompassIcon` 재사용).
