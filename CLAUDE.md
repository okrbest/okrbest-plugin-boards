<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan:
[specs/004-table-drag-reorder/plan.md](specs/004-table-drag-reorder/plan.md)
<!-- SPECKIT END -->

## Workflow

This repository combines **spec-kit** (specification pipeline) and **superpowers**
(implementation discipline). spec-kit owns the spec/plan artifacts under `specs/`
(`/speckit-specify`, `/speckit-plan`, `/speckit-tasks`); superpowers governs
implementation — test-driven development, verification-before-completion, and
root-cause debugging. See [SPEC_KIT_GUIDE.md](SPEC_KIT_GUIDE.md) for the role
split and combined workflow. Project rules live in
`.specify/memory/constitution.md`.

프로젝트 컨텍스트(디렉터리 지도·엔트리 포인트·API 표)는 [AGENTS.md](AGENTS.md),
도메인별 규칙은 `.cursor/rules/features/`에 있다. 두 문서 모두 이 워크플로와 함께
읽는다.

Upstream(mattermost/mattermost-plugin-boards) 커밋 선별 반영은 `/speckit-sync`를
사용한다 (사전 준비 필요 — SPEC_KIT_GUIDE.md 6절).

## Brainstorming → /speckit-specify 핸드오프

기능 작업은 **복잡도로 분기**한다.

**어느 쪽이든 작업 브랜치를 먼저 만든다** (constitution 원칙 VIII). `main`은
브랜치 보호로 직접 push가 막혀 있고, `main`에서 설계를 시작하면 되돌릴 지점이 없다.

```bash
git switch main && git pull --ff-only
git switch -c <NNN>-<기능-슬러그>    # NNN은 specs/ 의 다음 순번
```

`/speckit-specify`는 현재 브랜치가 `main`이 아니면 그 브랜치를 그대로 쓴다 —
새 브랜치를 만들지 않는다. 마감은 PR → `gh pr merge --rebase` → `git pull --ff-only`.

- **단순/명확**: 브레인스토밍 없이 바로 `/speckit-specify`.
- **복잡**: superpowers `brainstorming`으로 의도·요구사항·설계를 정리한 뒤 `/speckit-specify`로 넘긴다.

**핵심 규칙 — brainstorming → speckit 전환은 반드시 "명시적 사용자 선택 단계"를 거친다.**

- brainstorming을 자동 종료하거나 건너뛰지 않는다. 사용자가 넘기라고 하기 전엔 speckit으로 진입 금지.
- 설계가 정리되면 전환을 눈에 보이게 제시하고 사용자가 고른다:
  ① `/speckit-specify`로 진행  ② 더 다듬기  ③ 중단/보류.
- 핸드오프 시점과 넘길 내용(정리된 설계)을 사용자가 확인한 뒤 결정한다.

## 명세 문서 언어 (Spec artifact language)

이 저장소의 spec-kit 산출물(`specs/<NNN-feature>/`의 `spec.md`, `plan.md`,
`tasks.md`, `checklists/`, 분석 노트 등)은 한국인 기획자·개발자를 위해 **한국어로
작성한다**. `/speckit-specify`, `/speckit-plan`, `/speckit-tasks`,
`/speckit-clarify`, `/speckit-analyze` 등 향후 모든 spec-kit 작업에 적용된다.
사용자에게 보내는 응답도 한국어로 쓴다.

- 코드 식별자, 파일 경로(`server/api/`, `webapp/src/components/` 등), 셸 명령
  (`make webapp-ci`, `make server-test` 등), FR/SC 식별자, BDD 키워드
  (Given/When/Then)는 원형을 유지한다.
- 템플릿이 영어로 산출되더라도 작성·갱신 시 한국어로 옮긴다.

## 품질 게이트 (완료 선언 전 필수)

변경이 닿은 패키지만 실행하면 된다. 출력을 근거로 제시한 뒤에만 완료를 선언한다
(constitution 원칙 I).

```bash
make webapp-ci     # webapp: npm run check + npm run test + npm run check-types
make server-lint   # server: golangci-lint
make server-test   # server: go test -race ./...  (CI 미집행 — 로컬 실행 필수)
```

## 문서 경로 정리

| 경로 | 성격 |
|---|---|
| `specs/<NNN-feature>/` | **명세 정본** (spec-kit 산출물, 커밋) |
| `spec-docs/` | 아키텍처·마이그레이션 노트 (레거시, 보존) |
| `conductor/` | 제품·코드 스타일 가이드 (보존) |
| `.sisyphus/`, `docs/plans/` | 과거 계획 도구 산출물 (보존, 신규 작성 금지) |
| `docs/superpowers/` | brainstorming 임시 초안 (.gitignore — 정본 아님) |

신규 기능 명세는 항상 `specs/`에 만든다.

## 에이전트 자산은 팀 공유가 기본

`.claude/` 아래 **스킬·서브에이전트·슬래시 명령·훅·`settings.json`은 커밋되어 팀 전체에
전파된다**(.gitignore 예외 규칙). 재사용할 만한 워크플로를 만들면 개인 디렉터리(`~/.claude/`)가
아니라 저장소의 `.claude/skills/`·`.claude/agents/`·`.claude/commands/`에 두고 커밋한다.
개인용 권한·메모만 `.claude/settings.local.json`·`CLAUDE.local.md`에 남긴다(무시됨).
