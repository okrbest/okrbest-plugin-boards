# Contract: 화면 표면 U-01~U-12

**Spec**: [spec.md](../spec.md) | **Plan**: [plan.md](../plan.md) | **Research**: [research.md](../research.md)

각 항목은 테스트 하나에 대응한다. "그린다"는 DOM에 있다, "없다"는 DOM에 없다는 뜻이다. V-계열(시각 수치)은 Jest로 클래스·속성을 검증하고 최종 수치는 quickstart 실측으로 확정한다.

## 숨기기/보이기 토글 (`sidebar.tsx`, `sidebar.scss`, `userSettings.ts`)

| ID | Given | Then | 근거 |
|---|---|---|---|
| U-01 | 데스크톱 폭(≥768px), 플러그인 모드, 사이드바 보임 | 숨기기 버튼(접근 가능한 이름 있음, dock 글리프)을 그린다. 미디어 쿼리로 숨기지 않는다 | FR-001 |
| U-02 | U-01에서 숨기기 버튼 클릭 | 사이드바 본체가 사라지고 `.Sidebar.hidden` 스트립과 보이기 버튼을 그린다. `UserSettings`에 `sidebarHidden_<userId>=true`가 저장된다 | FR-001·003 |
| U-03 | 숨김 상태에서 보이기 버튼 클릭 | 사이드바가 다시 그려지고 저장 키가 지워진다 | FR-002·003 |
| U-04 | 저장값 `true`인 사용자로 마운트 | 첫 렌더부터 숨김 상태다 (깜빡임 없이) | FR-003, SC-002 |
| U-05 | 저장값 없음/localStorage 접근 불가(getItem이 throw) | 보임 상태로 그린다. 오류가 전파되지 않는다 | 경계, FR-003 |
| U-06 | 저장값 `true`, 창 폭을 768px 미만→이상으로 변경 | 숨김 유지. 자동 로직이 저장값을 덮어쓰지 않는다 | FR-004 |
| U-07 | 저장값 없음, 창 폭 768px 미만 | 자동 숨김. 이때 저장 키는 생기지 않는다 | FR-004 |
| U-08 | 토글 버튼 | 라벨이 i18n 메시지 ID로 정의되고 en·ko 번역이 존재한다 | FR-005 |

## 시각 통일 (`sidebarCategory.scss`, `sidebarBoardItem.scss`, `sidebar.scss`)

| ID | Given | Then | 근거 |
|---|---|---|---|
| V-01 | 활성 보드 항목 | `.active`에 반전 스타일 — 배경 `rgb(var(--sidebar-text-active-border-rgb))`, 글자 `var(--sidebar-text-active-color, ...)`. 기존 `::before` 좌측 세로선 규칙이 없다 | FR-006 |
| V-02 | 임의 항목 hover | 배경 `var(--sidebar-text-hover-bg, rgba(var(--sidebar-text-rgb), 0.08))` | FR-007 |
| V-03 | 항목·헤더 수치 | 항목 font-size 15px·행 32px, 카테고리 헤더 12px/600/uppercase/자간 0.05em | FR-008 |
| V-04 | `.Sidebar` 폭 | `clamp(180px, 19vw, 440px)` 계열. 240px 고정이 없다 | FR-009 |
| V-05 | 가변 폭 상태에서 보드 항목의 고정 메뉴 열기 | 메뉴가 항목 옆에 붙는다(240px 하드코딩 오프셋 제거) | FR-010, research R4 |

## 기존 기능 무영향 (회귀 계약)

| ID | Given | Then | 근거 |
|---|---|---|---|
| U-09 | 카테고리 헤더 클릭 | 접기/펼치기 기존 동작·서버 저장 유지 | FR-010 |
| U-10 | 보드 드래그 정렬 | 기존 DnD 동작 유지 (016의 복구 보드 로직 포함) | FR-010 |
| U-11 | 숨긴 보드 되찾기 행(016) | `HiddenBoardsRow` 렌더·동작 유지 | FR-010 |
| U-12 | standalone 모드(`!isFocalboardPlugin`) | 기존 헤더·토글 동작이 그대로다 | Assumptions |
