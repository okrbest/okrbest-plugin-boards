# Draft: Sub-task에 기존 카드 연결(Link) 기능

## Requirements (confirmed)

### 핵심 기능
- 하위 작업(Sub-tasks)에 기존 카드를 연결(Link)할 수 있는 기능
- Notion 스타일: "+ 새 페이지 추가하기" 옆에 "↗ 기존 항목 연결" 버튼
- 카드 선택 모달/드롭다운에서 검색 후 연결

### 기술적 제약사항 (confirmed)
1. **깊이 제한**: 최대 3단계 (depth 0, 1, 2) - MaxCardDepth=2
2. **같은 보드 내 카드만 연결 가능**
3. **순환 참조 방지**: A→B→C일 때 C를 A의 부모로 설정 불가
4. **연결 해제(Unlink)**: 필요

### 요청 범위
1. Backend API 설계 및 구현
2. Frontend UI 컴포넌트 (카드 선택 모달/드롭다운)
3. 연결 해제(Unlink) 기능
4. 테스트 코드 (선택 확인 필요)
5. 기존 코드 스타일 및 패턴 준수

## Technical Decisions

### Backend
- `CardPatch`에 `ParentCardID *string` 필드 추가 필요
- 새 API 엔드포인트: `POST /cards/{cardID}/link` (기존 카드를 하위 카드로 연결)
- 또는 기존 `PATCH /cards/{cardID}` 활용하여 `parentCardId` 변경

### Frontend
- `card.tsx`의 카드 선택 드롭다운 패턴 재사용
- `subCards.tsx`에 "기존 항목 연결" 버튼 추가
- Redux: 기존 `setSubCards`, `addSubCard` 액션 활용

### 검증 로직 (Backend)
1. 깊이 검증: `targetCard.Depth + 1 ≤ MaxCardDepth`
2. 같은 보드 확인: `card.BoardID == parentCard.BoardID`
3. 순환 참조 방지: 카드가 자신의 자손을 부모로 설정하는 것 방지
4. 자기 자신 연결 방지

## Research Findings

### 현재 구현 분석
- `server/model/card.go`: `ParentCardID`, `Depth` 필드 존재
- `CardPatch`에는 `ParentCardID` 필드 없음 → 추가 필요
- `server/app/cards.go`: `CreateSubCard()` - 깊이 검증, 속성 복사 로직 참조
- `webapp/src/properties/card/card.tsx`: 카드 선택 UI 패턴 (검색, 드롭다운)
- `webapp/src/components/cardDetail/subCards.tsx`: 하위 카드 목록 UI

### 기존 API 패턴
- `POST /boards/{boardID}/cards/{parentCardID}/subcards` - 새 하위 카드 생성
- `PATCH /cards/{cardID}` - 카드 수정 (CardPatch 사용)

## Decisions Made (User Confirmed)

### 1. 연결 해제(Unlink) 동작
- **결정**: 관계만 해제 - 카드 유지, 최상위 카드(depth=0, parentCardId="")로 복원

### 2. 프로퍼티 처리
- **결정**: 기존 프로퍼티 유지 - 연결만 하고 카드의 기존 속성값은 그대로 유지

### 3. 테스트 전략
- **결정**: Tests-after - 구현 완료 후 테스트 작성

## Scope Boundaries

### INCLUDE
- 기존 카드 연결 API (Link)
- 연결 해제 API (Unlink)
- 카드 선택 UI (드롭다운/모달)
- 검증 로직 (깊이, 순환 참조, 같은 보드)
- WebSocket 실시간 동기화

### EXCLUDE
- 다른 보드의 카드 연결
- 드래그앤드롭으로 연결
- 연결 히스토리/감사 로그
