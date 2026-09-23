# Implementation Plan: 숨긴 보드를 사이드바에서 되찾는다

**Branch**: `016-restore-hidden-boards` | **Date**: 2026-09-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/016-restore-hidden-boards/spec.md`

## Summary

카테고리마다 보드 목록 아래에 "숨긴 보드 N개" 접힘 행을 두고, 펼치면 숨긴 보드를 흐리게
나열해 "다시 표시"·"모두 표시"로 되찾게 한다. 보드를 숨긴 직후에는 "실행 취소"가 달린
알림을 띄운다. 보드를 전부 숨긴 카테고리는 "보드가 존재하지 않음" 대신 이 행만 보여준다.

서버는 건드리지 않는다. 숨김 해제 경로와 실시간 전파가 이미 있다 (R1). 화면은 사이드바가
이미 쓰는 흐린 항목·눈 꺼짐 아이콘·hover 노출 패턴을 그대로 쓴다 (R5). 알림 컴포넌트에
동작 버튼과 개별 표시 시간을 더하는 것이 유일한 공용 변경이다 (R3).

## Technical Context

**Language/Version**: TypeScript 5.7 + React 19 (webapp만). Go 변경 없음

**Primary Dependencies**: Redux Toolkit, react-intl, @hello-pangea/dnd — 신규 의존성 없음

**Storage**: 기존 카테고리-보드 숨김 플래그. **서버·DB 변경 없음** (R1·R2)

**Testing**: Jest + React Testing Library, 대상 옆 colocated `*.test.tsx`/`*.test.ts`

**Target Platform**: Mattermost 플러그인 (min_server_version 10.7.0)

**Project Type**: 단일 저장소 플러그인 — 이번 범위는 `webapp/`뿐

**Performance Goals**: 해당 없음. 이미 메모리에 있는 카테고리 정보를 한 번 더 거르는 정도다

**Constraints**: 보이는 보드의 끌어 놓기 결과를 바꾸지 않는다 (FR-012, SC-005). 다른 알림의
표시 시간을 바꾸지 않는다 (R3). 새 SCSS 파일·새 시각 요소를 만들지 않는다 (원칙 II)

**Scale/Scope**: 신규 컴포넌트 1개, 수정 파일 9개(테스트 제외), i18n 키 6개

## Constitution Check

| 원칙 | 이 계획에서 | 판정 |
|---|---|---|
| I. 패키지별 품질 게이트 | webapp만 닿는다. `npm run check`·`npm run test`·`npm run check-types`를 따로 돌려 실패 목록을 baseline과 diff한다. 화면 동작이 바뀌므로 배포 뒤 [quickstart.md](./quickstart.md)를 실계정으로 훑는다 | 통과 |
| II. 레이어 경계·기존 패턴 | 행·항목은 `octo-sidebar-item subitem`, 아이콘은 기존 `HideIcon`·`ShowIcon`·chevron, 버튼은 `IconButton`·`Button` 위젯, hover 노출은 보드 항목의 `.MenuWrapper` 패턴을 따른다 (R5). 스타일은 `sidebarCategory.scss`의 기존 블록 아래에 추가하고 새 SCSS 파일을 만들지 않는다. 숨긴 보드 목록 계산은 016 직전 수정이 만든 `categoryBoards.ts`에 같은 꼴로 더한다 (R8) | 통과 |
| III. 타입·오류 처리 | `as any`·`@ts-ignore` 없음. 응답 실패는 알림으로 드러내고 빈 catch를 두지 않는다 (R10) | 통과 |
| IV. 동작 변경 시 테스트 동반 | 계약 U-01~U-10과 F-01~F-05가 테스트 목록이다. 실패 출력을 먼저 남긴다 | 통과 |
| V. i18n 동기화 | 키 6개를 en/ko 같은 변경에서 추가한다 (R7) | 통과 |
| VI. Upstream·라이선스 | 라이선스 헤더 유지, 플러그인 ID 불변, 구조 변경 없음 | 통과 |
| VII. DB 마이그레이션 | 없음 | 해당 없음 |
| VIII. 집중 브랜치 + PR | `016-restore-hidden-boards`, Conventional Commits, rebase 병합 | 통과 |
| IX. Spec 주도 워크플로 | 이 문서가 그 경로다. `/speckit-implement`에서 TDD·verification 스킬을 명시 호출한다 | 통과 |

**위반 없음.** Complexity Tracking 항목 없음.

새 컴포넌트 파일 하나(`hiddenBoardsRow.tsx`)를 만든다. 같은 역할을 하는 기존 위젯이 없고,
`sidebarCategory.tsx`가 이미 450줄이라 그 안에 넣으면 테스트와 읽기가 모두 나빠진다.
스타일은 그 컴포넌트 전용 파일을 만들지 않고 `sidebarCategory.scss`에 둔다.

## Project Structure

### Documentation (this feature)

```
specs/016-restore-hidden-boards/
├── spec.md
├── plan.md              # 이 문서
├── research.md          # Phase 0 — 코드로 확인한 사실 R1~R11
├── data-model.md        # Phase 1 — 숨긴 보드·알림·펼침 상태의 모양
├── contracts/
│   ├── ui-surfaces.md   # 화면 계약 U-01~U-10
│   └── unhide-flow.md   # 숨김 해제 흐름·알림 확장 계약 F-01~F-05
├── quickstart.md        # 배포 뒤 실계정 검증 절차
└── checklists/
    └── requirements.md
```

### Source Code (repository root)

```
webapp/src/
├── components/sidebar/
│   ├── categoryBoards.ts            # getHiddenCategoryBoards 추가 (R8)
│   ├── categoryBoards.test.ts
│   ├── hiddenBoardsRow.tsx          # (신규) 접힘 행 + 항목 + 다시 표시/모두 표시
│   ├── hiddenBoardsRow.test.tsx     # (신규)
│   ├── sidebarCategory.tsx          # 행 배치 (Droppable 바깥), 빈 카테고리 문구 조건 (R4)
│   ├── sidebarCategory.scss         # .HiddenBoardsRow 블록 추가
│   ├── sidebarCategory.test.tsx
│   ├── sidebar.test.tsx             # 기존 `dont show hidden boards` 기대 수정 (U-06)
│   ├── sidebarBoardItem.tsx         # 숨기기 직후 실행 취소 알림 (R9)
│   └── sidebarBoardItem.test.tsx
├── components/
│   ├── flashMessages.tsx            # action·durationMs 확장 (R3)
│   ├── flashMessages.scss           # 동작 버튼 자리
│   └── flashMessages.test.tsx
├── mutator.ts, mutator.test.ts      # unhideBoard (F-01)
└── i18n/en.json, i18n/ko.json       # 원칙 V
```

**Structure Decision**: 기존 플러그인 구조를 그대로 쓴다. 새 디렉터리 없음. 숨김 해제
호출과 스토어 갱신은 두 곳(행, 알림)이 같은 함수를 쓰도록 `mutator.unhideBoard`에 둔다.
`mutator`가 이미 "서버 호출 뒤 스토어 갱신" 패턴의 자리다(`createBoardMember`).

## 구현 순서

공용 세 조각(알림 확장, 숨김 해제 함수, 숨긴 보드 계산)을 먼저 세우고, 명세의 MVP인
접힘 행을 만든 뒤 실행 취소를 얹는다. 두 스토리는 서로 부르지 않고 같은 숨김 해제
함수만 공유하므로, 사람이 둘이면 동시에 진행할 수 있다.

1. **알림 확장** — `FlashMessage`에 `action`·`durationMs` (F-04·F-05). 기존 스냅샷이
   깨지지 않는지 먼저 확인한다
2. **숨김 해제 함수** — `mutator.unhideBoard`: 호출·응답 확인·스토어 갱신 (F-01~F-03)
3. **숨긴 보드 계산** — `getHiddenCategoryBoards` + 테스트 (R8)
4. **접힘 행 컴포넌트** — `hiddenBoardsRow.tsx` (U-01~U-04, U-09)
5. **카테고리 배치** — `sidebarCategory.tsx` Droppable 바깥 (U-01b, U-10)
6. **숨기기 실행 취소** — `sidebarBoardItem.tsx` (U-07·U-08)
7. **빈 카테고리 문구** — `sidebarCategory.tsx` (U-06)
8. **모두 표시** — `hiddenBoardsRow.tsx` (U-05, F-03)
9. **i18n** — en/ko 키 6개 (R7)
10. **배포 후 실계정 검증** — [quickstart.md](./quickstart.md)

## 위험과 대비

| 위험 | 왜 위험한가 | 대비 |
|---|---|---|
| 알림 확장이 기존 스냅샷을 깬다 | `flashMessages.test.tsx`가 스냅샷 기반이다. 마크업이 바뀌면 무관한 실패로 보인다 | 동작이 없을 때는 마크업을 한 글자도 바꾸지 않는다. 버튼은 `action`이 있을 때만 그린다 (F-04) |
| 알림 클릭이 곧 닫힘이다 | 컨테이너 `onClick`이 알림을 닫는다. 버튼 클릭이 위로 번지면 실행 취소가 실행되지 않은 채 닫힐 수 있다 | 버튼에서 전파를 막고, 동작을 실행한 뒤 닫는다 (F-04) |
| 행이 끌어 놓기 계산에 끼어든다 | 행이 Droppable 안에 들어가면 드롭 위치 계산과 자리표시자가 흔들린다 | Droppable 바깥에 둔다. 016 직전 수정의 DnD 회귀 테스트가 그대로 통과해야 한다 (R4, U-10) |
| 카테고리에 서버상 없는 보드를 숨긴다 | 화면에서만 복구된 보드는 서버 카테고리에 없어 숨김 저장이 조용히 빈손으로 끝난다. 이번 범위 밖이지만 검증 중 혼란을 부른다 | quickstart는 카테고리에 실제로 속한 보드로 확인한다 (R11) |
| 연속 실패 시 알림이 겹친다 | "모두 표시"에서 여러 개가 실패하면 알림이 마지막 것만 남는다 | 실패는 모아서 한 번에 알린다 (F-03) |
