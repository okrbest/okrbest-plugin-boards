# Implementation Plan: 보드 사이드바를 채널 리스트와 통일하고 숨기기/보이기를 제공한다

**Branch**: `018-sidebar-channel-style` | **Date**: 2026-10-12 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/018-sidebar-channel-style/spec.md`

## Summary

보드 사이드바의 시각층을 메인 서버(okrbest 포크) 채널 사이드바와 통일하고 — 활성 항목 완전 반전, hover 배경, 항목 15px, 카테고리 헤더 수치, 가변 폭 clamp — 채널 사이드바 토글과 같은 숨기기/보이기 버튼을 데스크톱에 제공한다. 표시 상태는 기존 `UserSettings`(localStorage)로 사용자별 보존한다. 서버 변경은 없다. webapp만 수정한다.

## Technical Context

**Language/Version**: TypeScript 5.7 + React 19 (webapp만. server 변경 없음)

**Primary Dependencies**: 기존 의존성만 쓴다 — `@mattermost/compass-icons`(이미 `plugin_entry.ts`에서 로드, `dock-left` 아이콘 사용), SCSS + CSS 변수, 기존 위젯 `IconButton`·`CompassIcon`

**Storage**: localStorage — 기존 `webapp/src/userSettings.ts`의 `UserSettings` 경유, 키에 사용자 ID 포함. 서버 저장 없음

**Testing**: Jest + React Testing Library, colocated `*.test.tsx`

**Target Platform**: Mattermost 플러그인 모드(웹·데스크톱 앱). standalone 모드는 동작 유지(시각 변경은 공유되나 토글 노출 조건은 기존 유지)

**Project Type**: Mattermost 플러그인 webapp (React SPA)

**Performance Goals**: 토글은 클릭 즉시 반영(단일 리렌더). 상태 읽기는 마운트 시 1회

**Constraints**:
- MM 전역 CSS 변수(`--sidebar-text-active-color`, `--sidebar-text-hover-bg`)는 플러그인 모드에서 보장된다([theme.ts:130-134](../../webapp/src/theme.ts#L130) 주석 — MM webapp이 플러그인보다 먼저 렌더). standalone·Jest에서는 없으므로 **모든 참조에 폴백을 쓴다**
- 색·크기 하드코딩 금지(constitution II) — 채널과 같은 변수·수치를 쓰되 SCSS에는 변수 참조로
- localStorage 접근 실패(시크릿 모드 등) 시 기본값 "보임"으로 동작

**Scale/Scope**: 컴포넌트 2개 수정(`sidebar.tsx`, `userSettings.ts`), SCSS 3개 수정(`sidebar.scss`, `sidebarCategory.scss`, `sidebarBoardItem.scss`), theme.ts 테스트 가드 추가, i18n 2개(en/ko), 테스트 파일 2~3개

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 원칙 | 판정 | 근거 |
|---|---|---|
| I. 품질 게이트 | 통과 계획 | webapp만 변경 → `npm run check`·`npm run test`·`npm run check-types` 세 단계를 따로 돌려 baseline 목록과 diff. 화면 동작이 바뀌므로 배포 후 [quickstart.md](quickstart.md) 실측을 완료 근거로 제시 |
| II. 레이어·기존 패턴 | 통과 | 사용자가 명시적으로 채널 리스트 기준 디자인 변경을 요청했다(새 시각 언어 도입 요건 충족). 신규 SCSS 파일 없음 — 기존 3개 파일의 해당 블록 수정. 신규 컴포넌트 없음 — 기존 `IconButton`+`CompassIcon` 재사용. 색·크기는 CSS 변수+채널 동일 수치 |
| III. 타입·오류 엄격성 | 통과 계획 | `as any` 불필요. localStorage 접근은 UserSettings 경유(실패 시 기본값) |
| IV. 테스트 동반 | 통과 계획 | TDD — 토글 노출·동작·보존·복원 테스트를 먼저 쓰고 실패를 확인한다. 스냅샷은 의도 확인 후 갱신 |
| V. i18n 동기화 | 통과 계획 | 토글 라벨 신규 키를 en.json·ko.json에 **손으로** 동시 추가(i18n-extract 금지 — 저장소 관례) |
| VI. Upstream 충실성 | 통과 | 라이선스 헤더 유지. upstream 파일 구조 변경 없음 |
| VII. DB 마이그레이션 | 해당 없음 | 서버·DB 변경 없음 |
| VIII. 브랜치·PR | 통과 | `018-sidebar-channel-style` 브랜치에서 작업, rebase merge PR |
| IX. Spec 파이프라인 | 통과 | specify → plan(본 문서) → tasks → implement. implement 시작 시 TDD·verification 스킬 호출 |

위반 없음 → Complexity Tracking 생략.

## Project Structure

### Documentation (this feature)

```text
specs/018-sidebar-channel-style/
├── plan.md              # 본 문서
├── research.md          # Phase 0 — 변수 가용성·저장 패턴·아이콘·폭 조사
├── data-model.md        # Phase 1 — 표시 상태 저장 스키마
├── quickstart.md        # Phase 1 — 배포·실측 검증 절차
├── contracts/
│   └── ui-surfaces.md   # 화면 표면 계약 (테스트 1:1 대응)
└── tasks.md             # /speckit-tasks 산출 (본 명령은 만들지 않음)
```

### Source Code (repository root)

```text
webapp/src/
├── userSettings.ts                      # [수정] 사이드바 숨김 상태 get/set (사용자별 키)
├── theme.ts                             # [수정] Jest 가드 블록에 신규 변수 2개 폴백 추가
├── components/sidebar/
│   ├── sidebar.tsx                      # [수정] 토글 버튼(dock-left)·초기 상태 복원·저장
│   ├── sidebar.test.tsx                 # [수정] 토글 노출·동작·보존 테스트
│   ├── sidebar.scss                     # [수정] 폭 clamp·숨김 상태·토글 버튼·768px 제한 제거
│   ├── sidebarCategory.scss             # [수정] 활성 반전·hover·헤더 자간·메뉴 고정 오프셋
│   ├── sidebarCategory.test.tsx         # [갱신] 스냅샷
│   ├── sidebarBoardItem.scss            # [수정] 항목 15px·hover
│   └── sidebarBoardItem.test.tsx        # [갱신] 스냅샷
└── i18n/ (webapp/i18n/)
    ├── en.json                          # [수정] 토글 라벨 키
    └── ko.json                          # [수정] 토글 라벨 키
```

**Structure Decision**: 단일 저장소 플러그인의 `webapp/`만 수정한다. 서버·DB·API 변경이 없으므로 `server/` 게이트는 돌지 않는다(constitution I — 변경이 닿은 패키지만).

## 설계 결정 요약

[research.md](research.md)의 결정을 구현 관점으로 압축한다.

1. **색 변수**: 활성 반전은 `rgb(var(--sidebar-text-active-border-rgb))` 배경(보드 theme.ts가 이미 매핑) + `var(--sidebar-text-active-color, rgb(var(--sidebar-bg-rgb)))` 글자. hover는 `var(--sidebar-text-hover-bg, rgba(var(--sidebar-text-rgb), 0.08))`. 폴백 덕에 standalone·Jest에서도 깨지지 않는다 (R1).
2. **상태 저장**: `UserSettings`에 `getSidebarHidden(userId)` / `setSidebarHidden(userId, hidden)` 추가, 키 `sidebarHidden_<userId>`. 채널 포크의 `channel_sidebar_collapsed_${userId}` 패턴과 같은 보존 수준 (R2).
3. **아이콘**: `CompassIcon` 위젯으로 `dock-left`를 쓴다(채널 토글과 동일 글리프). 기존 `HideSidebarIcon`·`ShowSidebarIcon` SVG는 이 화면에서 대체하되 파일은 남긴다(다른 사용처 영향 없음 확인 후 정리) (R3).
4. **폭**: `.Sidebar`의 `flex: 0 0 240px; max-width: 240px`를 `flex-basis: clamp(180px, 19vw, 440px)` 계열로 바꾼다. [sidebarCategory.scss:179-186](../../webapp/src/components/sidebar/sidebarCategory.scss#L179)의 고정 메뉴 오프셋이 240px를 하드코딩하므로 같은 변경에서 사이드바 실폭 기준으로 고친다 (R4 — 주의 지점).
5. **토글 동작**: 기존 `isHidden`/`userHidden` state를 유지하되 초기값을 UserSettings에서 읽고, 사용자가 토글할 때만 저장한다. 자동 숨김(<768px)은 저장하지 않는다 → FR-004 충족. 숨김 상태 UI는 기존 50px 스트립을 재사용하고 아이콘만 dock 계열로 바꾼다.
6. **토글 노출**: 플러그인 모드의 `.WorkspaceTitle` 안 숨기기 버튼을 데스크톱에서도 보이게 한다([sidebar.scss:164-168](../../webapp/src/components/sidebar/sidebar.scss#L164)의 미디어 쿼리 제거) — 신규 UI 표면을 만들지 않고 기존 버튼을 살린다.

## 위험·주의

- **메뉴 고정 오프셋**(R4): 폭이 가변이 되면 `position: fixed` 메뉴가 어긋난다. 계약 U-테스트와 quickstart 수동 점검에 포함한다.
- **스냅샷 다량 갱신**: 클래스·스타일 변경으로 sidebar 계열 스냅샷이 깨진다. 의도 확인 후 일괄 갱신하고, baseline 실패 목록과 섞이지 않게 스위트 목록 diff로 판정한다.
- **webapp 테스트 baseline**: 깨끗한 상태에서도 57스위트 실패(constitution I). 회귀 판정은 목록 diff.

## Phase 0 · 1 산출물

- [research.md](research.md) — R1~R6 결정 기록
- [data-model.md](data-model.md) — 표시 상태 키 스키마·전이
- [contracts/ui-surfaces.md](contracts/ui-surfaces.md) — 화면 표면 계약(테스트 1:1)
- [quickstart.md](quickstart.md) — 배포·실측 절차
