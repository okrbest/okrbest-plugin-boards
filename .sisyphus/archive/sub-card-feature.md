# Sub-Card (하위 카드) 기능 구현 계획

## TL;DR

> **Status**: ✅ **COMPLETED** (2026-02-03)
>
> **Quick Summary**: Notion 스타일의 하위 카드(Sub-Card) 기능을 구현합니다. 상위 카드에서 하위 카드를 생성하고, 속성을 복제하며, 계층 구조를 관리합니다.
> 
> **Deliverables**:
> - 백엔드: Card 모델 확장, 3개 API 엔드포인트, App/Store 레이어 메서드
> - 프론트엔드: Card 타입 확장, Redux 상태 관리, API 클라이언트, SubCards UI 컴포넌트
> - 테스트: 구현 후 Go/TypeScript 단위 테스트
> 
> **Estimated Effort**: Large (8-12 tasks, 2-3일)
> **Parallel Execution**: YES - 4 waves
> **Critical Path**: Task 1 → Task 3 → Task 5 → Task 8 → Task 10
>
> **Completion Summary**:
> - All 12 tasks completed
> - Go tests: 4 test functions, 12 test cases - PASS
> - TypeScript tests: 8 test cases - PASS
> - TypeScript type check - PASS
> - Go build - PASS

---

## Context

### Original Request
Notion 데이터베이스형 페이지의 하위 카드(Sub-Card) 생성 기능 구현. 상위 카드에서 하위 카드를 생성하고, 속성을 복제하며, 최대 3단계 깊이 제한을 적용.

### Interview Summary
**Key Discussions**:
- 속성 복제: 전체 깊은 복사 (모든 properties 복제)
- 뷰 표시: 최상위 카드만 Kanban/Table에 표시, 하위 카드는 CardDetail에서만 접근
- 테스트: 구현 후 테스트 (Tests-after 방식)

**Research Findings**:
- Card → Block 매핑: `Card2Block()`에서 `ParentID = BoardID` 설정 (수정 필요)
- 기존 인덱스: `(board_id, parent_id)` 복합 인덱스 존재 (쿼리 최적화에 적합)
- Cascade Delete: `deleteBlockChildren()` 함수가 parent_id 기반으로 자동 삭제 수행
- CardDetail 구조: 섹션별 컴포넌트 구성 (Properties, Attachments, Comments)

### 자체 갭 분석 (Metis 대체)
**확인된 갭 및 해결책**:
1. depth 필드 필요 → Card 모델에 추가
2. 최상위 카드 필터링 필요 → GetCardsForBoard에서 parent_id = board_id 조건 추가
3. WebSocket 브로드캐스트 → 기존 BroadcastBlockChange 활용 (추가 작업 불필요)
4. 권한 검증 → 기존 board-level 권한 사용 (부모 카드와 동일 보드)

---

## Work Objectives

### Core Objective
상위 카드에서 하위 카드를 생성하고, 속성을 복제하며, 계층 구조를 관리하는 기능을 구현합니다.

### Concrete Deliverables
- `POST /api/v2/boards/{boardID}/cards/{parentCardID}/subcards` 엔드포인트
- `GET /api/v2/cards/{cardID}/subcards` 엔드포인트
- `GET /api/v2/cards/{cardID}/subcards/count` 엔드포인트
- CardDetail 내 SubCards 섹션 UI
- 최대 3단계 깊이 제한 적용
- 부모 카드 삭제 시 자식 카드 캐스케이드 삭제

### Definition of Done
- [x] 하위 카드 생성 시 부모 속성이 깊은 복사됨
- [x] Kanban/Table 뷰에서 최상위 카드만 표시됨
- [x] CardDetail에서 하위 카드 목록이 표시됨
- [x] 깊이 3 이상에서 하위 카드 생성이 거부됨
- [x] 부모 카드 삭제 시 자식 카드도 삭제됨 (기존 deleteBlockChildren 활용)
- [x] 모든 API가 올바른 권한 검증을 수행함

### Must Have
- ParentCardID, Depth 필드가 Card 모델에 추가
- 속성 깊은 복사 로직
- 깊이 제한 검증 (최대 3단계)
- 최상위 카드만 반환하도록 GetCardsForBoard 수정
- CardDetail에 SubCards 섹션 UI

### Must NOT Have (Guardrails)
- DB 마이그레이션 파일 생성 금지 (parent_id 컬럼 이미 존재)
- Kanban/Table 뷰 수정 금지 (하위 카드 표시 기능 제외)
- 기존 카드 생성/수정 API 동작 변경 금지
- `as any`, `@ts-ignore` 타입 억제 금지
- 기존 코드 스타일/패턴 벗어남 금지

---

## Verification Strategy

> **UNIVERSAL RULE: ZERO HUMAN INTERVENTION**
>
> 모든 작업은 에이전트가 직접 검증합니다. 사람의 수동 테스트 불필요.

### Test Decision
- **Infrastructure exists**: YES (Go: go test, TypeScript: npm test)
- **Automated tests**: Tests-after (구현 후 테스트)
- **Framework**: Go test, Jest

### Agent-Executed QA Scenarios (MANDATORY)

**Verification Tool by Deliverable Type:**

| Type | Tool | How Agent Verifies |
|------|------|-------------------|
| **API Endpoints** | Bash (curl) | Send requests, assert status codes and response bodies |
| **Frontend UI** | Playwright | Navigate, interact, assert DOM, screenshot |
| **Business Logic** | Bash (go test) | Run unit tests, verify pass/fail |

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately):
├── Task 1: [Backend] Card 모델 수정 (ParentCardID, Depth 필드 추가)
└── Task 2: [Frontend] Card 타입 수정 (parentCardId, depth 필드 추가)

Wave 2 (After Wave 1):
├── Task 3: [Backend] App 레이어 - Sub-card 비즈니스 로직
├── Task 4: [Backend] GetCardsForBoard 수정 - 최상위 카드만 반환
└── Task 5: [Frontend] Redux Store - subCards 상태 및 셀렉터

Wave 3 (After Wave 2):
├── Task 6: [Backend] API 엔드포인트 추가
└── Task 7: [Frontend] OctoClient API 메서드 추가

Wave 4 (After Wave 3):
├── Task 8: [Frontend] Mutator 메서드 추가
└── Task 9: [Frontend] SubCards UI 컴포넌트 생성

Wave 5 (After Wave 4):
└── Task 10: [Frontend] CardDetail에 SubCards 섹션 통합

Wave 6 (After Wave 5):
├── Task 11: [Backend] Go 단위 테스트 작성
└── Task 12: [Frontend] TypeScript 컴포넌트 테스트 작성

Critical Path: Task 1 → Task 3 → Task 6 → Task 7 → Task 8 → Task 10
Parallel Speedup: ~50% faster than sequential
```

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
|------|------------|--------|---------------------|
| 1 | None | 3, 4 | 2 |
| 2 | None | 5, 8 | 1 |
| 3 | 1 | 6 | 4, 5 |
| 4 | 1 | 6 | 3, 5 |
| 5 | 2 | 8, 9 | 3, 4 |
| 6 | 3, 4 | 7 | None |
| 7 | 6 | 8 | None |
| 8 | 5, 7 | 9, 10 | None |
| 9 | 5, 8 | 10 | None |
| 10 | 9 | 11, 12 | None |
| 11 | 10 | None | 12 |
| 12 | 10 | None | 11 |

### Agent Dispatch Summary

| Wave | Tasks | Recommended Dispatch |
|------|-------|---------------------|
| 1 | 1, 2 | 2 parallel agents (backend + frontend) |
| 2 | 3, 4, 5 | 2-3 parallel agents |
| 3 | 6, 7 | Sequential (API depends on backend) |
| 4 | 8, 9 | 2 parallel agents |
| 5 | 10 | 1 agent (integration) |
| 6 | 11, 12 | 2 parallel agents (tests) |

---

## TODOs

### Task 1: [Backend] Card 모델 수정

**What to do**:
- Card 구조체에 `ParentCardID`, `Depth` 필드 추가
- `Card2Block()` 함수 수정: ParentCardID가 있으면 Block.ParentID = ParentCardID
- `Card2Block()` 함수 수정: Depth를 Block.Fields["depth"]에 저장
- `Block2Card()` 함수 수정: Block.ParentID가 BoardID와 다르면 ParentCardID로 설정
- `Block2Card()` 함수 수정: Block.Fields["depth"]에서 Depth 값 추출
- `CheckValid()` 메서드에 Depth 검증 추가 (0-2 범위)
- `Populate()` 메서드에 기본값 설정

**Must NOT do**:
- DB 마이그레이션 파일 생성 (parent_id 컬럼 이미 존재)
- 기존 Card 필드 변경

**Recommended Agent Profile**:
- **Category**: `ultrabrain`
  - Reason: Go 모델 변환 로직은 정확한 타입 처리와 조건부 로직 필요
- **Skills**: []
  - Go 기본 지식으로 충분

**Parallelization**:
- **Can Run In Parallel**: YES
- **Parallel Group**: Wave 1 (with Task 2)
- **Blocks**: Tasks 3, 4
- **Blocked By**: None (can start immediately)

**References**:
- `server/model/card.go:42-90` - Card 구조체 정의, 필드 추가 위치
- `server/model/card.go:196-218` - Card2Block 함수, ParentID 설정 로직
- `server/model/card.go:221-290` - Block2Card 함수, ParentID 추출 로직
- `server/model/card.go:118-138` - CheckValid 함수, 검증 로직 추가 위치
- `server/model/block.go:54-80` - Block 구조체, ParentID 필드 참조

**Acceptance Criteria**:

- [x] Card 구조체에 ParentCardID string 필드 추가됨
- [x] Card 구조체에 Depth int 필드 추가됨 (0 = 최상위)
- [x] Card2Block(): ParentCardID가 비어있으면 ParentID = BoardID, 아니면 ParentID = ParentCardID
- [x] Block2Card(): Block.ParentID != Block.BoardID이면 ParentCardID = Block.ParentID
- [x] CheckValid(): Depth가 0-2 범위인지 검증 (3 이상이면 에러)

**Agent-Executed QA Scenarios**:

```
Scenario: Card2Block converts sub-card correctly
  Tool: Bash (go test)
  Preconditions: Test file exists
  Steps:
    1. Create Card with ParentCardID = "parent-123", BoardID = "board-456"
    2. Call Card2Block()
    3. Assert: Block.ParentID == "parent-123" (not "board-456")
    4. Assert: Block.BoardID == "board-456"
  Expected Result: ParentID correctly set to parent card ID
  Evidence: go test output

Scenario: Block2Card extracts ParentCardID from sub-card block
  Tool: Bash (go test)
  Preconditions: Test file exists
  Steps:
    1. Create Block with ParentID = "parent-123", BoardID = "board-456"
    2. Call Block2Card()
    3. Assert: Card.ParentCardID == "parent-123"
    4. Assert: Card.BoardID == "board-456"
  Expected Result: ParentCardID correctly extracted
  Evidence: go test output

Scenario: CheckValid rejects depth >= 3
  Tool: Bash (go test)
  Preconditions: Test file exists
  Steps:
    1. Create Card with Depth = 3
    2. Call CheckValid()
    3. Assert: error returned with message containing "depth"
  Expected Result: Validation fails for depth >= 3
  Evidence: go test output
```

**Commit**: YES
- Message: `feat(model): add ParentCardID and Depth fields to Card model`
- Files: `server/model/card.go`
- Pre-commit: `cd server && go build ./...`

---

### Task 2: [Frontend] Card 타입 수정

**What to do**:
- `CardFields` 타입에 `parentCardId`, `depth` 필드 추가
- `createCard()` 함수에서 새 필드 초기화

**Must NOT do**:
- 기존 필드 타입 변경
- `as any` 타입 억제 사용

**Recommended Agent Profile**:
- **Category**: `quick`
  - Reason: 단순 타입 필드 추가, 복잡한 로직 없음
- **Skills**: []

**Parallelization**:
- **Can Run In Parallel**: YES
- **Parallel Group**: Wave 1 (with Task 1)
- **Blocks**: Tasks 5, 8
- **Blocked By**: None (can start immediately)

**References**:
- `webapp/src/blocks/card.ts:7-12` - CardFields 타입 정의
- `webapp/src/blocks/card.ts:18-42` - createCard 함수
- `webapp/src/blocks/block.ts` - Block 베이스 타입 참조

**Acceptance Criteria**:

- [x] CardFields 타입에 `parentCardId?: string` 필드 추가됨
- [x] CardFields 타입에 `depth?: number` 필드 추가됨
- [x] createCard() 함수에서 parentCardId와 depth 초기화됨
- [x] `npm run check-types` 통과

**Agent-Executed QA Scenarios**:

```
Scenario: TypeScript type check passes
  Tool: Bash
  Preconditions: webapp directory exists
  Steps:
    1. cd webapp
    2. npm run check-types
    3. Assert: exit code 0
  Expected Result: No type errors
  Evidence: Command output
```

**Commit**: YES
- Message: `feat(webapp): add parentCardId and depth to Card type`
- Files: `webapp/src/blocks/card.ts`
- Pre-commit: `cd webapp && npm run check-types`

---

### Task 3: [Backend] App 레이어 - Sub-card 비즈니스 로직

**What to do**:
- `CreateSubCard()` 메서드: 하위 카드 생성, 속성 깊은 복사, depth 검증
- `GetSubCards()` 메서드: 특정 카드의 하위 카드 목록 조회
- `GetSubCardCount()` 메서드: 하위 카드 개수 조회
- `deepCopyProperties()` 헬퍼 함수: properties map 깊은 복사
- **[추가] 캐스케이드 삭제 검증**: 기존 `DeleteBlock`이 `deleteBlockChildren`을 호출하여 parent_id 기반 자식 삭제를 수행하는지 확인. 별도 구현 불필요 시 문서화만 진행.

**Must NOT do**:
- 기존 CreateCard 함수 수정 (별도 함수로 분리)
- Store 레이어 직접 호출 (InsertBlocksAndNotify 사용)

**Recommended Agent Profile**:
- **Category**: `ultrabrain`
  - Reason: 비즈니스 로직, 깊은 복사, depth 검증 등 복잡한 로직 필요
- **Skills**: []

**Parallelization**:
- **Can Run In Parallel**: YES
- **Parallel Group**: Wave 2 (with Tasks 4, 5)
- **Blocks**: Task 6
- **Blocked By**: Task 1

**References**:
- `server/app/cards.go:13-38` - CreateCard 함수 패턴 참조
- `server/app/cards.go:40-63` - GetCardsForBoard 함수 패턴 참조
- `server/app/cards.go:84-96` - GetCardByID 함수 패턴 참조
- `server/model/card.go:196-218` - Card2Block 변환 패턴

**Acceptance Criteria**:

- [x] CreateSubCard(parentCardID, card, boardID, userID, disableNotify) 메서드 구현됨
- [x] GetSubCards(cardID, page, perPage) 메서드 구현됨
- [x] GetSubCardCount(cardID) 메서드 구현됨
- [x] CreateSubCard에서 부모 카드 존재 여부 검증함
- [x] CreateSubCard에서 부모 depth + 1 계산하여 설정
- [x] CreateSubCard에서 depth >= 3이면 에러 반환
- [x] CreateSubCard에서 properties 깊은 복사 수행
- [x] `go build ./...` 통과

**Agent-Executed QA Scenarios**:

```
Scenario: CreateSubCard copies properties deeply
  Tool: Bash (go test)
  Preconditions: Test file and mock store exist
  Steps:
    1. Create parent card with properties: {"status": "done", "assignee": ["user-1"]}
    2. Call CreateSubCard with empty card
    3. Assert: sub-card.Properties["status"] == "done"
    4. Assert: sub-card.Properties["assignee"] == ["user-1"]
    5. Modify original parent properties
    6. Assert: sub-card properties unchanged (deep copy verified)
  Expected Result: Properties are deep copied, not referenced
  Evidence: go test output

Scenario: CreateSubCard rejects depth >= 3
  Tool: Bash (go test)
  Preconditions: Parent card with depth=2 exists
  Steps:
    1. Get parent card with depth=2
    2. Call CreateSubCard
    3. Assert: error returned
    4. Assert: error message contains "maximum depth"
  Expected Result: Sub-card creation rejected at depth 3
  Evidence: go test output

Scenario: GetSubCards returns only direct children
  Tool: Bash (go test)
  Preconditions: Parent card with 2 sub-cards exists
  Steps:
    1. Create parent card
    2. Create 2 sub-cards under parent
    3. Create 1 sub-sub-card under first sub-card
    4. Call GetSubCards(parentID)
    5. Assert: result count == 2 (direct children only)
  Expected Result: Only direct children returned
  Evidence: go test output
```

**Commit**: YES
- Message: `feat(app): add CreateSubCard, GetSubCards, GetSubCardCount methods`
- Files: `server/app/cards.go`
- Pre-commit: `cd server && go build ./...`

---

### Task 4: [Backend] GetCardsForBoard 수정 - 최상위 카드만 반환

**What to do**:
- `GetCardsForBoard()` 함수 수정
- QueryBlocksOptions에 조건 추가: parent_id = board_id (최상위 카드만)
- Store의 `getBlocks` 쿼리에서 parent_id 필터링 활용

**Must NOT do**:
- Store 인터페이스 변경 (기존 메서드 활용)
- 새 SQL 쿼리 직접 작성 (Squirrel 빌더 사용)

**Recommended Agent Profile**:
- **Category**: `quick`
  - Reason: 기존 쿼리 옵션 수정, 단순 조건 추가
- **Skills**: []

**Parallelization**:
- **Can Run In Parallel**: YES
- **Parallel Group**: Wave 2 (with Tasks 3, 5)
- **Blocks**: Task 6
- **Blocked By**: Task 1

**References**:
- `server/app/cards.go:40-63` - GetCardsForBoard 현재 구현
- `server/model/block.go:QueryBlocksOptions` - 쿼리 옵션 구조체
- `server/services/store/sqlstore/blocks.go:59-93` - getBlocks 쿼리, ParentID 필터링

**Acceptance Criteria**:

- [x] GetCardsForBoard에서 parent_id = board_id 조건 추가됨
- [x] 하위 카드가 결과에서 제외됨
- [x] 기존 API 응답 형식 유지됨
- [x] `go build ./...` 통과

**Agent-Executed QA Scenarios**:

```
Scenario: GetCardsForBoard excludes sub-cards
  Tool: Bash (go test)
  Preconditions: Board with 2 top-level cards and 1 sub-card exists
  Steps:
    1. Create board
    2. Create 2 cards with parent_id = board_id
    3. Create 1 sub-card with parent_id = card_id
    4. Call GetCardsForBoard(boardID)
    5. Assert: result count == 2 (sub-card excluded)
  Expected Result: Only top-level cards returned
  Evidence: go test output
```

**Commit**: YES (groups with Task 3)
- Message: `feat(app): filter GetCardsForBoard to return only top-level cards`
- Files: `server/app/cards.go`
- Pre-commit: `cd server && go build ./...`

---

### Task 5: [Frontend] Redux Store - subCards 상태 및 셀렉터

**What to do**:
- `CardsState`에 `subCardsByParent: {[parentId: string]: string[]}` 추가 (ID만 저장, 정규화)
- `addSubCard`, `updateSubCards`, `removeSubCard` 액션 추가
- `getSubCards(parentCardId)` 셀렉터 추가: ID 배열에서 Card 객체 배열로 변환
- `getSubCardCount(parentCardId)` 셀렉터 추가
- 기존 `loadBoardData` extraReducer에서 sub-cards 분리 로직 추가: `parentId !== boardId`인 카드는 subCardsByParent에 저장
- **[추가] WebSocket 이벤트 처리**: `updateCards` 액션에서 sub-card 판별 로직 추가. `card.fields.parentCardId` 존재 시 subCardsByParent 업데이트

**Must NOT do**:
- 기존 cards 상태 구조 변경
- 타입 억제 사용
- subCardsByParent에 Card 객체 직접 저장 (중복 방지)

**Recommended Agent Profile**:
- **Category**: `ultrabrain`
  - Reason: Redux 상태 설계, createSelector 사용, 복잡한 셀렉터 로직
- **Skills**: []

**Parallelization**:
- **Can Run In Parallel**: YES
- **Parallel Group**: Wave 2 (with Tasks 3, 4)
- **Blocks**: Tasks 8, 9
- **Blocked By**: Task 2

**References**:
- `webapp/src/store/cards.ts:30-37` - CardsState 타입 정의
- `webapp/src/store/cards.ts:74-156` - cardsSlice 정의, reducers
- `webapp/src/store/cards.ts:165-185` - getCards, getCard 셀렉터 패턴
- `webapp/src/store/cards.ts:187-201` - getCurrentBoardCards 셀렉터 패턴

**Acceptance Criteria**:

- [x] CardsState에 subCardsByParent: {[parentId: string]: string[]} 필드 추가됨
- [x] addSubCard 액션: 특정 부모의 sub-cards ID 배열에 카드 ID 추가
- [x] updateSubCards 액션: 특정 부모의 sub-cards ID 배열 업데이트
- [x] removeSubCard 액션: 특정 부모의 sub-cards에서 카드 ID 제거
- [x] getSubCards(parentId) 셀렉터: ID 배열에서 Card 객체 배열로 변환하여 반환
- [x] getSubCardCount(parentId) 셀렉터: 하위 카드 개수 반환
- [x] loadBoardData extraReducer에서 sub-cards를 cards에서 분리하여 subCardsByParent에 저장
- [x] updateCards 액션에서 sub-card 판별 후 subCardsByParent 업데이트 (WebSocket 연동)
- [x] `npm run check-types` 통과

**Agent-Executed QA Scenarios**:

```
Scenario: TypeScript type check passes
  Tool: Bash
  Preconditions: webapp directory exists
  Steps:
    1. cd webapp
    2. npm run check-types
    3. Assert: exit code 0
  Expected Result: No type errors
  Evidence: Command output
```

**Commit**: YES
- Message: `feat(store): add subCardsByParent state and selectors`
- Files: `webapp/src/store/cards.ts`
- Pre-commit: `cd webapp && npm run check-types`

---

### Task 6: [Backend] API 엔드포인트 추가

**What to do**:
- `handleCreateSubCard`: POST /boards/{boardID}/cards/{parentCardID}/subcards
- `handleGetSubCards`: GET /cards/{cardID}/subcards
- `handleGetSubCardCount`: GET /cards/{cardID}/subcards/count
- 라우트 등록 in `registerCardsRoutes()`
- 권한 검증: `PermissionManageBoardCards`

**Must NOT do**:
- 기존 카드 엔드포인트 수정
- 새 권한 타입 추가 (기존 board-level 권한 사용)

**Recommended Agent Profile**:
- **Category**: `ultrabrain`
  - Reason: HTTP 핸들러, 권한 검증, 에러 처리, 감사 로깅 등 복잡한 패턴
- **Skills**: []

**Parallelization**:
- **Can Run In Parallel**: NO
- **Parallel Group**: Wave 3 (sequential)
- **Blocks**: Task 7
- **Blocked By**: Tasks 3, 4

**References**:
- `server/api/cards.go:25-31` - registerCardsRoutes, 라우트 등록 패턴
- `server/api/cards.go:33-131` - handleCreateCard, 생성 핸들러 패턴
- `server/api/cards.go:133-231` - handleGetCards, 조회 핸들러 패턴
- `server/api/cards.go:330-392` - handleGetCard, 단일 조회 패턴

**Acceptance Criteria**:

- [x] POST /boards/{boardID}/cards/{parentCardID}/subcards 엔드포인트 구현됨
- [x] GET /cards/{cardID}/subcards 엔드포인트 구현됨
- [x] GET /cards/{cardID}/subcards/count 엔드포인트 구현됨
- [x] 모든 엔드포인트에 세션 인증 (sessionRequired) 적용됨
- [x] 모든 엔드포인트에 권한 검증 (PermissionManageBoardCards) 적용됨
- [x] 모든 엔드포인트에 감사 로깅 적용됨
- [x] 에러 응답이 기존 패턴 (model.NewErr*) 따름
- [x] `go build ./...` 통과

**Agent-Executed QA Scenarios**:

```
Scenario: Create sub-card API returns 200 with new card
  Tool: Bash (curl)
  Preconditions: Server running, authenticated session, parent card exists
  Steps:
    1. curl -X POST http://localhost:8065/plugins/focalboard/api/v2/boards/{boardID}/cards/{parentCardID}/subcards \
         -H "Authorization: Bearer {token}" \
         -H "Content-Type: application/json" \
         -d '{"title": "Sub-card 1"}'
    2. Assert: HTTP status 200
    3. Assert: response.parentCardId == parentCardID
    4. Assert: response.depth == parent.depth + 1
    5. Assert: response.properties contains parent's properties
  Expected Result: Sub-card created with correct hierarchy
  Evidence: curl response body

Scenario: Get sub-cards API returns children only
  Tool: Bash (curl)
  Preconditions: Parent card with 2 sub-cards exists
  Steps:
    1. curl -X GET http://localhost:8065/plugins/focalboard/api/v2/cards/{cardID}/subcards \
         -H "Authorization: Bearer {token}"
    2. Assert: HTTP status 200
    3. Assert: response is array with length 2
    4. Assert: all items have parentCardId == cardID
  Expected Result: Only direct sub-cards returned
  Evidence: curl response body

Scenario: Create sub-card at depth 3 returns 400
  Tool: Bash (curl)
  Preconditions: Card at depth 2 exists
  Steps:
    1. curl -X POST http://localhost:8065/plugins/focalboard/api/v2/boards/{boardID}/cards/{depth2CardID}/subcards \
         -H "Authorization: Bearer {token}" \
         -H "Content-Type: application/json" \
         -d '{"title": "Too deep"}'
    2. Assert: HTTP status 400
    3. Assert: response.error contains "depth" or "maximum"
  Expected Result: Request rejected due to depth limit
  Evidence: curl response body

Scenario: Create sub-card without permission returns 403
  Tool: Bash (curl)
  Preconditions: User without ManageBoardCards permission
  Steps:
    1. curl -X POST .../subcards with viewer-only token
    2. Assert: HTTP status 403
  Expected Result: Permission denied
  Evidence: curl response body
```

**Commit**: YES
- Message: `feat(api): add sub-card endpoints (create, list, count)`
- Files: `server/api/cards.go`, `server/api/api.go`
- Pre-commit: `cd server && go build ./...`

---

### Task 7: [Frontend] OctoClient API 메서드 추가

**What to do**:
- `createSubCard(boardId, parentCardId, card)` 메서드 추가
- `getSubCards(cardId, page?, perPage?)` 메서드 추가
- `getSubCardCount(cardId)` 메서드 추가

**Must NOT do**:
- 기존 API 메서드 수정
- 직접 fetch 대신 getJson 패턴 사용 안 함

**Recommended Agent Profile**:
- **Category**: `quick`
  - Reason: 기존 API 패턴 복제, 단순 HTTP 호출
- **Skills**: []

**Parallelization**:
- **Can Run In Parallel**: NO
- **Parallel Group**: Wave 3 (after Task 6)
- **Blocks**: Task 8
- **Blocked By**: Task 6

**References**:
- `webapp/src/octoClient.ts:28-60` - OctoClient 클래스 구조
- `webapp/src/octoClient.ts:143-150` - headers() 메서드
- `webapp/src/octoClient.ts:61-69` - getJson 메서드 패턴
- `webapp/src/octoClient.ts:1349-1360` - API 메서드 패턴 예시

**Acceptance Criteria**:

- [x] createSubCard(boardId, parentCardId, card) 메서드 구현됨
- [x] getSubCards(cardId, page?, perPage?) 메서드 구현됨
- [x] getSubCardCount(cardId) 메서드 구현됨
- [x] 모든 메서드가 기존 headers() 사용
- [x] 모든 메서드가 getJson() 패턴 사용
- [x] `npm run check-types` 통과

**Agent-Executed QA Scenarios**:

```
Scenario: TypeScript type check passes
  Tool: Bash
  Preconditions: webapp directory exists
  Steps:
    1. cd webapp
    2. npm run check-types
    3. Assert: exit code 0
  Expected Result: No type errors
  Evidence: Command output
```

**Commit**: YES
- Message: `feat(client): add createSubCard, getSubCards, getSubCardCount API methods`
- Files: `webapp/src/octoClient.ts`
- Pre-commit: `cd webapp && npm run check-types`

---

### Task 8: [Frontend] Mutator 메서드 추가

**What to do**:
- `createSubCard(parentCard, title)` 뮤테이터 메서드 추가
- Redux store 업데이트 (addSubCard 액션 디스패치)
- Undo 지원 구현

**Must NOT do**:
- 기존 뮤테이터 메서드 수정
- 직접 API 호출 (octoClient 사용)

**Recommended Agent Profile**:
- **Category**: `ultrabrain`
  - Reason: Optimistic update, undo 지원, Redux 연동
- **Skills**: []

**Parallelization**:
- **Can Run In Parallel**: NO
- **Parallel Group**: Wave 4
- **Blocks**: Tasks 9, 10
- **Blocked By**: Tasks 5, 7

**References**:
- `webapp/src/mutator.ts:29` - updateCards import
- `webapp/src/mutator.ts:1115-1150` - duplicateCard 패턴 참조
- `webapp/src/mutator.ts:355-380` - changeCardContentOrder undo 패턴

**Acceptance Criteria**:

- [x] createSubCard(parentCard, title) 메서드 구현됨
- [x] octoClient.createSubCard 호출됨
- [x] 성공 시 addSubCard 액션 디스패치됨
- [x] Undo 지원 (undoManager 사용)
- [x] `npm run check-types` 통과

**Agent-Executed QA Scenarios**:

```
Scenario: TypeScript type check passes
  Tool: Bash
  Preconditions: webapp directory exists
  Steps:
    1. cd webapp
    2. npm run check-types
    3. Assert: exit code 0
  Expected Result: No type errors
  Evidence: Command output
```

**Commit**: YES
- Message: `feat(mutator): add createSubCard method with undo support`
- Files: `webapp/src/mutator.ts`
- Pre-commit: `cd webapp && npm run check-types`

---

### Task 9: [Frontend] SubCards UI 컴포넌트 생성

**What to do**:
- `cardDetailSubCards.tsx` 컴포넌트 생성
- 하위 카드 목록 표시 (제목, 아이콘)
- "하위 카드 추가" 버튼
- 하위 카드 클릭 시 해당 카드 열기
- SCSS 스타일 파일 생성

**Must NOT do**:
- 인라인 스타일 사용
- 클래스 컴포넌트 사용
- 타입 억제 사용

**Recommended Agent Profile**:
- **Category**: `visual-engineering`
  - Reason: React UI 컴포넌트, SCSS 스타일링
- **Skills**: [`frontend-ui-ux`]
  - frontend-ui-ux: UI 컴포넌트 설계 및 스타일링

**Parallelization**:
- **Can Run In Parallel**: YES
- **Parallel Group**: Wave 4 (with Task 8)
- **Blocks**: Task 10
- **Blocked By**: Tasks 5, 8

**References**:
- `webapp/src/components/cardDetail/cardDetailProperties.tsx` - 섹션 컴포넌트 패턴
- `webapp/src/components/cardDetail/commentsList.tsx` - 목록 컴포넌트 패턴
- `webapp/src/components/cardDetail/attachment.tsx` - 간단한 목록 컴포넌트 패턴
- `webapp/src/components/cardDetail/cardDetail.scss` - 스타일 패턴

**Acceptance Criteria**:

- [x] cardDetailSubCards.tsx 파일 생성됨 (subCards.tsx로 생성)
- [x] cardDetailSubCards.scss 파일 생성됨 (subCards.scss로 생성)
- [x] 함수형 컴포넌트 + hooks 사용
- [x] useAppSelector로 getSubCards 셀렉터 사용
- [x] 하위 카드 목록 렌더링 (제목, 아이콘)
- [x] "하위 카드 추가" 버튼 (권한 체크 포함)
- [x] 하위 카드 클릭 핸들러 (onCardClick prop 또는 라우팅)
- [x] depth 표시 (선택적)
- [x] BEM 네이밍 사용
- [x] `npm run check-types` 통과

**Agent-Executed QA Scenarios**:

```
Scenario: SubCards component renders sub-card list
  Tool: Playwright (playwright skill)
  Preconditions: Dev server running, card with 2 sub-cards exists
  Steps:
    1. Navigate to card detail page
    2. Wait for .CardDetailSubCards visible (timeout: 10s)
    3. Assert: .CardDetailSubCards__item count == 2
    4. Assert: each item shows title
    5. Screenshot: .sisyphus/evidence/task-9-subcards-list.png
  Expected Result: Sub-cards displayed correctly
  Evidence: .sisyphus/evidence/task-9-subcards-list.png

Scenario: Add sub-card button opens dialog
  Tool: Playwright (playwright skill)
  Preconditions: Dev server running, user has ManageBoardCards permission
  Steps:
    1. Navigate to card detail page
    2. Click .CardDetailSubCards__add-button
    3. Wait for input or dialog visible
    4. Screenshot: .sisyphus/evidence/task-9-add-subcard.png
  Expected Result: Add sub-card UI appears
  Evidence: .sisyphus/evidence/task-9-add-subcard.png
```

**Commit**: YES
- Message: `feat(ui): add CardDetailSubCards component`
- Files: `webapp/src/components/cardDetail/cardDetailSubCards.tsx`, `webapp/src/components/cardDetail/cardDetailSubCards.scss`
- Pre-commit: `cd webapp && npm run check-types`

---

### Task 10: [Frontend] CardDetail에 SubCards 섹션 통합

**What to do**:
- CardDetail.tsx에 CardDetailSubCards 컴포넌트 import
- Properties 섹션 아래에 SubCards 섹션 추가
- limited 카드에서는 섹션 숨김
- 권한 체크 전달

**Must NOT do**:
- CardDetail 기존 로직 변경
- 다른 섹션 순서 변경

**Recommended Agent Profile**:
- **Category**: `quick`
  - Reason: 단순 컴포넌트 통합, import 추가
- **Skills**: []

**Parallelization**:
- **Can Run In Parallel**: NO
- **Parallel Group**: Wave 5
- **Blocks**: Tasks 11, 12
- **Blocked By**: Task 9

**References**:
- `webapp/src/components/cardDetail/cardDetail.tsx:32-35` - import 섹션
- `webapp/src/components/cardDetail/cardDetail.tsx:195-206` - CardDetailProperties 섹션
- `webapp/src/components/cardDetail/cardDetail.tsx:207-214` - AttachmentList 섹션 패턴

**Acceptance Criteria**:

- [x] CardDetailSubCards import 추가됨
- [x] SubCards 섹션이 Properties 바로 아래에 배치됨
- [x] limited 카드에서 SubCards 섹션 숨겨짐
- [x] 필요한 props (card, board, readonly) 전달됨
- [x] `npm run check-types` 통과

**Agent-Executed QA Scenarios**:

```
Scenario: SubCards section visible in CardDetail
  Tool: Playwright (playwright skill)
  Preconditions: Dev server running, card exists
  Steps:
    1. Navigate to /boards/{boardId}/{viewId}/{cardId}
    2. Wait for .CardDetail visible (timeout: 10s)
    3. Assert: .CardDetailSubCards visible
    4. Assert: .CardDetailSubCards appears after .CardDetailProperties
    5. Screenshot: .sisyphus/evidence/task-10-integration.png
  Expected Result: SubCards section integrated correctly
  Evidence: .sisyphus/evidence/task-10-integration.png

Scenario: SubCards section hidden for limited cards
  Tool: Playwright (playwright skill)
  Preconditions: Limited (hidden) card exists
  Steps:
    1. Navigate to limited card detail
    2. Wait for .CardDetail--is-limited visible
    3. Assert: .CardDetailSubCards NOT visible
    4. Screenshot: .sisyphus/evidence/task-10-limited.png
  Expected Result: SubCards hidden for limited cards
  Evidence: .sisyphus/evidence/task-10-limited.png
```

**Commit**: YES
- Message: `feat(cardDetail): integrate SubCards section`
- Files: `webapp/src/components/cardDetail/cardDetail.tsx`
- Pre-commit: `cd webapp && npm run check-types`

---

### Task 11: [Backend] Go 단위 테스트 작성

**What to do**:
- `server/model/card_test.go`에 Card2Block, Block2Card 테스트 추가
- `server/app/cards_test.go`에 CreateSubCard, GetSubCards 테스트 추가
- Mock store 사용

**Must NOT do**:
- 실제 DB 사용 (mock 사용)
- 기존 테스트 수정

**Recommended Agent Profile**:
- **Category**: `ultrabrain`
  - Reason: Go 테스트 패턴, mock 사용, 에지 케이스 커버리지
- **Skills**: []

**Parallelization**:
- **Can Run In Parallel**: YES
- **Parallel Group**: Wave 6 (with Task 12)
- **Blocks**: None
- **Blocked By**: Task 10

**References**:
- `server/model/block_test.go` - 모델 테스트 패턴
- `server/app/blocks_test.go` - App 레이어 테스트 패턴
- `server/services/store/mockstore/` - Mock store 사용 패턴

**Acceptance Criteria**:

- [x] Card2Block 테스트: ParentCardID 변환 검증
- [x] Block2Card 테스트: ParentCardID 추출 검증
- [x] CheckValid 테스트: depth 검증 (0, 1, 2 통과, 3 실패)
- [x] CreateSubCard 테스트: 속성 복사, depth 증가, depth 제한
- [x] GetSubCards 테스트: 직접 자식만 반환
- [x] `go test ./server/model/... ./server/app/...` 통과

**Agent-Executed QA Scenarios**:

```
Scenario: All Go tests pass
  Tool: Bash
  Preconditions: Test files exist
  Steps:
    1. cd server
    2. go test -v ./model/... ./app/... -run SubCard
    3. Assert: exit code 0
    4. Assert: output contains "PASS"
  Expected Result: All tests pass
  Evidence: go test output
```

**Commit**: YES
- Message: `test(server): add unit tests for sub-card functionality`
- Files: `server/model/card_test.go`, `server/app/cards_test.go`
- Pre-commit: `cd server && go test ./model/... ./app/...`

---

### Task 12: [Frontend] TypeScript 컴포넌트 테스트 작성

**What to do**:
- `cardDetailSubCards.test.tsx` 테스트 파일 생성
- 렌더링 테스트, 버튼 클릭 테스트
- Redux store mock 사용

**Must NOT do**:
- 기존 테스트 수정
- snapshot 테스트만 작성 (행위 테스트 포함)

**Recommended Agent Profile**:
- **Category**: `ultrabrain`
  - Reason: Jest 테스트, Redux mock, React Testing Library
- **Skills**: []

**Parallelization**:
- **Can Run In Parallel**: YES
- **Parallel Group**: Wave 6 (with Task 11)
- **Blocks**: None
- **Blocked By**: Task 10

**References**:
- `webapp/src/components/cardDetail/cardDetail.test.tsx` - 컴포넌트 테스트 패턴
- `webapp/src/components/cardDetail/commentsList.test.tsx` - 목록 컴포넌트 테스트
- `webapp/src/testUtils.tsx` - 테스트 유틸리티 (mockStore 등)

**Acceptance Criteria**:

- [x] cardDetailSubCards.test.tsx 파일 생성됨 (subCards.test.tsx로 생성)
- [x] 렌더링 테스트: 하위 카드 목록 표시
- [x] 버튼 테스트: 추가 버튼 클릭 핸들러 호출
- [x] 권한 테스트: readonly일 때 버튼 숨김
- [x] `npm test -- cardDetailSubCards` 통과

**Agent-Executed QA Scenarios**:

```
Scenario: All component tests pass
  Tool: Bash
  Preconditions: Test file exists
  Steps:
    1. cd webapp
    2. npm test -- --testPathPattern=cardDetailSubCards --passWithNoTests
    3. Assert: exit code 0
  Expected Result: All tests pass
  Evidence: npm test output
```

**Commit**: YES
- Message: `test(webapp): add CardDetailSubCards component tests`
- Files: `webapp/src/components/cardDetail/cardDetailSubCards.test.tsx`
- Pre-commit: `cd webapp && npm test -- --testPathPattern=cardDetailSubCards --passWithNoTests`

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 1 | `feat(model): add ParentCardID and Depth fields to Card model` | server/model/card.go | `go build ./...` |
| 2 | `feat(webapp): add parentCardId and depth to Card type` | webapp/src/blocks/card.ts | `npm run check-types` |
| 3, 4 | `feat(app): add sub-card business logic and filter top-level cards` | server/app/cards.go | `go build ./...` |
| 5 | `feat(store): add subCardsByParent state and selectors` | webapp/src/store/cards.ts | `npm run check-types` |
| 6 | `feat(api): add sub-card endpoints` | server/api/cards.go, server/api/api.go | `go build ./...` |
| 7 | `feat(client): add sub-card API methods` | webapp/src/octoClient.ts | `npm run check-types` |
| 8 | `feat(mutator): add createSubCard method` | webapp/src/mutator.ts | `npm run check-types` |
| 9 | `feat(ui): add CardDetailSubCards component` | webapp/src/components/cardDetail/cardDetailSubCards.* | `npm run check-types` |
| 10 | `feat(cardDetail): integrate SubCards section` | webapp/src/components/cardDetail/cardDetail.tsx | `npm run check-types` |
| 11 | `test(server): add sub-card unit tests` | server/model/card_test.go, server/app/cards_test.go | `go test ./...` |
| 12 | `test(webapp): add SubCards component tests` | webapp/src/components/cardDetail/cardDetailSubCards.test.tsx | `npm test` |

---

## Success Criteria

### Verification Commands
```bash
# Backend build
cd server && go build ./...

# Backend tests
cd server && go test ./model/... ./app/... -v

# Frontend type check
cd webapp && npm run check-types

# Frontend tests
cd webapp && npm test

# Full build
MM_DEBUG=true make dist
```

### Final Checklist
- [x] 하위 카드 생성 API 정상 동작
- [x] 하위 카드 목록 조회 API 정상 동작
- [x] 속성 깊은 복사 검증됨
- [x] 깊이 제한 (3단계) 적용됨
- [x] Kanban/Table에서 최상위 카드만 표시됨
- [x] CardDetail에서 SubCards 섹션 표시됨
- [x] 부모 카드 삭제 시 자식 카드 삭제됨 (기존 deleteBlockChildren 활용)
- [x] 모든 테스트 통과
- [x] 타입 에러 없음
- [x] 빌드 성공
