# Implementation Plan: 속성 편집을 관리자에게만 열지 보드가 정한다

**Branch**: `010-admin-only-card-properties` | **Date**: 2026-08-18 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/010-admin-only-card-properties/spec.md`

## Summary

보드가 "속성 편집은 관리자만" 하나를 기억한다. 켜져 있으면 카드 속성의 이름·유형·필수·
옵션을 바꾸는 일이 보드 관리자 등급으로 올라가고, 꺼져 있으면 지금까지의 동작이 그대로
유지된다. 기본은 꺼짐이라 기존 보드는 하나도 달라지지 않는다.

서버가 두 패치 경로에서 강제하고, 화면 다섯 표면이 같은 답을 해서 거절당할 조작을 내밀지
않는다. 카드에 값을 채우는 일은 잠금과 무관하다.

## Technical Context

**Language/Version**: Go 1.24.6 (server), TypeScript 5.7 + React 19 (webapp)

**Primary Dependencies**: Gorilla Mux, Squirrel, Redux Toolkit — 신규 의존성 없음

**Storage**: 기존 `board.properties` JSON 자리. **DB 마이그레이션 없음** (R8)

**Testing**: Go colocated `_test.go`, Jest + React Testing Library colocated `*.test.tsx`

**Target Platform**: Mattermost 플러그인 (min_server_version 10.7.0)

**Project Type**: 단일 저장소 플러그인 — `server/`(plugin → api → app → store) + `webapp/`

**Performance Goals**: 해당 없음. 관문이 보드를 한 번 더 읽을 뿐이고, 한쪽 경로는 이미
읽고 있다 (R3)

**Constraints**: 잠그지 않은 보드의 동작을 한 톨도 바꾸지 않는다 (US2). 판정은 서버가
진실이고 화면은 따라간다 (FR-010)

**Scale/Scope**: 서버 파일 3개 안팎, 화면 표면 5곳 + 토글 섹션 1개, i18n 키 2개

## Constitution Check

| 원칙 | 이 계획에서 | 판정 |
|---|---|---|
| I. 패키지별 품질 게이트 | server·webapp 둘 다 닿는다. `make server-lint`·`make server-test`·webapp 3단계를 실패 목록 diff로 대조한다. 화면 동작이 바뀌므로 [quickstart.md](./quickstart.md)를 배포 뒤 훑는다 | 통과 |
| II. 레이어 경계·기존 패턴 | 판정은 `server/api/`에 두고 같은 파일의 두 선례를 따른다 (R2). 토글 UI는 `okrBoardSection` 패턴을 그대로 차용하고 새 SCSS 파일·새 위젯을 만들지 않는다 (R4). 옵션 편집 감추기는 `ValueSelector`의 기존 선택적 prop을 쓴다 (R5) | 통과 |
| III. 타입·오류 처리 | `as any`·`@ts-ignore` 없음. 거절은 도메인 오류 생성자로 만든다 | 통과 |
| IV. 동작 변경 시 테스트 동반 | 동작 변경이므로 테스트를 동반한다. 계약 케이스 C-01~C-10과 화면 기대 U-01~U-09가 테스트 목록이다. TDD로 실패를 먼저 본다 | 통과 |
| V. i18n 동기화 | 토글 문자열 2개를 en/ko 같은 변경에서 추가한다 | 통과 |
| VI. Upstream·라이선스 | 라이선스 헤더 유지, 플러그인 ID 불변, 구조 변경 없음 | 통과 |
| VII. DB 마이그레이션 | 마이그레이션 없음 (R8) | 해당 없음 |
| VIII. 집중 브랜치 + PR | `010-admin-only-card-properties` 브랜치, Conventional Commits | 통과 |
| IX. Spec 주도 워크플로 | 이 문서가 그 경로다. 구현은 `/speckit-implement`에서 TDD·verification 스킬을 명시 호출한다 | 통과 |

**위반 없음.** Complexity Tracking 항목 없음.

## Project Structure

### Documentation (this feature)

```
specs/010-admin-only-card-properties/
├── spec.md
├── plan.md              # 이 문서
├── research.md          # Phase 0 — 코드로 확인한 사실 R1~R8
├── data-model.md        # Phase 1 — 잠금 설정의 모양과 읽기 규칙
├── contracts/
│   ├── board-patch-gate.md   # 서버 관문 계약 C-01~C-10
│   └── ui-surfaces.md        # 화면 표면 계약 U-01~U-09
├── quickstart.md        # 배포 뒤 실계정 검증 절차
└── checklists/
    └── requirements.md
```

### Source Code (repository root)

```
server/
├── model/
│   └── (신규) 잠금 설정 키와 읽기 함수 + 테스트
└── api/
    ├── boards.go             # P1 관문 + 토글 관문 + 공유 헬퍼
    └── boards_and_blocks.go  # P2 관문

webapp/src/
├── blocks/board.ts                          # 잠금 설정 읽기 (타입·헬퍼)
├── hooks/permissions.tsx                    # 잠금을 반영한 판정 훅
├── components/shareBoard/
│   └── (신규) 잠금 토글 섹션 + shareBoard.tsx 배치
├── components/table/tableHeaderMenu.tsx     # U-01
├── components/cardDetail/cardDetailProperties.tsx  # U-02·U-03
├── properties/select/select.tsx             # U-04
├── properties/multiselect/multiselect.tsx   # U-05
├── components/kanban/kanban.tsx             # U-06
├── components/kanban/kanbanColumnHeader.tsx # U-07
└── i18n/en.json, i18n/ko.json               # 원칙 V
```

**Structure Decision**: 기존 플러그인 구조를 그대로 쓴다. 새 디렉터리·새 패키지 없음.
서버는 `model`에 설정 읽기를, `api`에 판정을 둔다 — 레이어 경계(원칙 II)와 R2의 결론이
같은 자리를 가리킨다.

## 구현 순서

US2(회귀 방지)를 먼저 세우고 US1을 얹는다. 잠금이 꺼진 길이 안전한지 확인하기 전에 잠그는
길을 만들면, 회귀가 나도 그게 새 기능 탓인지 알 수 없다.

1. **설정 읽기** — 키와 읽기 함수, 그리고 boolean이 아닌 값이 꺼짐으로 읽히는지 (FR-001~003)
2. **서버 관문 P1** — C-01·C-02·C-07·C-10(꺼짐일 때 통과)을 먼저, 그다음 C-03~C-06
3. **서버 관문 P2** — 같은 케이스를 묶음 경로에서. 여기가 속성 삭제·유형 변경의 길이다
4. **토글 관문** — C-08·C-09
5. **화면 판정 훅** — 잠금 여부에 따라 기존 답과 관리자 답을 가른다
6. **토글 섹션 + i18n** — U-09, 원칙 V
7. **화면 표면 다섯** — U-01~U-07. 값 고르기(U-08)가 살아있는지 매 표면에서 확인
8. **배포 후 실계정 검증** — [quickstart.md](./quickstart.md)

## 위험과 대비

| 위험 | 왜 위험한가 | 대비 |
|---|---|---|
| P2 경로 누락 | 속성 삭제·유형 변경이 그대로 통과한다. 겉보기에 기능이 동작해 보인다 | 계약 케이스를 P1·P2 양쪽에서 각각 확인 (R1) |
| 잠그지 않은 보드 회귀 | 기존 모든 보드가 영향받는다 | US2를 1순위로 세우고, C-01·C-02·C-07·C-10을 먼저 통과시킨다 |
| 값 고르기까지 막힘 | 잠금이 카드 작성을 마비시킨다 | `readOnly`를 쓰지 않고 옵션 편집 콜백만 조건부로 넘긴다 (R5). U-08을 표면마다 확인 |
| 설정을 못 읽는 순간 감춤 | 응답 도착 전 모든 보드에서 편집이 사라진다 | 모를 때는 잠기지 않은 것으로 본다 (ui-surfaces 계약) |
| 표 헤더 메뉴에 게이트가 없음 | 잠금과 무관하게 새로 감싸야 하는데 빠뜨리기 쉽다 | R6 표에 현재 게이트 유무를 적어뒀다 |
