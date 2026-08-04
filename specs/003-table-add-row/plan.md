# Implementation Plan: 표 보기 카드 추가 진입점

**Branch**: `003-table-add-row` | **Date**: 2026-08-04 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/003-table-add-row/spec.md`

## Summary

표 보기에 카드 추가 진입점 세 개를 더한다 — 그룹마다 목록 끝의 추가 줄, 하위 카드 목록 끝의 추가 줄, 하위 카드가 없는 카드를 위한 메뉴 항목.

기술 접근은 **추가 행 컴포넌트 하나 + 기존 생성 경로 재사용**이다. 카드 생성(`addCard`)과 하위 카드 생성(`mutator.createSubCard`)은 이미 있고 잘 돈다. 이 기능이 만드는 것은 그것을 부르는 자리뿐이다. 새 컴포넌트는 `TableAddRow` 하나이고, 나머지는 기존 컴포넌트에 배치와 배선을 더한다.

서버 변경이 없다. API도, 저장 형식도, 마이그레이션도 건드리지 않는다.

## Technical Context

**Language/Version**: TypeScript 5.7 + React 19 (webapp 전용)

**Primary Dependencies**: Redux Toolkit 2.11 (`store/cards.ts`), 기존 위젯(`widgets/menu`, `widgets/buttons`)

**Storage**: 없음. 카드·하위 카드는 기존 저장 경로를 그대로 쓴다

**Testing**: Jest + React Testing Library, 대상 옆 colocated `*.test.tsx`

**Target Platform**: Mattermost 플러그인(플러그인 ID `focalboard`)의 보드 표 보기

**Project Type**: 단일 저장소 플러그인 — 이번 변경은 `webapp/`에만 닿는다

**Performance Goals**: 별도 목표 없음. 추가 줄은 그룹당 1개·펼친 카드당 1개라 렌더 비용이 카드 수에 비례하지 않는다

**Constraints**: 새 시각 언어를 만들지 않는다 — 기존 표 푸터와 같아 보여야 한다 (constitution II). 신규 SCSS 파일을 만들지 않는다

**Scale/Scope**: 신규 파일 4개(컴포넌트 1 + 테스트 3), 기존 파일 수정 12개(소스 7 · 테스트 3 · SCSS 1 · i18n 2). 서버 0

## Constitution Check

*GATE: Phase 0 이전 통과 필수. Phase 1 이후 재확인.*

| 원칙 | 게이트 | 판정 |
|---|---|---|
| I. 패키지별 품질 게이트 | `webapp/`만 변경 → `make webapp-ci` 실행하고 출력을 근거로 제시. `server-lint`·`server-test`는 해당 없음 | ✅ 계획에 반영 |
| II. 레이어 경계·기존 패턴 | 서버 레이어를 건드리지 않는다. 상태는 기존 `store/cards.ts` 슬라이스, 컴포넌트는 함수형+훅. **추가 줄은 기존 `.octo-table-footer`/`.octo-table-cell`을 차용하고 신규 SCSS 파일을 만들지 않는다** | ✅ |
| III. 타입·오류 엄격성 | `as any`·`@ts-ignore` 금지. 생성 실패를 빈 `catch`로 삼키지 않고 `sendFlashMessage`로 알린다 | ✅ |
| IV. 동작 변경 시 테스트 동반 | 신규 컴포넌트 테스트 + 배치 지점별 테스트 + 배선 테스트. 표 스냅샷은 변경 의도를 확인한 뒤 갱신 | ✅ |
| V. i18n 동기화 | 신규 문자열 3개를 `en.json`·`ko.json`에 같은 변경으로 추가 | ✅ |
| VI. Upstream 충실성 | 라이선스 헤더 유지. 신규 파일은 기존 `components/table/` 안에 둔다. 디렉터리 이동·리네임 없음 | ✅ |
| VII. DB 마이그레이션 규율 | 마이그레이션 없음 | ✅ 해당 없음 |
| VIII. 집중 브랜치 + Conventional Commits | 브랜치 `003-table-add-row`(`develop` 기반). 무관한 리팩터를 섞지 않는다 — 그룹 없는 보기의 기존 푸터를 통합하지 않는 이유가 이것이다 | ✅ |
| IX. Spec 주도 워크플로 | `specs/003-table-add-row/`에 brainstorming 설계 → 명세 → 이 계획 순으로 커밋 | ✅ |

**위반 없음.** Complexity Tracking 섹션 불필요.

### Phase 1 이후 재확인

설계 산출물(research.md · data-model.md · contracts/ · quickstart.md)을 만든 뒤 다시 점검했다.

| 원칙 | 재확인 결과 |
|---|---|
| I | quickstart.md의 완료 판정에 `make webapp-ci` 실행과 baseline 대비 신규 실패 0건 요건을 넣었다 |
| II | contracts의 `TableAddRow`가 기존 클래스만 쓰고 새 클래스를 정의하지 않는다. 상태 접근은 기존 `useSubCardInfo` 훅을 통한다 |
| III | contracts에 실패 경로(`sendFlashMessage`)와 중복 클릭 차단을 계약으로 명시했다 |
| IV | quickstart.md에 수동 검증 시나리오 6개, 계획된 테스트 파일 6개를 적었다 |
| V | 신규 문자열 3개가 data-model.md §3에 확정돼 있다 |
| VI | 신규 파일이 `webapp/src/components/table/` 안이다. 새 최상위 디렉터리·신규 SCSS 파일 없음 |
| VII | 설계 확정 후에도 마이그레이션이 없다 |
| VIII | 브랜치 단일. 기존 푸터 통합을 미룬 판단을 research.md R2에 근거와 함께 남겼다 |
| IX | 산출물이 모두 `specs/003-table-add-row/`에 있다 |

**설계 후에도 위반 없음.**

## Project Structure

### Documentation (this feature)

```text
specs/003-table-add-row/
├── design.md            # brainstorming 산출물 (이 계획의 입력)
├── spec.md              # /speckit-specify 산출물
├── plan.md              # 이 파일
├── research.md          # Phase 0 산출물
├── data-model.md        # Phase 1 산출물
├── quickstart.md        # Phase 1 산출물
├── contracts/           # Phase 1 산출물
│   └── component-contracts.md
├── checklists/
│   └── requirements.md  # /speckit-specify 산출물
└── tasks.md             # /speckit-tasks 산출물 (이 명령이 만들지 않음)
```

### Source Code (repository root)

```text
webapp/src/
├── components/
│   ├── centerPanel.tsx                # 수정 — addSubCard 콜백 신설
│   ├── centerPanel.test.tsx           # 수정 — addSubCard 케이스 추가
│   └── table/
│       ├── tableAddRow.tsx            # 신규 — 추가 줄 컴포넌트
│       ├── tableAddRow.test.tsx       # 신규
│       ├── table.tsx                  # 수정 — addSubCard 전달
│       ├── tableGroup.tsx             # 수정 — 그룹 끝에 추가 줄 배치
│       ├── tableGroup.test.tsx        # 신규
│       ├── tableRows.tsx              # 수정 — addSubCard·포커스 전달
│       ├── tableRowExpandable.tsx     # 수정 — 하위 포커스 전달, 0→1 자동 펼침
│       ├── tableSubCardRows.tsx       # 수정 — 하위 목록 끝에 추가 줄 배치
│       ├── tableSubCardRows.test.tsx  # 신규
│       ├── tableRow.tsx               # 수정 — ⋯ 메뉴에 항목 주입
│       ├── tableRow.test.tsx          # 수정 — 메뉴 항목·자동 펼침 케이스 추가
│       ├── table.test.tsx             # 수정 — 기존 푸터·그룹 머리글 회귀 확인
│       └── table.scss                 # 수정 — 들여쓰기 규칙만 추가
└── cardActionsMenu/
    └── cardActionsMenu.test.tsx       # 수정 — 다른 보기에 항목이 새지 않음을 확인

webapp/i18n/{en,ko}.json               # 수정 — 신규 문자열 3개
```

`CardActionsMenu`(`components/cardActionsMenu/cardActionsMenu.tsx`) **본체는 수정하지 않는다.** 이미 `children`을 받으므로 표 행에서 항목을 주입한다. 테스트만 손대는 이유는 "다른 보기의 메뉴가 그대로다"라는 사실 자체를 고정하기 위해서다.

**Structure Decision**: 기존 `components/table/` 디렉터리 안에서 해결한다. 신규 컴포넌트 하나를 더하고 나머지는 배치·배선 수정이다. 상태 관리는 기존 `store/cards.ts` 슬라이스와 `useSubCardInfo` 훅을 그대로 쓰며 새 슬라이스를 만들지 않는다.

## Complexity Tracking

Constitution Check에 위반이 없으므로 작성하지 않는다.
