# Draft: Sub-Card (하위 카드) 기능 구현

## 요구사항 (확인됨)

### 핵심 기능
1. **하위 카드 생성**: 상위 카드에서 하위 카드를 생성
2. **속성 복제**: 생성 시 상위 카드의 `fields.properties`를 깊은 복사
3. **계층 구조**: `parent_id = parentCardId`로 설정 (콘텐츠 블록과 동일 패턴)
4. **하위 카드 조회**: 특정 카드의 하위 카드 목록 조회
5. **UI**: CardDetail에서 하위 카드 섹션 표시 및 생성 버튼

### API 설계 (사용자 제안)
```
POST /api/v2/boards/{boardID}/cards/{parentCardID}/subcards  - 하위 카드 생성
GET /api/v2/cards/{cardID}/subcards                          - 하위 카드 목록
GET /api/v2/cards/{cardID}/subcards/count                    - 하위 카드 개수
```

### 제약 조건
- 깊이 제한: 최대 3단계
- 삭제 시 캐스케이드 처리
- 기존 `GetCardsForBoard`에서 최상위 카드만 반환하도록 수정 (WHERE parent_id = board_id)

---

## 기술적 결정

### 1. 데이터 모델

**현재 상태:**
- Card는 Block으로 저장됨 (type: "card")
- `Card2Block()`: `ParentID = card.BoardID` (현재)
- `Block2Card()`: ParentID를 Card로 변환하지 않음

**변경 계획:**
- Card 구조체에 `ParentCardID` 필드 추가
- `Card2Block()` 수정: ParentCardID가 있으면 Block.ParentID = ParentCardID
- `Block2Card()` 수정: Block.ParentID가 boardID가 아니면 ParentCardID로 설정

### 2. 기존 코드 패턴 분석

**서버 (Go):**
- API Handler 패턴: `a.permissions.HasPermissionToBoard()` → `a.app.Method()` → JSON 응답
- App Layer: Card ↔ Block 변환, InsertBlocksAndNotify 사용
- Store: `GetBlocks(opts)` with QueryBlocksOptions (BoardID, ParentID, BlockType)
- Cascade Delete: `deleteBlockChildren()` 이미 parent_id 기반으로 동작

**프론트엔드 (TypeScript):**
- Card 타입: `Block & { fields: CardFields }`
- Redux: `cards: {[key: string]: Card}` 구조, createSelector 사용
- API Client: `octoClient` 사용, fetch + Client4.getOptions()
- CardDetail: 섹션별 컴포넌트 구성 (Properties, Attachments, Comments)

### 3. 깊이 제한 구현

- 최대 3단계 (부모 → 자식 → 손자)
- 하위 카드 생성 시 부모의 depth 확인
- depth 계산: 부모 체인 순회 또는 depth 필드 추가

**결정:** depth 필드 추가 방식 (성능상 유리)
- 최상위 카드: depth = 0
- 하위 카드 생성 시: depth = parentCard.depth + 1
- depth >= 3이면 하위 카드 생성 거부

### 4. 삭제 캐스케이드

**기존 패턴 활용:**
- `deleteBlockChildren(boardID, parentID, modifiedBy)` 함수 존재
- parent_id로 자식 블록 조회 후 일괄 삭제
- blocks_history에 기록 (soft delete)

**추가 구현 불필요:** 기존 패턴이 자동으로 sub-card 삭제 처리

---

## 파일 수정 목록

### 백엔드 (Go)

| 파일 | 수정 내용 |
|------|-----------|
| `server/model/card.go` | Card 구조체에 ParentCardID, Depth 필드 추가 |
| `server/model/card.go` | Card2Block, Block2Card 함수 수정 |
| `server/api/cards.go` | Sub-card API 엔드포인트 추가 |
| `server/api/api.go` | 라우트 등록 |
| `server/app/cards.go` | CreateSubCard, GetSubCards, GetSubCardCount 메서드 |
| `server/services/store/sqlstore/blocks.go` | 필요시 쿼리 최적화 |

### 프론트엔드 (TypeScript)

| 파일 | 수정 내용 |
|------|-----------|
| `webapp/src/blocks/card.ts` | CardFields에 parentCardId, depth 추가 |
| `webapp/src/store/cards.ts` | subCardsByParent 상태, 셀렉터 추가 |
| `webapp/src/octoClient.ts` | createSubCard, getSubCards API 메서드 |
| `webapp/src/mutator.ts` | createSubCard 뮤테이터 메서드 |
| `webapp/src/components/cardDetail/cardDetailSubCards.tsx` | 새 컴포넌트 |
| `webapp/src/components/cardDetail/cardDetail.tsx` | SubCards 섹션 추가 |
| `webapp/src/components/cardDetail/cardDetail.scss` | 스타일 추가 |

---

## 연구 결과

### 1. Card → Block 매핑 (from explore agent)
- 현재 `Card2Block()`: Card.BoardID → Block.ParentID
- Block.ParentID는 계층 구조에 사용됨 (views → board, content → card)
- Sub-card에서: Card.ParentCardID → Block.ParentID

### 2. Store 쿼리 패턴 (from explore agent)
- `getBlocks()`: opts.ParentID로 필터링 가능
- `getBlocksWithParentAndType(boardID, parentID, blockType)` 활용 가능
- 기존 인덱스: (board_id, parent_id) 복합 인덱스 존재

### 3. UI 패턴 (from explore agent)
- CardDetail: 섹션별 Fragment + hr로 구분
- Permission: `canEditBoardCards` 사용
- 새 섹션 추가 패턴: 별도 컴포넌트 → CardDetail에 import

### 4. Cascade Delete 패턴 (from explore agent)
- `deleteBlockAndChildren()`: 부모 삭제 시 자식 자동 삭제
- `deleteBlockChildren(boardID, parentID, modifiedBy)`: parent_id로 자식 조회 후 삭제
- Soft delete 방식: delete_at 타임스탬프 사용
- blocks_history 테이블에 감사 로그 기록
- 파일 첨부 자동 정리 (fileId, attachmentId)

### 5. Database 인덱스
- `(board_id, parent_id)` 복합 인덱스 존재 (migrations/000025)
- 쿼리 최적화에 적합: `WHERE board_id = ? AND parent_id = ?`

---

## 최종 결정사항

1. **속성 복제 범위**: ✅ 전체 깊은 복사 (모든 properties)
   - 담당자, 상태, 날짜 등 모든 값이 하위 카드에 복제됨

2. **하위 카드 표시 위치**: ✅ Properties 섹션 바로 아래
   - CardDetail 내 별도 SubCards 섹션으로 표시

3. **Kanban/Table 뷰 표시**: ✅ 최상위 카드만 표시
   - 하위 카드는 CardDetail에서만 접근
   - `GetCardsForBoard`에서 `WHERE parent_id = board_id` 조건 추가

---

## 테스트 전략

- **자동화 테스트**: 구현 후 테스트 (Tests-after)
- **Agent-Executed QA**: 필수 (Playwright for UI, curl for API)
- **테스트 범위**: 
  - Go: `*_test.go` 파일에 단위 테스트
  - TypeScript: `*.test.tsx` 파일에 컴포넌트 테스트

---

## 다음 단계

1. 열린 질문에 대한 사용자 확인
2. 테스트 전략 결정
3. Metis 검토 후 최종 계획 생성
