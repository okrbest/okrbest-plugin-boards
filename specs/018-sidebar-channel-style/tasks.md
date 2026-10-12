# Tasks: 보드 사이드바를 채널 리스트와 통일하고 숨기기/보이기를 제공한다

**Input**: Design documents from `/specs/018-sidebar-channel-style/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/ui-surfaces.md](contracts/ui-surfaces.md)

**Tests**: constitution IV·IX가 TDD를 강제한다. 동작 과제는 테스트를 먼저 쓰고 실패 출력을 남긴 뒤 구현한다. CSS 수치만 바꾸는 과제는 Jest로 구조(클래스·DOM)를 검증하고 수치는 quickstart 실측으로 확정한다.

**Organization**: 사용자 스토리별로 묶는다. US1(토글)과 US2(시각 통일)는 서로 독립적으로 구현·검증할 수 있다. 단 `sidebar.scss`를 양쪽이 수정하므로 같은 파일 과제(T006·T012)는 병렬로 돌리지 않는다.

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup

**Purpose**: 회귀 판정 기준선 확보

- [X] T001 baseline 측정 — `webapp/`에서 `npm run check`·`npm run test`·`npm run check-types`를 각각 실행해 실패 스위트·오류 목록을 `specs/018-sidebar-channel-style/baseline.md`에 기록한다 (비교는 개수가 아니라 목록 diff)

---

## Phase 2: Foundational

**Purpose**: 모든 스토리를 막는 선행 작업

없음 — 서버·공유 인프라 변경이 없고, 저장 접근자(US1)·테마 가드(US2)는 각 스토리 안에서 처리한다.

**Checkpoint**: T001 완료 후 US1·US2를 어느 순서로든 시작할 수 있다.

---

## Phase 3: User Story 1 - 사이드바를 숨기고 되살린다 (Priority: P1) 🎯 MVP

**Goal**: 데스크톱에서 dock 토글로 사이드바를 숨기고 되살리며, 선택이 사용자별로 보존된다.

**Independent Test**: 숨기기 → 본문 확장 → 보이기 → 새로고침 후 상태 유지, 네 단계로 검증한다 ([contracts U-01~U-08](contracts/ui-surfaces.md)).

### Tests for User Story 1 (먼저 쓰고 실패를 확인한다)

- [X] T002 [P] [US1] `webapp/src/userSettings.test.ts`에 사이드바 상태 접근자 테스트 추가 — 저장(`sidebarHidden_<userId>`=true)·해제 시 키 삭제·`getItem` throw 시 false 반환 (U-05 저장 계층)
- [X] T003 [US1] `webapp/src/components/sidebar/sidebar.test.tsx`에 계약 테스트 U-01~U-07 추가 — 데스크톱 토글 노출, 클릭 시 숨김+저장, 보이기 시 복원+키 삭제, 저장값 true로 마운트 시 숨김, localStorage 불가 시 보임, 자동 숨김이 저장값을 덮어쓰지 않음. 실패 출력을 기록한다

### Implementation for User Story 1

- [X] T004 [US1] `webapp/src/userSettings.ts`에 `getSidebarHidden(userId)`/`setSidebarHidden(userId, hidden)` 구현 — 키 `sidebarHidden_<userId>`, false면 `removeItem`, 접근 실패는 기본값 처리 ([data-model.md](data-model.md))
- [X] T005 [US1] `webapp/src/components/sidebar/sidebar.tsx` 수정 — `userHidden`/`isHidden` 초기값을 `UserSettings.getSidebarHidden(me.id)`로 복원, 토글 핸들러에서만 저장(자동 숨김은 저장 금지 — research R6), 숨기기·보이기 아이콘을 `CompassIcon` `dock-left` 계열로 교체
- [X] T006 [US1] `webapp/src/components/sidebar/sidebar.scss` 수정 — 768px 미디어 쿼리(`.WorkspaceTitle .sidebarSwitcher` display:none) 제거, 토글 버튼·숨김 스트립 스타일 정리 (색은 기존 변수만)
- [X] T007 [P] [US1] `webapp/i18n/en.json`·`webapp/i18n/ko.json`에 토글 라벨 키를 **손으로** 동시 추가 (U-08. i18n-extract 금지, ICU 곧은따옴표는 굽은따옴표로)
- [X] T008 [US1] T002·T003 통과 확인 + 영향 스냅샷을 의도 확인 후 `npm run updatesnapshot`으로 갱신

**Checkpoint**: US1 단독으로 배포·시연 가능 (MVP).

---

## Phase 4: User Story 2 - 보드 목록이 채널 목록과 같은 시각 언어를 쓴다 (Priority: P2)

**Goal**: 활성 반전·hover·헤더·항목 크기·가변 폭을 채널 사이드바와 통일한다.

**Independent Test**: 채널 목록과 나란히 두고 다섯 항목 대조 ([contracts V-01~V-05](contracts/ui-surfaces.md), SC-003).

### Tests for User Story 2 (구조 검증 먼저, 수치는 실측)

- [X] T009 [US2] `webapp/src/theme.ts` Jest 가드 블록에 `--sidebar-text-active-color`·`--sidebar-text-hover-bg` 기본값 추가 + 관련 테마 테스트 갱신 — V-01·V-02의 폴백 전제 (research R1)
- [X] T010 [P] [US2] `webapp/src/components/sidebar/sidebarCategory.test.tsx`에 V-01 구조 테스트 추가 — 활성 항목이 반전 클래스로 렌더되고 좌측 세로선용 구조가 없다. 실패 출력을 기록한다

### Implementation for User Story 2

- [X] T011 [US2] `webapp/src/components/sidebar/sidebarCategory.scss` 수정 — `.active` 반전(배경 `rgb(var(--sidebar-text-active-border-rgb))`, 글자 `var(--sidebar-text-active-color, rgb(var(--sidebar-bg-rgb)))`), `::before` 세로선 제거, hover를 `var(--sidebar-text-hover-bg, rgba(var(--sidebar-text-rgb), 0.08))`로, 카테고리 헤더 자간 0.05em, **고정 메뉴 오프셋의 240px 하드코딩 제거**(research R4 — V-05)
- [X] T012 [P] [US2] `webapp/src/components/sidebar/sidebarBoardItem.scss` 수정 — 항목 15px/18px 라인하이트, hover 변수 통일 (V-02·V-03)
- [X] T013 [US2] `webapp/src/components/sidebar/sidebar.scss` 수정 — `flex: 0 0 240px; max-width: 240px` → `flex: 0 0 clamp(180px, 19vw, 440px); max-width: 440px` (V-04. T006과 같은 파일 — 순차 실행)
- [X] T014 [US2] T009·T010 통과 확인 + 사이드바 계열 스냅샷을 diff 검토 후 갱신 — 의도(반전·자간·크기)와 일치하는 변경만 받아들인다

**Checkpoint**: US1·US2가 각각 독립적으로 동작한다.

---

## Phase 5: Polish & 검증

**Purpose**: 회귀 확인과 완료 근거 확보 (constitution 원칙 I·IV — 게이트만으로는 부족)

- [X] T015 [P] 회귀 계약 U-09~U-12 — 카테고리 접기·DnD·HiddenBoardsRow(016)·standalone 기존 테스트 스위트가 baseline 대비 추가 실패 없이 통과하는지 확인
- [X] T016 품질 게이트 — `npm run check`·`npm run test`·`npm run check-types`를 따로 실행하고, 실패 목록을 T001 baseline과 diff해 제시한다 (개수 비교는 근거가 아니다)
- [X] T017 종단 검증 — `npm run debug:watch` 배포(저장→반영 11초) 후 [quickstart.md](quickstart.md)를 실제 계정으로 훑는다 — 토글 6단계(비관리자 QA 계정 포함), 시각 대조 5항목(어두운 테마 재확인), 회귀 3항목(가변 폭 메뉴 위치 포함). 절별 결과·스크린샷 기록
- [X] T018 SC 검증 — SC-001~SC-004 각각을 실측으로 확인하고, 명세의 수치가 추정이었으면 실측값으로 spec.md를 갱신한다

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (T001)**: 즉시 시작. 이후 모든 판정의 기준선
- **Phase 2**: 과제 없음
- **Phase 3 (US1)**: T001 후 시작. 내부 순서 T002·T003(테스트) → T004 → T005 → T006 → T008. T007은 T005와 병렬 가능
- **Phase 4 (US2)**: T001 후 시작 가능 — US1과 독립. 내부 순서 T009·T010(테스트) → T011·T012 → T013 → T14. 단 T013은 T006과 같은 파일이므로 US1을 먼저 끝내는 순차 진행을 권장
- **Phase 5**: US1·US2 완료 후

### Parallel Opportunities

- T002 ∥ T003 (다른 파일), T007 ∥ T005
- T010 ∥ T009, T012 ∥ T011
- T015는 T016과 병렬 가능

---

## Implementation Strategy

**MVP = US1만.** T001 → T002~T008 → (T016·T017 축소판으로 토글만 실측) 순으로 토글 단독 배포가 가능하다. 이후 US2를 얹고 Phase 5에서 전체 검증한다. 순차 진행(US1 → US2)을 권장한다 — `sidebar.scss`·스냅샷을 양쪽이 건드려 병렬의 이득이 작다.

## Notes

- 테스트 과제는 실패 출력을 남긴 뒤에만 완료 표시 (constitution IV)
- 스냅샷은 변경 의도 확인 후에만 갱신
- 과제 또는 논리 단위마다 커밋 (Conventional Commits, 한국어 본문)

---

## 검증 결과 (2026-10-12)

### 품질 게이트 (T016) — baseline 대비 목록 diff

| 게이트 | baseline | 구현 후 | 판정 |
|---|---|---|---|
| npm run test | 57 스위트 / 145 테스트 실패 | 57 스위트 / 143 테스트 실패 — **스위트 목록 동일**(diff는 시간 표기뿐), 신규 17테스트 전부 통과, baseline 실패 2건이 스냅샷 갱신으로 해소 | ✅ 회귀 없음 |
| npm run check-types | TS 23건 / 10파일 | 동일 (파일 목록 diff 없음) | ✅ |
| npm run check | eslint error 2503줄 | 2505줄 — 증가분은 신규 파일 2개에 전 파일 공통으로 붙는 시스템성 `Resolve error` 1줄씩. 터치 파일의 실질 오류 0, stylelint 0 | ✅ |

### TDD 증거 (T002·T003·T010)

- userSettings: RED 6건(`getSidebarHidden is not a function`) → GREEN 6건
- sidebar U-01~U-06: RED 5건 → GREEN. U-07은 가드 성격이라 **반전 검증**(자동 숨김 경로에 저장을 넣은 틀린 구현에서 실패 확인 후 원복)
- sidebarStyles V-01~V-05: RED 5건 → GREEN

### 종단 검증 (T017) — 배포 후 실측 (qa018 비관리자, seegene 팀, viewport 1280/1680)

| 절 | 결과 |
|---|---|
| 토글 노출 (U-01) | `aria-label="Hide sidebar"` dock 버튼 데스크톱 노출 ✅ |
| 숨기기 → 저장 (U-02) | 클릭 1번에 숨김, `sidebarHidden_<userId>=true` 기록 ✅ |
| 새로고침 유지 (U-04) | 숨김 유지 ✅ |
| 보이기 → 키 삭제 (U-03) | 복원 + 키 삭제 ✅ |
| 활성 반전 (V-01) | bg `#333133` + 글자 `#f8f8f8` (MM 변수), 세로선 없음 ✅ |
| 수치 (V-03) | 행 32px, 글자 15px, 헤더 12px/자간 0.6px(0.05em) ✅ |
| 폭 (V-04) | 1280→243px, 1680→319px (19vw clamp) ✅ |
| 메뉴 위치 (V-05) | 가변 폭에서 사이드바 가장자리에 정착 (240px 공식이면 131px 어긋났을 것) ✅ |
| 어두운 테마 | Onyx에서 반전이 변수 따라 역전 (#f8f8f8 bg / #202228 글자) ✅ |
| 회귀 | 카테고리 접기/펼치기 실측 ✅, DnD·HiddenBoardsRow·standalone은 jest 스위트 통과 ✅ |

스크린샷: `shots/01-sidebar-visible.png` · `02-sidebar-hidden.png` · `03-menu-position-wide.png` · `04-dark-theme.png`

### SC 검증 (T018)

- **SC-001** 클릭 1번 숨김/복원 — 실측 ✅
- **SC-002** 새로고침·재방문 후 숨김 유지 — 실측 ✅ (저장 차단 환경은 U-05/T002 jest로 기본값 "보임" 검증)
- **SC-003** 5항목 대조(활성·hover·헤더·크기·폭) — 활성·헤더·크기·폭 실측 일치, hover는 토큰(`#e3e2e3`) 상속 확인 + SCSS 계약 테스트 ✅
- **SC-004** 기존 기능 동일 — 게이트 스위트 목록 diff 無 + 카테고리 접기 실측 ✅

### 후속 교정 (2026-10-12, 사용자 피드백)

토글 아이콘의 크기·정렬이 채널과 어긋났다 — WorkspaceTitle 행에 떠 있던 버튼을
채널 헤더 문법대로 **보드 찾기 행 안으로 옮겨 + 버튼과 한 쌍**으로 묶었다.

- 채널 ChannelSidebarToggle 실측 문법: 투명 배경 + hover만 배경(rgba(text,0.08)),
  radius 6px(--okr-radius-ms), 아이콘/버튼 비율 0.625, + 버튼과 우측 쌍
- 보드 행 규격(28px)에 적용: 버튼 28×28, 아이콘 18px, 간격 4px. 숨김 스트립
  보이기 버튼도 같은 규격
- 계약 추가: U-01b(행 내 배치), V-06(28px·radius 6px) — RED→GREEN
- 실측: 토글·+ 같은 행(top 69 동일), 28×28/6px/투명/18px/간격 4px,
  스트립 버튼 28×28/6px, 보존 동작 유지. `shots/05-toggle-in-switcher-row.png`
- 게이트 재실행: 실패 스위트 목록 baseline과 동일, 테스트 1325개 중 143 실패(2건 개선 유지)

### 후속 교정 2 (2026-10-12, 사용자 피드백)

활성(반전) 행에서 ⋯ 메뉴 아이콘이 보이지 않았다. 반전은 행 배경·글자만 바꿨고,
그 안의 버튼은 전역 `.Sidebar .IconButton` 색(어두운 글자)을 그대로 받아
반전 배경에 묻혔다.

- `.active` 안의 `.IconButton`이 행 글자색(`color: inherit`)을 상속하고,
  hover 배경은 `rgba(var(--sidebar-bg-rgb), 0.16)` — 반전 배경과 양 테마 모두 대비
- 셰브론·점 아이콘(SVG)은 `fill: currentColor`
- 계약 V-07 추가 (RED→GREEN), stylelint 0
- 실측: 활성 행 hover 시 ⋯ 색 = 행 글자색(#f8f8f8) 상속 확인,
  `shots/06-active-row-menu-visible.png`
