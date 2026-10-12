# Research: 보드 사이드바 채널 통일 + 숨기기/보이기

**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

Technical Context의 미지수를 코드 확인으로 해소했다. 채널 쪽 조사는 메인 서버 저장소(`/home/sdh/okrbest/okrbest`, okrbest 포크)에서 했다.

## R1. 활성·hover 색을 어떤 변수로 쓰나

- **Decision**: 활성 배경은 `rgb(var(--sidebar-text-active-border-rgb))`(보드 theme.ts가 이미 매핑), 활성 글자는 `var(--sidebar-text-active-color, rgb(var(--sidebar-bg-rgb)))`, hover 배경은 `var(--sidebar-text-hover-bg, rgba(var(--sidebar-text-rgb), 0.08))`. theme.ts의 Jest 가드 블록(`NODE_ENV === 'test'`)에 두 신규 변수의 기본값을 추가한다.
- **Rationale**: 플러그인 모드에서는 MM webapp이 플러그인보다 먼저 렌더되어 MM 전역 CSS 변수가 보장된다(theme.ts:130-134 주석이 이 전제를 이미 문서화). 채널 사이드바가 쓰는 `--sidebar-text-active-color`·`--sidebar-text-hover-bg`를 그대로 참조하면 테마가 바뀌어도 두 영역이 같이 움직인다. 폴백은 standalone·Jest 안전망이다.
- **Alternatives considered**: ① 보드 theme.ts에서 두 변수를 직접 계산·주입 — MM이 이미 설정한 값을 덮어쓸 위험, 이중 관리. ② 색 하드코딩 — constitution II 위반. 기각.

## R2. 표시 상태를 어디에 저장하나

- **Decision**: 기존 `webapp/src/userSettings.ts`의 `UserSettings`에 `getSidebarHidden(userId: string): boolean` / `setSidebarHidden(userId: string, hidden: boolean)`을 추가한다. 키는 `sidebarHidden_<userId>`.
- **Rationale**: 채널 포크 토글이 localStorage 키 `channel_sidebar_collapsed_${userId}`로 사용자별 보존한다(메인 서버 `components/sidebar/channel_sidebar_toggle/`, `reducers/views/lhs.ts`). 같은 보존 수준(기기·브라우저별, 서버 비동기화)을 spec Assumptions로 합의했다. 보드에는 localStorage 접근을 감싼 `UserSettings`가 이미 있으므로 그 패턴을 따른다.
- **Alternatives considered**: ① 서버 user preference 저장 — 모든 기기 동기화가 요구사항이 아니고 채널 토글과 보존 수준이 달라진다. 서버 변경도 생긴다. ② redux 슬라이스 추가 — 상태 소비자가 sidebar.tsx 하나뿐이라 과설계. 기각.

## R3. 토글 아이콘은 무엇을 쓰나

- **Decision**: 기존 위젯 `CompassIcon`(`webapp/src/widgets/icons/compassIcon.tsx`)으로 `dock-left` 글리프를 쓴다. compass-icons CSS는 `plugin_entry.ts`·`main.tsx`가 이미 로드한다.
- **Rationale**: 채널 토글이 `icon-dock-left`를 쓴다(메인 서버 `channel_sidebar_toggle.tsx`). 같은 글리프를 쓰면 두 토글이 한눈에 같은 기능으로 읽힌다. 신규 에셋이 필요 없다.
- **Alternatives considered**: 기존 `HideSidebarIcon`/`ShowSidebarIcon` SVG 유지 — 채널 토글과 시각 언어가 갈라진다. 커스텀 SVG 추가 — 불필요한 신규 에셋. 기각.

## R4. 가변 폭을 어떻게 적용하나

- **Decision**: `.Sidebar`의 `flex: 0 0 240px; max-width: 240px`를 `flex: 0 0 clamp(180px, 19vw, 440px); max-width: 440px`로 바꾼다. 채널과 같은 식(`clamp(180px, 19vw, 440px)`, 메인 서버 `_sidebar-left.scss`)이다.
- **Rationale**: FR-009. 채널과 같은 규칙이어야 두 사이드바가 창 폭 변화에 같은 비율로 반응한다.
- **주의**: [sidebarCategory.scss:179-186](../../webapp/src/components/sidebar/sidebarCategory.scss#L179)의 `position: fixed` 메뉴 오프셋이 `240px`를 하드코딩한다 (`left: calc(64px + 240px - 50px)`). 폭이 가변이 되면 메뉴가 어긋나므로 같은 변경에서 사이드바 실폭 기준(예: 컨테이너 상대 배치 또는 CSS 변수 참조)으로 고친다. 계약 U-테스트와 quickstart 수동 점검 항목에 넣는다.
- **Alternatives considered**: 240px 고정 유지 — FR-009 미충족. 드래그 리사이즈(채널의 ResizableLhs 이식) — spec 범위 밖, YAGNI. 기각.

## R5. 토글을 어디에 노출하나

- **Decision**: 플러그인 모드에서 이미 렌더되는 `.WorkspaceTitle` 안 숨기기 버튼을 살린다 — [sidebar.scss:164-168](../../webapp/src/components/sidebar/sidebar.scss#L164)의 `min-width: 768px`에서 `display: none` 하는 미디어 쿼리를 제거하고, 아이콘을 dock 계열로 바꾼다. 숨김 상태는 기존 50px 스트립(`.Sidebar.hidden`)을 재사용한다.
- **Rationale**: constitution II — 같은 역할의 기존 컨트롤이 있으면 그것을 쓴다. 토글 로직(`isHidden`/`userHidden`)·스트립·복귀 버튼이 전부 이미 있고, 데스크톱 노출만 CSS가 막고 있다.
- **Alternatives considered**: 채널처럼 peek 오버레이 이식 — 보드 영역에 호버할 레일이 없다(spec Assumptions에서 제외 합의). 헤더에 새 버튼 신설 — 기존 버튼과 중복. 기각.

## R6. 자동 숨김(<768px)과 저장 상태의 우선순위

- **Decision**: 초기값은 `UserSettings.getSidebarHidden(me.id)`로 복원하고, **사용자가 버튼을 눌렀을 때만** 저장한다. 창 폭에 따른 자동 숨김/해제는 기존 로직(`hideSidebar()` — `userHidden`이 아닐 때만 동작)을 유지하고 저장하지 않는다.
- **Rationale**: FR-004 — 자동 동작이 사용자의 선택을 덮어쓰면, 좁은 창을 한 번 열었다는 이유로 숨김이 풀리거나 고정된다. 저장은 명시적 의사표시에만 반응해야 한다.
- **Alternatives considered**: 자동 숨김도 저장 — 모바일 폭에서 접힌 상태가 데스크톱 복귀 후에도 남는 오동작. 기각.
