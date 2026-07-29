<!--
Sync Impact Report
- Version change: (없음) → 1.0.0 (초기 제정)
- Modified principles: 없음 (신규 제정)
- Added sections:
  - Core Principles I~IX
  - 기술·범위 제약
  - 개발 워크플로
  - Governance
- Removed sections: 없음
- Templates requiring updates:
  - ✅ .specify/templates/plan-template.md (Constitution Check — 범용 게이트, 수정 불필요)
  - ✅ .specify/templates/spec-template.md (수정 불필요)
  - ✅ .specify/templates/tasks-template.md (수정 불필요)
- Follow-up TODOs: 없음
-->

# OKR.BEST Boards Plugin (okrbest-plugin-boards) Constitution

이 constitution은 `okrbest/okrbest-plugin-boards` 저장소(mattermost/mattermost-plugin-boards
포크, Focalboard 기반 Mattermost 플러그인)의 개발 규칙을 규정한다. 기존 관례
(`Makefile`, `.github/workflows/`, `AGENTS.md`, `.cursor/rules/`, `conductor/`)에서
도출했으며, Spec Kit으로 생산되는 모든 spec 주도 작업에 적용된다. 문서 언어는 한국어,
코드 식별자·명령·경로는 원형 유지.

## Core Principles

### I. 패키지별 품질 게이트 (NON-NEGOTIABLE)

변경이 닿은 패키지의 게이트를 머지 전에 통과해야 한다.

- `webapp/` (React 19 + TypeScript 5.7): `make webapp-ci` — `npm run check`
  (eslint + stylelint) + `npm run test`(Jest) + `npm run check-types`(`tsc`) 통과.
  CI 집행: `.github/workflows/ci.yml`.
- `server/` (Go 1.24.6): `make server-lint`(golangci-lint) + `make server-test`
  (`go test -race ./...`) 통과. CI(`make server-ci`)는 `server-lint`만 집행하므로
  **`server-test`는 로컬에서 반드시 직접 실행**하고 그 출력을 완료 근거로 제시한다.
- mock을 바꾸는 인터페이스 변경은 `make generate`(mockgen)로 재생성해 같은 변경에
  포함한다.

게이트를 통과하지 못한 변경은 준비되지 않은 것이다. 게이트를 우회하는 커밋·머지 금지.

### II. 레이어 경계 준수 (NON-NEGOTIABLE)

서버 코드는 `API → App → Store` 단방향 흐름을 지킨다. 레이어를 건너뛰는 호출
(예: `server/api/`에서 `services/store`를 직접 호출)을 금지한다.

- HTTP 핸들러·라우팅: `server/api/` (Gorilla Mux, `api.go`의 `RegisterRoutes()`에 등록).
- 비즈니스 로직·권한 판정: `server/app/`.
- 영속화: `server/services/store/sqlstore/` (Squirrel 쿼리 빌더).

webapp은 상태를 Redux Toolkit 슬라이스(`webapp/src/store/`)로 관리하고, 컴포넌트는
함수형 + 훅으로 작성한다. 스타일은 SCSS + BEM, 테마 값은 CSS 변수를 쓴다.

### III. 타입·오류 처리 엄격성 (NON-NEGOTIABLE)

타입 검사와 오류를 억누르지 않는다.

- TypeScript: `as any`, `@ts-ignore`, `@ts-expect-error` 금지. 타입 오류는 타입을
  고쳐서 해결한다.
- 빈 `catch` 블록 금지 — 처리하거나 로깅하거나 전파한다.
- Go 오류는 `model.NewErrBadRequest()`, `model.NewErrForbidden()` 등 도메인 오류
  생성자를 사용한다. 로깅은 `mlog.Debug/Info/Warn/Error`에 구조화 필드로 남긴다.

### IV. 동작 변경 시 테스트 동반

동작을 바꾸는 변경은 테스트를 동반한다.

- Go: 같은 패키지에 colocated `_test.go`.
- webapp: Jest + React Testing Library, 대상 옆에 colocated `*.test.tsx` / `*.test.ts`.

버그 수정은 회귀 테스트를 포함한다. 통과를 위해 테스트를 약화·스킵·삭제하는 것을
금지한다. 스냅샷은 변경 의도를 확인한 뒤에만 `npm run updatesnapshot`으로 갱신한다.

예외: upstream 선별 반영(`/speckit-sync`)에서 원본 그대로 cherry-pick하는 커밋
(`Upstream:` 참조 포함)은 테스트 동반 요건의 예외다. 대신 반영 직후 접촉 패키지
테스트로 회귀를 검증해야 한다. adapt(프로젝트 맞춤 수정) 커밋은 예외가 아니며 본
원칙을 그대로 따른다.

### V. i18n 동기화

사용자에게 표시되는 문자열을 추가·변경하면 `webapp/i18n/en.json`과
`webapp/i18n/ko.json`을 같은 변경에서 동시 갱신한다. 한국어는 이 포크의 1급
로케일이다. 문자열은 코드에 하드코딩하지 않고 메시지 ID로 정의한다.

### VI. Upstream·라이선스 충실성 (NON-NEGOTIABLE)

이 저장소는 `mattermost/mattermost-plugin-boards`의 포크다.

- `Copyright (c) 2015-present Mattermost, Inc.` 라이선스 헤더를 유지한다 —
  제거·변경 금지. `make check-style`의 `mattermost-govet -license -license.year=2020`가
  집행한다.
- `NOTICE.txt`를 유지한다.
- 플러그인 ID는 `focalboard`로 고정한다 (`plugin.json`, API 경로
  `/plugins/focalboard/api/v2/`). 리브랜드는 표시 문자열 수준에서만 수행한다.
- `plugin.json`을 바꾸면 `make apply`로 `server/`·`webapp/`에 매니페스트를 전파한다.
- 업스트림과의 구조 변경(디렉터리 이동·대규모 리네임)은 최소화하여 머지 충돌을 줄인다.

### VII. DB 마이그레이션 규율

- 마이그레이션은 `server/services/store/sqlstore/migrations/`에 번호 순으로 추가하고,
  `.up.sql`과 `.down.sql`을 쌍으로 만든다.
- **`.down.sql`은 `SELECT 1;` 한 줄이어야 한다** — CI가 집행한다
  (`.github/workflows/lint-server.yml`의 `down-migrations` 잡). 실제 롤백은 지원하지
  않으므로 되돌릴 수 없는 파괴적 스키마 변경은 신중히 설계한다.
- PostgreSQL·MySQL·SQLite 세 백엔드에서 동작해야 한다. 특정 DB 전용 문법은 분기 처리한다.

### VIII. 집중 브랜치 + Conventional Commits + PR

`main` 직접 커밋 금지 (`main`은 Makefile의 `PROTECTED_BRANCH`이며 태깅 기준 브랜치다).
작업당 브랜치 1개, PR 경유 머지. 커밋 메시지는 Conventional Commits 접두사
(`feat:`, `fix:`, `docs:`, `refactor:`, `chore:`)를 사용하며 본문은 한국어를 허용한다
(기존 관례). PR은 집중적·최소 범위로 유지한다.

- 버그를 고치면서 무관한 리팩터를 섞지 않는다 (한 변경 = 한 관심사).
- 새 의존성 추가는 근거를 PR 본문에 남긴다.
- 사용자가 명시적으로 요청하지 않으면 커밋하지 않는다.

예외: upstream 선별 반영 커밋(`Upstream:` 참조 포함)은 추적성 보존을 위해 원본 커밋
제목을 유지할 수 있으며(Conventional Commits 접두사 면제), sync PR은 여러 upstream
커밋을 묶을 수 있다. 이때 병합은 커밋별 제목·본문이 보존되는 rebase merge로 한정한다
(squash 금지 — `Upstream:` 참조 소실 방지).

### IX. Spec 주도 개발 워크플로

기능 작업은 Spec Kit 파이프라인을 따른다:
`constitution → specify → (clarify) → plan → tasks → (analyze) → implement`.
명세 정본은 `specs/<NNN-feature>/`에 커밋한다.

기존 문서 경로는 레거시로 보존하되 신규 기능 명세는 `specs/`에 작성한다:
`spec-docs/`(아키텍처·마이그레이션 노트), `conductor/`(제품·스타일 가이드),
`.sisyphus/`(과거 계획 도구 산출물), `docs/plans/`. `docs/superpowers/`는
brainstorming 임시 작업 폴더이며 신규 산출물은 추적하지 않는다(.gitignore).

구현 규율은 superpowers 플러그인이 런타임에 집행한다: 실패 테스트 우선
(test-driven-development), 증거 기반 완료 선언(verification-before-completion),
근본 원인 우선 디버깅(systematic-debugging). superpowers는 원칙 I·IV를 운영화하고,
spec-kit은 spec/plan 산출물을 소유한다.

예외: upstream 선별 반영(`/speckit-sync`)의 cherry-pick/adapt 커밋은 커밋별 의도
분석·대화형 승인을 거치므로 spec 파이프라인 요건의 예외다. 대규모·큰 영향 upstream
커밋은 spec 분기로 본 파이프라인에 합류한다.

## 기술·범위 제약

- 단일 저장소 플러그인: `server/`(Go 1.24.6 — `plugin → api → app → store`),
  `webapp/`(React 19 + TypeScript 5.7, webpack), `build/`(pluginctl·매니페스트 도구),
  `assets/`, `public/`.
- Node는 `.nvmrc`(20.11) 기준. 패키지 매니저는 npm — `webapp/package-lock.json`을
  같은 변경에서 함께 커밋하고 yarn·pnpm 등 경쟁 lockfile을 금지한다.
- `plugin.json`의 `min_server_version`(10.7.0) 미만에서만 존재하는 서버 API에 의존하지
  않는다.
- 카드 에디터는 BlockSuite(Yjs CRDT)로 마이그레이션 중이다
  (`webapp/src/components/blockSuite/`, `server/api/blocksuite.go`). 레거시 Block
  시스템과의 호환을 깨는 변경은 마이그레이션 경로를 명시해야 한다.
- 빌드는 형제 디렉터리에 `mattermost` 저장소 클론(`../mattermost`)을 요구한다.
  개발 빌드는 `MM_DEBUG=true make dist`, 배포는 `make deploy`, 감시 모드는
  `make watch-plugin`.
- 비밀값·자격증명은 커밋 금지 (`.env` 등은 .gitignore). `.specify/`에도 금지.

## 개발 워크플로

작은 수정은 브랜치 + PR로 직행. 기능·API 변경은 spec-kit 파이프라인으로 명세를 먼저
만든다. 복잡한 기능은 superpowers `brainstorming`으로 의도를 정리한 뒤
`/speckit-specify`로 넘긴다(핸드오프 규칙은 CLAUDE.md/AGENTS.md 참조). 기본 머지
대상은 `main`이며 리뷰된 PR + CI 통과가 조건이다.

에이전트 응답과 명세 문서는 한국어로 작성한다. 코드 식별자·파일 경로·셸 명령·
FR/SC 식별자·BDD 키워드(Given/When/Then)는 원형을 유지한다.

## Governance

이 constitution은 다른 관례·문서보다 우선한다. 개정은 PR로 제안하고 버전을 시맨틱
버저닝으로 올린다(MAJOR: 원칙 제거·재정의, MINOR: 원칙 추가·실질 확장, PATCH: 문구
명확화). 모든 PR·리뷰는 원칙 준수를 확인해야 하며, 원칙 위반이 필요한 경우 그 근거를
plan의 Complexity Tracking에 문서화한다. `/speckit-plan`·`/speckit-analyze`가
Constitution Check 게이트로 자동 참조한다.

**Version**: 1.0.0 | **Ratified**: 2026-07-29 | **Last Amended**: 2026-07-29
