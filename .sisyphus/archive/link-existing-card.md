# Sub-task에 기존 카드 연결(Link) 기능

## TL;DR

> **Quick Summary**: 하위 작업(Sub-tasks)에 기존 카드를 연결(Link)할 수 있는 기능을 추가합니다. Notion 스타일로 "새 페이지 추가" 옆에 "기존 항목 연결" 버튼을 제공하고, 연결 해제(Unlink) 기능도 포함합니다.
> 
> **Status**: ✅ **COMPLETED**
> 
> **Deliverables**:
> - ✅ Backend: CardPatch 모델 확장, Link/Unlink API 엔드포인트
> - ✅ Frontend: 카드 선택 UI 컴포넌트, SubCards.tsx 수정
> - ✅ 테스트: Backend/Frontend 단위 테스트
> - ✅ 다국어: en.json, ko.json 번역 키 추가
> 
> **Estimated Effort**: Medium
> **Parallel Execution**: YES - 3 waves
> **Critical Path**: Task 1 → Task 2,3 → Task 4 → Task 6 → Task 8

---

## Context

### Original Request
하위 작업(Sub-tasks)에 기존 카드를 연결(Link)할 수 있는 기능 추가. 현재는 새 하위 카드만 생성 가능하지만, Notion처럼 기존에 있던 카드도 선택해서 하위 카드로 연결할 수 있도록 함.

### Interview Summary
**Key Discussions**:
- Unlink 동작: 관계만 해제, 카드는 최상위(depth=0, parentCardId="")로 복원
- 프로퍼티 처리: 기존 프로퍼티 유지 (연결만 하고 속성값은 그대로)
- 테스트 전략: Tests-after (구현 완료 후 테스트 작성)

**Research Findings**:
- `server/model/card.go`: `ParentCardID`, `Depth` 필드 존재, MaxCardDepth=2
- `CardPatch`에는 `ParentCardID` 필드 없음 → 추가 필요
- `webapp/src/properties/card/card.tsx`: 카드 선택 UI 패턴 재사용 가능
- `webapp/src/components/cardDetail/subCards.tsx`: 하위 카드 목록 UI

### Metis Review
**Identified Gaps** (addressed):
- 연결된 카드가 기존 하위 카드를 가진 경우 depth 전파 필요 → 검증 로직에 포함
- 자손 카드 연결 방지 (순환 참조) → 검증 로직에 포함
- 기존 부모에서 이동 시 양쪽 UI 업데이트 → WebSocket 이벤트로 처리

---

## Work Objectives

### Core Objective
Sub-tasks 섹션에서 기존 카드를 선택하여 하위 카드로 연결하고, 연결을 해제할 수 있는 기능 구현

### Concrete Deliverables
- `server/model/card.go`: CardPatch에 ParentCardID 필드 추가
- `server/app/cards.go`: LinkCardAsSubCard(), UnlinkSubCard() 함수
- `server/api/cards.go`: POST /cards/{cardID}/link, DELETE /cards/{cardID}/link 엔드포인트
- `webapp/src/components/cardDetail/cardSelector.tsx`: 카드 선택 컴포넌트
- `webapp/src/components/cardDetail/subCards.tsx`: "기존 항목 연결" 버튼 추가
- `webapp/src/octoClient.ts`: linkCardAsSubCard(), unlinkSubCard() 함수
- `webapp/src/mutator.ts`: linkCardAsSubCard(), unlinkSubCard() 함수
- 테스트 파일들

### Definition of Done
- [x] 기존 카드를 하위 카드로 연결 가능
- [x] 연결된 카드를 해제하여 독립 카드로 복원 가능
- [x] 깊이 제한(MaxCardDepth=2) 검증 작동
- [x] 순환 참조 방지 검증 작동
- [x] 같은 보드 내 카드만 연결 가능
- [x] 실시간 UI 업데이트 (WebSocket)
- [x] 테스트 통과
- [x] 다국어(i18n) 지원 (en, ko)

### Must Have
- Link API: 기존 카드를 특정 카드의 하위 카드로 연결
- Unlink API: 하위 카드 연결 해제 (독립 카드로 복원)
- 카드 선택 UI: 검색, 필터링 (자기 자신/자손/depth 초과 제외)
- 검증: 깊이 제한, 순환 참조, 같은 보드

### Must NOT Have (Guardrails)
- 다른 보드의 카드 연결 (scope out)
- 드래그앤드롭 연결 (scope out)
- 연결 히스토리/감사 로그 (scope out)
- 프로퍼티 복사/병합 (기존 프로퍼티 유지)
- 연결 시 확인 다이얼로그 (자동 처리)

---

## Verification Strategy

> **UNIVERSAL RULE: ZERO HUMAN INTERVENTION**
>
> ALL tasks in this plan MUST be verifiable WITHOUT any human action.

### Test Decision
- **Infrastructure exists**: YES
- **Automated tests**: Tests-after
- **Framework**: Go test (server), Jest (webapp)

### Agent-Executed QA Scenarios (MANDATORY — ALL tasks)

**Verification Tool by Deliverable Type:**

| Type | Tool | How Agent Verifies |
|------|------|-------------------|
| Backend API | Bash (curl) | Send requests, parse responses, assert fields |
| Frontend UI | Playwright | Navigate, interact, assert DOM, screenshot |
| Build | Bash | Run build command, check exit code |

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately):
├── Task 1: CardPatch 모델 확장 (Backend - 독립)
└── Task 5: 카드 선택 컴포넌트 생성 (Frontend - UI만, API 호출 없음)

Wave 2 (After Task 1):
├── Task 2: LinkCardAsSubCard 비즈니스 로직
└── Task 3: UnlinkSubCard 비즈니스 로직

Wave 3 (After Task 2, 3):
└── Task 4: API 핸들러 등록

Wave 4 (After Task 4):
├── Task 6: octoClient/mutator 함수 추가
└── Task 7: Redux 액션 업데이트

Wave 5 (After Task 5, 6, 7):
└── Task 8: SubCards.tsx UI 통합

Wave 6 (After all implementation):
├── Task 9: Backend 테스트
└── Task 10: Frontend 테스트

Critical Path: Task 1 → Task 2 → Task 4 → Task 6 → Task 8
Parallel Speedup: ~40% faster than sequential
```

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
|------|------------|--------|---------------------|
| 1 | None | 2, 3 | 5 |
| 2 | 1 | 4 | 3 |
| 3 | 1 | 4 | 2 |
| 4 | 2, 3 | 6 | None |
| 5 | None | 8 | 1, 2, 3, 4 |
| 6 | 4 | 8 | 7 |
| 7 | None | 8 | 6 |
| 8 | 5, 6, 7 | 9, 10 | None |
| 9 | 8 | None | 10 |
| 10 | 8 | None | 9 |

---

## TODOs

- [x] 1. CardPatch 모델에 ParentCardID 필드 추가

  **What to do**:
  - `server/model/card.go`의 `CardPatch` 구조체에 `ParentCardID *string` 필드 추가
  - `CardPatch2BlockPatch()` 함수에서 ParentCardID 처리 로직 추가
  - BlockPatch에 ParentID 설정

  **Must NOT do**:
  - Card 모델 자체 변경 (이미 ParentCardID 필드 있음)
  - 기존 API 동작 변경

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 단일 파일의 구조체 필드 추가, 간단한 변경
  - **Skills**: []
    - 특별한 스킬 필요 없음

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 5)
  - **Blocks**: Tasks 2, 3
  - **Blocked By**: None

  **References**:
  
  **Pattern References**:
  - `server/model/card.go:156-172` - 기존 CardPatch 구조체 정의
  - `server/model/card.go:174-199` - CardPatch.Patch() 메서드 패턴
  - `server/model/card.go:331-362` - CardPatch2BlockPatch() 함수

  **Type References**:
  - `server/model/block.go:BlockPatch` - ParentID 필드 포함 여부 확인

  **Acceptance Criteria**:

  - [x] CardPatch 구조체에 `ParentCardID *string` 필드 추가됨
  - [x] CardPatch2BlockPatch()에서 ParentCardID가 BlockPatch.ParentID로 변환됨
  - [x] `go build ./server/...` → 빌드 성공

  **Agent-Executed QA Scenarios**:

  ```
  Scenario: Go 빌드 성공 확인
    Tool: Bash
    Preconditions: Go 1.24+ 설치됨
    Steps:
      1. cd /Users/oil/Desktop/workspace/okrbest-plugin-boards
      2. go build ./server/...
      3. Assert: exit code 0
    Expected Result: 빌드 에러 없음
    Evidence: 빌드 출력 캡처
  ```

  **Commit**: YES
  - Message: `feat(model): add ParentCardID field to CardPatch for card linking`
  - Files: `server/model/card.go`
  - Pre-commit: `go build ./server/...`

---

- [x] 2. LinkCardAsSubCard 비즈니스 로직 구현

  **What to do**:
  - `server/app/cards.go`에 `LinkCardAsSubCard(cardID, parentCardID, userID string) (*Card, error)` 함수 추가
  - 검증 로직 구현:
    1. 카드 존재 확인
    2. 같은 보드 확인
    3. 자기 자신 연결 방지
    4. 순환 참조 방지 (부모가 자신의 자손인지 확인)
    5. 깊이 제한 확인 (parentCard.Depth + 1 <= MaxCardDepth)
    6. 연결할 카드의 기존 하위 카드 깊이도 확인
  - 카드의 ParentCardID, Depth 업데이트
  - 기존 하위 카드들의 Depth도 재귀적으로 업데이트
  - WebSocket 브로드캐스트

  **Must NOT do**:
  - 프로퍼티 복사/변경 (기존 프로퍼티 유지)
  - 권한 검증 (API 레이어에서 처리)

  **Recommended Agent Profile**:
  - **Category**: `ultrabrain`
    - Reason: 순환 참조 검증, 재귀적 depth 업데이트 등 복잡한 비즈니스 로직
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Task 3)
  - **Blocks**: Task 4
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `server/app/cards.go:99-143` - CreateSubCard() 함수 (깊이 검증, 블록 생성 패턴)
  - `server/app/cards.go:66-83` - PatchCard() 함수 (카드 수정 패턴)
  - `server/app/blocks.go` - PatchBlockAndNotify() 함수 (WebSocket 브로드캐스트 패턴)

  **API/Type References**:
  - `server/model/card.go:40-41` - MaxCardDepth 상수
  - `server/model/card.go:45-101` - Card 구조체 (ParentCardID, Depth 필드)

  **Acceptance Criteria**:

  - [x] LinkCardAsSubCard 함수 구현됨
  - [x] 자기 자신 연결 시 에러 반환
  - [x] 다른 보드 카드 연결 시 에러 반환
  - [x] 깊이 초과 시 에러 반환
  - [x] 순환 참조 시 에러 반환
  - [x] `go build ./server/...` → 빌드 성공

  **Agent-Executed QA Scenarios**:

  ```
  Scenario: 빌드 및 함수 존재 확인
    Tool: Bash
    Preconditions: Task 1 완료
    Steps:
      1. go build ./server/...
      2. Assert: exit code 0
      3. grep -n "func.*LinkCardAsSubCard" server/app/cards.go
      4. Assert: 함수 정의 존재
    Expected Result: 빌드 성공, 함수 정의 확인
    Evidence: grep 출력
  ```

  **Commit**: NO (groups with Task 3, 4)

---

- [x] 3. UnlinkSubCard 비즈니스 로직 구현

  **What to do**:
  - `server/app/cards.go`에 `UnlinkSubCard(cardID, userID string) (*Card, error)` 함수 추가
  - 검증 로직:
    1. 카드 존재 확인
    2. 이미 최상위 카드인 경우 에러 (또는 no-op)
  - 카드의 ParentCardID를 "", Depth를 0으로 설정
  - 기존 하위 카드들의 Depth도 재귀적으로 조정 (-parentDepth)
  - WebSocket 브로드캐스트

  **Must NOT do**:
  - 카드 삭제
  - 프로퍼티 변경

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Link보다 단순한 로직, 검증 적음
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Task 2)
  - **Blocks**: Task 4
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `server/app/cards.go:99-143` - CreateSubCard() 함수 (참조용)
  - `server/app/cards.go:66-83` - PatchCard() 함수

  **Acceptance Criteria**:

  - [x] UnlinkSubCard 함수 구현됨
  - [x] 연결 해제 후 카드의 ParentCardID가 빈 문자열
  - [x] 연결 해제 후 카드의 Depth가 0
  - [x] `go build ./server/...` → 빌드 성공

  **Agent-Executed QA Scenarios**:

  ```
  Scenario: 빌드 및 함수 존재 확인
    Tool: Bash
    Preconditions: Task 1 완료
    Steps:
      1. go build ./server/...
      2. Assert: exit code 0
      3. grep -n "func.*UnlinkSubCard" server/app/cards.go
      4. Assert: 함수 정의 존재
    Expected Result: 빌드 성공, 함수 정의 확인
    Evidence: grep 출력
  ```

  **Commit**: NO (groups with Task 2, 4)

---

- [x] 4. Link/Unlink API 핸들러 등록

  **What to do**:
  - `server/api/cards.go`에 핸들러 추가:
    - `handleLinkCardAsSubCard`: POST /cards/{cardID}/link
    - `handleUnlinkSubCard`: DELETE /cards/{cardID}/link
  - `registerCardsRoutes()`에 라우트 등록
  - 권한 검증: `PermissionManageBoardCards`
  - 요청 본문 파싱 (Link: parentCardId)
  - app 레이어 함수 호출
  - 응답 반환

  **Must NOT do**:
  - 비즈니스 로직 직접 구현 (app 레이어에 위임)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 기존 핸들러 패턴 따라 구현
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (sequential)
  - **Blocks**: Task 6
  - **Blocked By**: Tasks 2, 3

  **References**:

  **Pattern References**:
  - `server/api/cards.go:399-502` - handleCreateSubCard() 핸들러 패턴
  - `server/api/cards.go:238-333` - handlePatchCard() 핸들러 패턴
  - `server/api/cards.go:25-36` - registerCardsRoutes() 라우트 등록

  **API/Type References**:
  - `server/model/errors.go` - 에러 타입들

  **Acceptance Criteria**:

  - [x] POST /cards/{cardID}/link 엔드포인트 등록됨
  - [x] DELETE /cards/{cardID}/link 엔드포인트 등록됨
  - [x] 권한 검증 포함
  - [x] Swagger 주석 포함
  - [x] `go build ./server/...` → 빌드 성공

  **Agent-Executed QA Scenarios**:

  ```
  Scenario: API 라우트 등록 확인
    Tool: Bash
    Preconditions: Tasks 2, 3 완료
    Steps:
      1. go build ./server/...
      2. Assert: exit code 0
      3. grep -n "link" server/api/cards.go
      4. Assert: handleLinkCardAsSubCard, handleUnlinkSubCard 존재
    Expected Result: 빌드 성공, 핸들러 정의 확인
    Evidence: grep 출력
  ```

  **Commit**: YES
  - Message: `feat(api): add link/unlink endpoints for sub-card management`
  - Files: `server/api/cards.go`, `server/app/cards.go`
  - Pre-commit: `go build ./server/...`

---

- [x] 5. 카드 선택 컴포넌트 생성 (CardLinkSelector)

  **What to do**:
  - `webapp/src/components/cardDetail/cardLinkSelector.tsx` 생성
  - Props: `boardId`, `currentCardId`, `currentCardDepth`, `onSelect`, `onClose`
  - 기능:
    - 같은 보드의 카드 목록 조회 (octoClient.getCardsForBoard 사용)
    - 검색 필터링
    - 연결 불가 카드 비활성화:
      - 자기 자신
      - 이미 하위 카드인 카드들
      - depth 제한 초과하는 카드 (자신의 depth + 선택 카드의 하위 깊이 > MaxCardDepth)
    - 카드 선택 시 onSelect 콜백 호출
  - `cardLinkSelector.scss` 스타일 파일 생성

  **Must NOT do**:
  - API 직접 호출 (octoClient 사용)
  - Redux 상태 직접 수정

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: UI 컴포넌트 생성, 스타일링 포함
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: 카드 선택 드롭다운 UI 디자인

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 1)
  - **Blocks**: Task 8
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `webapp/src/properties/card/card.tsx:104-410` - 카드 선택 UI 패턴 (검색, 드롭다운, 필터링)
  - `webapp/src/components/boardSelector.tsx` - 선택기 컴포넌트 패턴

  **Style References**:
  - `webapp/src/properties/card/card.scss` - 카드 선택기 스타일

  **Acceptance Criteria**:

  - [x] CardLinkSelector 컴포넌트 생성됨
  - [x] 검색 기능 작동
  - [x] 연결 불가 카드 비활성화 표시
  - [x] `npm run check-types` → 타입 에러 없음
  - [x] `npm run check` → 린트 에러 없음

  **Agent-Executed QA Scenarios**:

  ```
  Scenario: 타입 체크 및 린트 통과
    Tool: Bash
    Preconditions: webapp/node_modules 설치됨
    Steps:
      1. cd webapp
      2. npm run check-types
      3. Assert: exit code 0
      4. npm run check
      5. Assert: exit code 0 또는 기존 에러만 존재
    Expected Result: 새 컴포넌트로 인한 에러 없음
    Evidence: 명령 출력

  Scenario: 컴포넌트 파일 존재 확인
    Tool: Bash
    Steps:
      1. ls -la webapp/src/components/cardDetail/cardLinkSelector.tsx
      2. Assert: 파일 존재
      3. ls -la webapp/src/components/cardDetail/cardLinkSelector.scss
      4. Assert: 파일 존재
    Expected Result: 두 파일 모두 존재
    Evidence: ls 출력
  ```

  **Commit**: YES
  - Message: `feat(ui): add CardLinkSelector component for linking existing cards`
  - Files: `webapp/src/components/cardDetail/cardLinkSelector.tsx`, `webapp/src/components/cardDetail/cardLinkSelector.scss`
  - Pre-commit: `cd webapp && npm run check-types`

---

- [x] 6. octoClient/mutator에 Link/Unlink 함수 추가

  **What to do**:
  - `webapp/src/octoClient.ts`에 추가:
    - `linkCardAsSubCard(cardId: string, parentCardId: string): Promise<Card>`
    - `unlinkSubCard(cardId: string): Promise<Card>`
  - `webapp/src/mutator.ts`에 추가:
    - `linkCardAsSubCard(boardId, cardId, parentCardId, onLinked?)` - 낙관적 업데이트 + undo 지원
    - `unlinkSubCard(boardId, cardId, onUnlinked?)` - 낙관적 업데이트 + undo 지원

  **Must NOT do**:
  - Redux 상태 직접 수정 (mutator 패턴 사용)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 기존 패턴 따라 함수 추가
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Task 7)
  - **Blocks**: Task 8
  - **Blocked By**: Task 4

  **References**:

  **Pattern References**:
  - `webapp/src/octoClient.ts` - API 호출 패턴 (fetch, headers)
  - `webapp/src/mutator.ts:52-79` - createSubCard() 함수 패턴
  - `webapp/src/mutator.ts:126-145` - insertBlock() 함수 (undo 패턴)

  **Acceptance Criteria**:

  - [x] octoClient.linkCardAsSubCard 함수 구현됨
  - [x] octoClient.unlinkSubCard 함수 구현됨
  - [x] mutator.linkCardAsSubCard 함수 구현됨
  - [x] mutator.unlinkSubCard 함수 구현됨
  - [x] `npm run check-types` → 타입 에러 없음

  **Agent-Executed QA Scenarios**:

  ```
  Scenario: 타입 체크 통과
    Tool: Bash
    Preconditions: Task 4 완료 (API 엔드포인트)
    Steps:
      1. cd webapp
      2. npm run check-types
      3. Assert: exit code 0
      4. grep -n "linkCardAsSubCard" src/octoClient.ts
      5. Assert: 함수 정의 존재
      6. grep -n "linkCardAsSubCard" src/mutator.ts
      7. Assert: 함수 정의 존재
    Expected Result: 타입 에러 없음, 함수 정의 확인
    Evidence: grep 출력
  ```

  **Commit**: YES
  - Message: `feat(client): add linkCardAsSubCard and unlinkSubCard functions`
  - Files: `webapp/src/octoClient.ts`, `webapp/src/mutator.ts`
  - Pre-commit: `cd webapp && npm run check-types`

---

- [x] 7. Redux 액션 업데이트 (removeSubCard 추가)

  **What to do**:
  - `webapp/src/store/cards.ts`에 추가:
    - `removeSubCard` 액션: 특정 하위 카드를 부모의 subCards 목록에서 제거
    - `updateSubCard` 액션: 하위 카드 정보 업데이트 (필요시)
  - 기존 `addSubCard`, `setSubCards` 액션은 그대로 활용

  **Must NOT do**:
  - 기존 액션 동작 변경

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 기존 패턴 따라 액션 추가
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Task 6)
  - **Blocks**: Task 8
  - **Blocked By**: None (독립적이지만 Task 8에서 필요)

  **References**:

  **Pattern References**:
  - `webapp/src/store/cards.ts:126-140` - setSubCards, addSubCard, setSubCardCount, clearSubCards 액션 패턴

  **Acceptance Criteria**:

  - [x] removeSubCard 액션 추가됨
  - [x] 액션 export됨
  - [x] `npm run check-types` → 타입 에러 없음

  **Agent-Executed QA Scenarios**:

  ```
  Scenario: 타입 체크 및 액션 존재 확인
    Tool: Bash
    Steps:
      1. cd webapp
      2. npm run check-types
      3. Assert: exit code 0
      4. grep -n "removeSubCard" src/store/cards.ts
      5. Assert: 액션 정의 및 export 존재
    Expected Result: 타입 에러 없음, 액션 확인
    Evidence: grep 출력
  ```

  **Commit**: YES
  - Message: `feat(store): add removeSubCard action for unlinking sub-cards`
  - Files: `webapp/src/store/cards.ts`
  - Pre-commit: `cd webapp && npm run check-types`

---

- [x] 8. SubCards.tsx UI 통합

  **What to do**:
  - `webapp/src/components/cardDetail/subCards.tsx` 수정:
    - "기존 항목 연결" 버튼 추가 (CompassIcon icon='link-variant')
    - CardLinkSelector 컴포넌트 통합
    - 연결/해제 핸들러 구현:
      - `handleLinkCard`: mutator.linkCardAsSubCard 호출 후 Redux 상태 업데이트
      - `handleUnlinkCard`: mutator.unlinkSubCard 호출 후 Redux 상태 업데이트
    - 하위 카드 항목에 "연결 해제" 버튼 추가 (아이콘 또는 컨텍스트 메뉴)
  - `subCards.scss` 스타일 업데이트

  **Must NOT do**:
  - 기존 "새 페이지 추가하기" 기능 변경
  - 과도한 UI 변경 (Notion 스타일 참조하되 기존 디자인 유지)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: UI 통합, 스타일링, 이벤트 핸들링
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 5 (sequential)
  - **Blocks**: Tasks 9, 10
  - **Blocked By**: Tasks 5, 6, 7

  **References**:

  **Pattern References**:
  - `webapp/src/components/cardDetail/subCards.tsx:52-74` - handleAddSubCard 핸들러 패턴
  - `webapp/src/components/cardDetail/subCards.tsx:141-161` - 버튼 UI 패턴

  **Style References**:
  - `webapp/src/components/cardDetail/subCards.scss` - 기존 스타일

  **Acceptance Criteria**:

  - [x] "기존 항목 연결" 버튼 표시됨
  - [x] 버튼 클릭 시 CardLinkSelector 표시됨
  - [x] 카드 선택 시 하위 카드로 연결됨
  - [x] 연결 해제 버튼 작동
  - [x] `npm run check-types` → 타입 에러 없음
  - [x] `npm run check` → 린트 에러 없음

  **Agent-Executed QA Scenarios**:

  ```
  Scenario: 빌드 및 타입 체크
    Tool: Bash
    Preconditions: Tasks 5, 6, 7 완료
    Steps:
      1. cd webapp
      2. npm run check-types
      3. Assert: exit code 0
      4. npm run check
      5. Assert: 새로운 린트 에러 없음
    Expected Result: 타입/린트 에러 없음
    Evidence: 명령 출력

  Scenario: UI 버튼 존재 확인 (정적 분석)
    Tool: Bash
    Steps:
      1. grep -n "link-variant\|기존 항목 연결\|Link existing" webapp/src/components/cardDetail/subCards.tsx
      2. Assert: 연결 버튼 관련 코드 존재
    Expected Result: 연결 버튼 코드 확인
    Evidence: grep 출력
  ```

  **Commit**: YES
  - Message: `feat(ui): integrate card linking into SubCards component`
  - Files: `webapp/src/components/cardDetail/subCards.tsx`, `webapp/src/components/cardDetail/subCards.scss`
  - Pre-commit: `cd webapp && npm run check-types && npm run check`

---

- [x] 9. Backend 테스트 작성

  **What to do**:
  - `server/app/cards_test.go`에 테스트 추가:
    - `TestLinkCardAsSubCard_Success`: 정상 연결
    - `TestLinkCardAsSubCard_SameCard`: 자기 자신 연결 실패
    - `TestLinkCardAsSubCard_DifferentBoard`: 다른 보드 카드 연결 실패
    - `TestLinkCardAsSubCard_DepthExceeded`: 깊이 초과 실패
    - `TestLinkCardAsSubCard_CircularReference`: 순환 참조 실패
    - `TestUnlinkSubCard_Success`: 정상 연결 해제
    - `TestUnlinkSubCard_AlreadyTopLevel`: 이미 최상위 카드

  **Must NOT do**:
  - 통합 테스트 (단위 테스트만)
  - 기존 테스트 수정

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 기존 테스트 패턴 따라 작성
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 6 (with Task 10)
  - **Blocks**: None
  - **Blocked By**: Task 8

  **References**:

  **Pattern References**:
  - `server/app/cards_test.go` (존재하는 경우) - 기존 테스트 패턴
  - `server/app/blocks_test.go` - 테스트 패턴 참조

  **Acceptance Criteria**:

  - [x] 테스트 파일 생성됨
  - [x] 모든 테스트 케이스 통과
  - [x] `go test ./server/app/... -v -run TestLinkCard` → PASS
  - [x] `go test ./server/app/... -v -run TestUnlinkSubCard` → PASS

  **Agent-Executed QA Scenarios**:

  ```
  Scenario: 테스트 실행
    Tool: Bash
    Preconditions: Task 8 완료
    Steps:
      1. cd /Users/oil/Desktop/workspace/okrbest-plugin-boards
      2. go test ./server/app/... -v -run "TestLinkCard|TestUnlinkSubCard"
      3. Assert: 모든 테스트 PASS
    Expected Result: 테스트 통과
    Evidence: 테스트 출력
  ```

  **Commit**: YES
  - Message: `test(app): add unit tests for LinkCardAsSubCard and UnlinkSubCard`
  - Files: `server/app/cards_test.go`
  - Pre-commit: `go test ./server/app/... -v -run "TestLinkCard|TestUnlinkSubCard"`

---

- [x] 10. Frontend 테스트 작성

  **What to do**:
  - `webapp/src/components/cardDetail/cardLinkSelector.test.tsx` 생성:
    - 컴포넌트 렌더링 테스트
    - 검색 필터링 테스트
    - 카드 선택 콜백 테스트
  - `webapp/src/components/cardDetail/subCards.test.tsx` 업데이트 (존재하는 경우):
    - 연결 버튼 렌더링 테스트
    - 연결 해제 버튼 렌더링 테스트

  **Must NOT do**:
  - E2E 테스트 (단위 테스트만)
  - 기존 테스트 삭제

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 기존 테스트 패턴 따라 작성
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 6 (with Task 9)
  - **Blocks**: None
  - **Blocked By**: Task 8

  **References**:

  **Pattern References**:
  - `webapp/src/components/**/*.test.tsx` - 기존 테스트 패턴
  - `webapp/src/properties/card/card.test.tsx` (존재하는 경우) - 카드 선택기 테스트 패턴

  **Acceptance Criteria**:

  - [x] 테스트 파일 생성됨
  - [x] 모든 테스트 통과
  - [x] `npm run test -- --testPathPattern=cardLinkSelector` → PASS
  - [x] `npm run test -- --testPathPattern=subCards` → PASS (새 테스트 포함)

  **Agent-Executed QA Scenarios**:

  ```
  Scenario: 테스트 실행
    Tool: Bash
    Preconditions: Task 8 완료
    Steps:
      1. cd webapp
      2. npm run test -- --testPathPattern=cardLinkSelector --passWithNoTests
      3. Assert: 테스트 통과 또는 no tests (초기)
      4. npm run test -- --testPathPattern=subCards --passWithNoTests
      5. Assert: 테스트 통과 또는 no tests
    Expected Result: 테스트 에러 없음
    Evidence: 테스트 출력
  ```

  **Commit**: YES
  - Message: `test(ui): add unit tests for CardLinkSelector and SubCards components`
  - Files: `webapp/src/components/cardDetail/cardLinkSelector.test.tsx`, `webapp/src/components/cardDetail/subCards.test.tsx`
  - Pre-commit: `cd webapp && npm run test -- --testPathPattern="cardLinkSelector|subCards" --passWithNoTests`

---

- [x] 11. 다국어(i18n) 지원 추가

  **What to do**:
  - `webapp/i18n/en.json`에 SubCards, CardLinkSelector 영어 번역 키 추가
  - `webapp/i18n/ko.json`에 SubCards, CardLinkSelector 한국어 번역 키 추가
  - `subCards.tsx`, `cardLinkSelector.tsx`의 `defaultMessage`를 영어로 변경 (프로젝트 컨벤션)

  **Must NOT do**:
  - 기존 번역 키 변경
  - 다른 언어 파일 수정 (en, ko만)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 단순 번역 키 추가 작업
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 7 (after all implementation)
  - **Blocks**: None
  - **Blocked By**: Task 8

  **References**:

  **Pattern References**:
  - `webapp/i18n/en.json` - 기존 번역 키 패턴
  - `webapp/i18n/ko.json` - 기존 번역 키 패턴

  **Acceptance Criteria**:

  - [x] en.json에 15개 번역 키 추가됨
  - [x] ko.json에 15개 번역 키 추가됨
  - [x] 컴포넌트의 defaultMessage가 영어로 변경됨
  - [x] JSON 파일 유효성 검증 통과
  - [x] `npm run check-types` → 타입 에러 없음

  **Agent-Executed QA Scenarios**:

  ```
  Scenario: JSON 유효성 및 타입 체크
    Tool: Bash
    Steps:
      1. cd webapp
      2. node -e "JSON.parse(require('fs').readFileSync('i18n/en.json', 'utf8'))"
      3. Assert: exit code 0
      4. node -e "JSON.parse(require('fs').readFileSync('i18n/ko.json', 'utf8'))"
      5. Assert: exit code 0
      6. npm run check-types
      7. Assert: exit code 0
    Expected Result: JSON 유효, 타입 에러 없음
    Evidence: 명령 출력
  ```

  **Commit**: YES
  - Message: `feat(i18n): add translations for SubCards and CardLinkSelector components`
  - Files: `webapp/i18n/en.json`, `webapp/i18n/ko.json`, `webapp/src/components/cardDetail/subCards.tsx`, `webapp/src/components/cardDetail/cardLinkSelector.tsx`
  - Pre-commit: `cd webapp && npm run check-types`

  **Added Translation Keys**:
  | Key | English | Korean |
  |-----|---------|--------|
  | SubCards.title | Sub-tasks | 하위 작업 |
  | SubCards.loading | Loading... | 로딩 중... |
  | SubCards.untitled | Untitled | 제목 없음 |
  | SubCards.unlink | Unlink | 연결 해제 |
  | SubCards.addNew | Add new page | 새 페이지 추가하기 |
  | SubCards.linkExisting | Link existing item | 기존 항목 연결 |
  | SubCards.empty | No sub-tasks | 하위 작업 없음 |
  | CardLinkSelector.header | Link existing card | 기존 카드 연결 |
  | CardLinkSelector.searchPlaceholder | Search cards... | 카드 검색... |
  | CardLinkSelector.loading | Loading... | 로딩 중... |
  | CardLinkSelector.empty | No cards available to link | 연결 가능한 카드가 없습니다 |
  | CardLinkSelector.cannotLinkSelf | Cannot link self | 자기 자신 |
  | CardLinkSelector.alreadySubCard | Already a sub-card | 이미 하위 카드 |
  | CardLinkSelector.depthExceeded | Depth limit exceeded | 깊이 제한 초과 |
  | CardLinkSelector.untitled | Untitled | 제목 없음 |

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 1 | `feat(model): add ParentCardID field to CardPatch` | `server/model/card.go` | `go build ./server/...` |
| 4 | `feat(api): add link/unlink endpoints for sub-card management` | `server/api/cards.go`, `server/app/cards.go` | `go build ./server/...` |
| 5 | `feat(ui): add CardLinkSelector component` | `cardLinkSelector.tsx`, `cardLinkSelector.scss` | `npm run check-types` |
| 6 | `feat(client): add linkCardAsSubCard and unlinkSubCard functions` | `octoClient.ts`, `mutator.ts` | `npm run check-types` |
| 7 | `feat(store): add removeSubCard action` | `store/cards.ts` | `npm run check-types` |
| 8 | `feat(ui): integrate card linking into SubCards component` | `subCards.tsx`, `subCards.scss` | `npm run check-types && npm run check` |
| 9 | `test(app): add unit tests for LinkCardAsSubCard and UnlinkSubCard` | `cards_test.go` | `go test ./server/app/...` |
| 10 | `test(ui): add unit tests for CardLinkSelector and SubCards` | `*.test.tsx` | `npm run test` |
| 11 | `feat(i18n): add translations for SubCards and CardLinkSelector` | `en.json`, `ko.json`, `subCards.tsx`, `cardLinkSelector.tsx` | `npm run check-types` |

---

## Success Criteria

### Verification Commands
```bash
# Backend 빌드
go build ./server/...  # Expected: exit 0

# Frontend 빌드
cd webapp && npm run check-types  # Expected: exit 0
cd webapp && npm run check  # Expected: no new errors

# 전체 플러그인 빌드
MM_DEBUG=true make dist  # Expected: exit 0

# Backend 테스트
go test ./server/app/... -v -run "TestLinkCard|TestUnlinkSubCard"  # Expected: PASS

# Frontend 테스트
cd webapp && npm run test -- --testPathPattern="cardLinkSelector|subCards" --passWithNoTests  # Expected: PASS
```

### Final Checklist
- [x] 기존 카드를 하위 카드로 연결 가능
- [x] 연결된 카드를 해제하여 독립 카드로 복원 가능
- [x] 깊이 제한(MaxCardDepth=2) 검증 작동
- [x] 순환 참조 방지 검증 작동
- [x] 같은 보드 내 카드만 연결 가능
- [x] 실시간 UI 업데이트 (WebSocket)
- [x] 모든 테스트 통과
- [x] 플러그인 빌드 성공
- [x] 다국어(i18n) 지원 완료
