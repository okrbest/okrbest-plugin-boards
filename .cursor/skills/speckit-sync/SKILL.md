---
name: "speckit-sync"
description: "upstream(mattermost/mattermost-plugin-boards) 커밋을 오래된 순으로 LLM 정밀 분석하여 cherry-pick/adapt/exclude/spec으로 선별 반영하고, docs/upstream-main-unmerged-commits.md 목록을 갱신한다."
compatibility: "Requires git remote 'upstream' (mattermost/mattermost-plugin-boards), local branch 'upstream-main', spec-kit project structure (Cursor IDE Agent)"
metadata:
  author: "okrbest"
---

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## 목적

okrbest-plugin-boards는 mattermost/mattermost-plugin-boards의 포크다. 자체 기능(BlockSuite 에디터,
한국어 로케일, 알림·공유 확장 등)으로 분기가 커서 upstream 커밋을 그대로 merge할 수 없다.
이 스킬은 **오래된 순으로 한 커밋씩** LLM 정밀 분석을 거쳐 다음 넷 중 하나로 처리한다:

| 처리 | 조건 | 결과 |
|---|---|---|
| **cherry-pick** | 충돌 없음 + 의미 충돌 없음 | `git cherry-pick -x` 커밋 |
| **adapt** | 충돌 있으나 간단 (≤5 파일·≤150라인·보호경로 무접촉 가이드) | 프로젝트 맞춤 수정 후 새 커밋 |
| **exclude** | 우리가 자체 커밋으로 해당 기능을 변경/제거함 | ledger 부록에 사유 기록 |
| **spec** | 대규모·큰 영향 (>15 파일, >500라인, DB 마이그레이션, 신규 대형 기능) | spec-kit 파이프라인으로 별도 개발 |

추적 원리: 반영 커밋 본문의 upstream 해시 참조(`cherry picked from commit <hash>` / `Upstream: <링크>`)와
ledger 부록(제외/spec)이 기록이며, `.specify/scripts/bash/upstream-sync.sh update`가 이를 차감해
미반영 목록을 재생성한다. **별도 상태 파일 없음.**

도우미 스크립트: `.specify/scripts/bash/upstream-sync.sh` (이하 `$SYNC`)
`update` / `status` / `next [n]` / `signals <hash>` / `exclude <hash> <사유>` / `to-spec <hash> <specID>`

## 사전 준비 (저장소당 1회)

```bash
git remote add upstream https://github.com/mattermost/mattermost-plugin-boards.git
git fetch upstream
git branch upstream-main upstream/main   # 로컬 추적 브랜치
.specify/scripts/bash/upstream-sync.sh update
```

`upstream` remote 또는 `upstream-main` 브랜치가 없으면 이 스킬은 동작하지 않는다 —
사용자에게 위 명령을 안내하고 중단한다.

## 워크플로

### 1. 준비

1. 작업 트리 클린 확인 (`git status`). 더럽면 사용자에게 보고 후 중단.
2. 현재 브랜치 판별 (`git branch --show-current` + `git fetch origin`):
   - **main**: `git pull --ff-only` 후 3으로.
   - **sync/\* 브랜치**: `git cherry origin/main`로 반영 여부 판별 (patch-id 비교 — rebase merge로 해시가 바뀌어도 내용 동일이면 `-`).
     - 전부 `-` → 스테일 브랜치 (내용은 이미 main에 반영됨). 재사용 금지: `git switch main && git pull --ff-only`, 스테일 브랜치 삭제 후 3으로.
     - `+` 커밋 존재 → 미반영 작업이 남은 브랜치. 그 브랜치에서 이어서 작업, 3 생략.
   - **그 외 브랜치**: 의도된 브랜치 전환일 수 있다. 새 브랜치를 만들거나 main으로 전환하지 말고, 사용자에게 현재 브랜치와 상태를 보고한 뒤 지시를 기다린다.
3. sync 브랜치 생성: `git switch -c sync/upstream-$(date +%Y%m%d)`.
4. `$SYNC update` 실행 후 `$SYNC status` 요약 보고.

### 2. 커밋 루프 (사용자가 종료할 때까지 반복)

각 커밋마다:

#### 2-1. 재료 수집

- `$SYNC next` → 대상 full hash
- `$SYNC signals <hash>` → 충돌 예측(CLEAN/CONFLICT + 파일), 규모, HEAD 부재 경로, 보호 경로, 포크 자체 변경 이력
- `git show <hash>` → 실제 diff 내용

#### 2-2. LLM 정밀 분석 (필수 — 신호는 참고 자료일 뿐, 판단은 여기서)

1. **upstream 커밋의 의도** 파악: 무엇을 왜 바꾸는가 (버그픽스/기능/리팩터/문서/번역).
2. **우리 포크의 자체 변경과 대조**: signals의 FORK HISTORY에 나온 커밋들을 `git show`로 확인하고, 필요시 `git log -p main -- <경로>`와 `spec-docs/`·`conductor/`·`.cursor/rules/features/`를 조사한다. 질문: *우리가 이 영역을 의도적으로 바꿨거나 제거했는가?*
3. **의미 충돌 검토**: merge-tree가 CLEAN이어도 BlockSuite 마이그레이션으로 대체된 레거시 Block 경로, 우리가 제거·개조한 기능 참조, 한국어 문자열, 플러그인/서버 버전 의존을 확인한다. 텍스트가 안 겹쳐도 의미가 깨질 수 있다.
4. **미반영 의존 검토**: 이 커밋이 exclude·건너뜀·아직 미반영인 upstream 커밋(선행 리팩터, feature flag, config 기본값, DB 스키마)에 의존하는지 확인한다. ledger 부록과 `git log upstream-main`으로 선행 커밋 문맥을 조사한다.
5. 근거와 함께 **권고 결정**: cherry-pick / adapt / exclude / spec.

#### 2-3. 대화형 승인 (커밋마다 필수)

단답 선택지를 던지고 끝내지 않는다. 사용자가 **이해하고 결정할 수 있도록** 먼저 상세 보고를 제시한다. 보고에 반드시 포함:

1. **커밋 요약**: 의도(무엇을 왜), 변경 내용(파일·규모), upstream 링크
2. **우리 포크와의 관계**: 겹치는 자체 커밋 유무와 그 내용, 자체 개조·제거 기능과의 연관성
3. **판단 근거**: 충돌 예측 등 신호 + LLM 분석 결론
4. **선택지별 결과**: 각 선택(cherry-pick / adapt / exclude / spec / 건너뜀)을 고르면 무슨 일이 일어나는지, 장단점, 잘못 골랐을 때 되돌리는 방법
5. **권고 + 이유**: 왜 이 선택인지, 왜 다른 선택지는 아닌지

그 후 **열린 대화로 결정을 받는다**:

- "궁금한 점이 있으면 물어보세요. 결정되면 알려주세요."로 마무리 — 즉답을 강요하지 않는다.
- 사용자 질문에는 추가 조사(`git show`, 코드·문서 확인)로 구체적으로 답한다.
- **"추천해줘"·"뭐가 맞아?"는 결정이 아니다** — 권고와 근거를 더 자세히 설명하고 다시 결정을 기다린다.
- 결정 표현이 모호하면 "○○로 진행한다는 뜻이 맞나요?"로 명시적 재확인.
- 빠른 선택 UI가 있어도 보조로만 사용한다. 기본은 대화.

**사용자의 명확한 결정 전에는 어떤 코드 변경도 하지 않는다.**

#### 2-4. 실행

- **cherry-pick**:
  ```bash
  git cherry-pick -x <hash>
  git commit --amend -m "$(git log -1 --pretty=%B)

  Upstream: https://github.com/mattermost/mattermost-plugin-boards/commit/<full-hash>"
  ```
  cherry-pick 실패 시 `git cherry-pick --abort` 후 adapt로 전환 제안.
- **adapt**: superpowers 규율 적용 — 동작 변경이면 테스트 동반(test-driven-development), 원인 조사는 systematic-debugging, 완료 선언 전 검증 증거(verification-before-completion). 커밋 형식:
  ```
  <원본 커밋 제목 유지>

  <okrbest 맞춤 수정 요지 1-3줄>

  (cherry picked from commit <full-hash>, adapted for okrbest)
  Upstream: https://github.com/mattermost/mattermost-plugin-boards/commit/<full-hash>
  ```
- **exclude**: `$SYNC exclude <hash> "<사유>"` — 사유는 우리 쪽 근거 커밋/문서를 포함해 구체적으로.
- **spec**: `$SYNC to-spec <hash> "<가칭 또는 specs/NNN-이름>"` 기록. 그 후 사용자에게 `speckit-specify` 스킬 착수 여부를 **명시적으로 질문**한다 (.cursor/rules/boards-workflow.mdc 핸드오프 규칙 — 자동 진입 금지). spec 구현 완료 커밋 본문에 `Upstream: <링크>`를 넣어야 목록에서 자동 차감됨을 안내.
- **건너뜀**: 아무것도 하지 않음 (목록 유지).

**커밋 직후 검증 (cherry-pick·adapt 공통, 코드 커밋만)**: 접촉 패키지 한정 테스트를 즉시 실행해 회귀를 커밋 단위로 귀속시킨다 (constitution 원칙 IV 예외 조건).

- server 접촉 시: `cd server && go test ./<접촉 패키지>/...`
- webapp 접촉 시: `cd webapp && npm run test -- <관련 경로>`
- docs·i18n·주석만 건드린 커밋은 생략 가능.
- 실패 시 즉시 해결(systematic-debugging) 또는 해당 커밋 revert 후 사용자 보고 — 실패를 안고 다음 커밋으로 넘어가지 않는다.

#### 2-5. 목록 갱신

`$SYNC update` 재실행 → 남은 개수·마지막 반영 커밋 갱신 확인.

주의: 기본 `update`는 main 기준 계산이라 sync 브랜치의 새 커밋은 차감되지 않아 남은 개수가 즉시 줄지 않는다. 브랜치 커밋까지 포함한 정확한 개수는 `SYNC_BASE_BRANCH=HEAD $SYNC update`로 확인한다.

### 3. 세션 마감

1. **품질 게이트** (constitution 원칙 I — 변경된 패키지만):
   - `server/` 변경 시: `make server-lint` + `make server-test` (또는 영향 패키지 한정 `go test`)
   - `webapp/` 변경 시: `make webapp-ci` (또는 `cd webapp && npm run check && npm run check-types && npm run test`)
   - DB 마이그레이션 접촉 시: `.down.sql`이 `SELECT 1;` 한 줄인지 확인 (constitution 원칙 VII).
   - 통과 증거를 보인 후에만 완료 선언 (verification-before-completion).
2. **ledger 커밋 (sync 브랜치 위에서)**:
   ```bash
   SYNC_BASE_BRANCH=HEAD .specify/scripts/bash/upstream-sync.sh update
   git add docs/upstream-main-unmerged-commits.md
   git commit -m "docs: upstream sync 진행 (picked N, adapted M, excluded K)"
   ```
   `SYNC_BASE_BRANCH=HEAD`로 sync 브랜치 커밋까지 차감 계산해 남은 개수 감소를 병합 전에 검증한다.
3. **PR 병합** (사용자 확인 후) — `main` 직접 push 금지 (constitution 원칙 VIII), 반드시 gh CLI PR 경유:
   ```bash
   git push -u origin "$(git branch --show-current)"
   # 커밋 1개면 --fill(커밋 제목·본문 그대로 PR에 사용)
   gh pr create --base main --fill
   # 커밋 여러 개면 제목 요약 + 본문에 커밋 목록:
   #   gh pr create --base main \
   #     --title "upstream sync YYYY-MM-DD (picked N, adapted M)" \
   #     --body "$(git log main..HEAD --reverse --pretty='- %s')"
   gh pr merge --rebase --delete-branch
   git switch main && git pull --ff-only
   ```
   - 병합 방식은 **rebase merge 고정**. squash는 커밋 본문이 합쳐져 `Upstream:` 참조가 소실되고 ledger 차감 grep이 깨진다. rebase merge는 SHA만 바뀌고 커밋별 제목·본문이 보존된다.
   - `--delete-branch`가 원격·로컬 브랜치를 정리한다. rebase merge로 SHA가 바뀌므로 로컬 sync 브랜치를 재사용하지 않는다.
4. 요약 보고: 처리 커밋 수(분기별), 남은 pending, 다음 대상, PR URL.

## 주의

- 절대 `main`에서 직접 작업하지 않는다 (sync 브랜치에서만). 병합은 반드시 PR 경유.
- PR 병합은 항상 `gh pr merge --rebase`. squash·merge commit 금지 (`Upstream:` 참조 보존 목적).
- 오래된 순서를 건너뛰어 최신 커밋을 먼저 반영하지 않는다 (의존성 붕괴). "건너뜀"은 예외적·일시적이어야 한다.
- 대량 자동 처리 금지 — 커밋마다 분석·승인. 시간이 걸려도 정밀 분석이 우선.
- Translations update 커밋은 우리 i18n 변경(`webapp/i18n/ko.json`)과 상시 충돌 — adapt 시 우리 ko.json 문자열을 보존한다 (constitution 원칙 V).
- upstream 커밋이 `webapp/i18n/en.json`에 문자열을 추가·변경하면 같은 세션에서 `ko.json` 번역을 동반한다 (constitution 원칙 V — cherry-pick이면 직후 adapt 커밋으로 보충 가능).
- 라이선스 충실성 (constitution 원칙 VI): copyright 헤더·NOTICE.txt 관련 upstream 변경은 그대로 반영하고, 플러그인 ID(`focalboard`)와 우리 표시 문자열은 보존한다.
- BlockSuite 에디터로 대체된 레거시 Block 경로를 건드리는 upstream 커밋은 exclude 후보다 — 반영 전에 `webapp/src/components/blockSuite/` 현재 구현과 대조한다.
