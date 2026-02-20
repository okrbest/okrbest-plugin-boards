# 하위 카드(Sub-Card) Depth 시스템 개선

**작성일:** 2026-02-19  
**관련 기능:** 하위 카드 계층 구조, depth 관리

## 개요

하위 카드의 depth(깊이) 관리 시스템을 개선하여 다중 레벨 하위 카드를 지원하고, 연결/연결 해제 시 depth가 올바르게 업데이트되도록 수정했습니다.

---

## 주요 변경 사항

### 1. maxCardDepth 상수화 및 값 변경

**변경 전:** depth 제한이 2로 하드코딩되어 여러 파일에 분산  
**변경 후:** 상수로 통합 관리, 값을 5로 증가

| 위치 | 상수명 | 값 |
|------|--------|-----|
| `server/model/card.go` | `MaxCardDepth` | 5 |
| `webapp/src/constants.ts` | `Constants.maxCardDepth` | 5 |

**프론트엔드 사용처:**
- `cardDetail.tsx` - 하위카드 섹션 표시 조건
- `subCards.tsx` - 하위카드 추가 가능 여부
- `cardLinkSelector.tsx` - 카드 연결 가능 여부

---

### 2. 카드 연결 시 하위카드 depth 검증 및 업데이트

#### 2.1 새로운 헬퍼 함수 추가 (`server/app/cards.go`)

```go
// getMaxSubCardDepth - 카드의 하위카드 체인에서 최대 depth 계산
func (a *App) getMaxSubCardDepth(cardID string) (int, error)

// updateSubCardsDepth - 모든 하위카드들의 depth를 재귀적으로 업데이트
func (a *App) updateSubCardsDepth(cardID string, depthDelta int, userID string) error
```

#### 2.2 LinkCardAsSubCard 함수 개선

**변경 전:**
- 연결하려는 카드의 depth만 업데이트
- 기존 하위카드들의 depth는 그대로 유지 (버그)

**변경 후:**
1. 연결 전에 `기존 하위카드 최대 depth + 새 depth`가 `MaxCardDepth`를 초과하는지 검증
2. 연결 성공 시 모든 하위카드들의 depth도 재귀적으로 업데이트

```go
// 예시: 카드 A(depth 0)가 하위카드 B(depth 1)를 갖고 있을 때
// A를 카드 C(depth 2)의 하위카드로 연결하면:
// - A의 새 depth: 3
// - B의 새 depth: 4 (자동 업데이트)
```

#### 2.3 UnlinkSubCard 함수 개선

**변경 전:**
- 연결 해제하는 카드의 depth만 0으로 변경
- 기존 하위카드들의 depth는 그대로 유지 (버그)

**변경 후:**
- 연결 해제 시 모든 하위카드들의 depth도 재귀적으로 업데이트

```go
// 예시: 카드 B(depth 2)의 하위카드 C(depth 3)가 있을 때
// B를 연결 해제하면:
// - B의 새 depth: 0
// - C의 새 depth: 1 (자동 업데이트)
```

---

### 3. 에러 처리 및 다국어화

#### 3.1 API 에러 throw 추가 (`webapp/src/octoClient.ts`)

```typescript
async linkCardAsSubCard(cardId: string, parentCardId: string): Promise<Block | undefined> {
    // ...
    if (response.status !== 200) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `Failed to link card (status: ${response.status})`)
    }
    // ...
}
```

#### 3.2 에러 메시지 다국어화 (`webapp/src/components/cardDetail/subCards.tsx`)

서버 에러 메시지를 패턴 매칭하여 번역된 메시지 표시:

| 에러 패턴 | 한국어 메시지 |
|-----------|--------------|
| `maximum card depth` | 연결 불가: 하위 카드 깊이 제한({maxDepth})을 초과합니다 |
| `already a sub-card` | 이 카드는 이미 하위 카드입니다 |
| `circular reference` | 연결 불가: 순환 참조가 감지되었습니다 |
| `same board` | 같은 보드의 카드만 연결할 수 있습니다 |

**번역 파일:**
- `webapp/i18n/ko.json`
- `webapp/i18n/en.json`

---

### 4. 테이블 뷰 UI 개선

#### 4.1 하위카드 들여쓰기 정렬 문제 수정

**문제:**
- 하위카드가 있는 카드: 확장 버튼(▼)이 있어서 제목이 밀림
- 하위카드가 없는 카드: 확장 버튼이 없어서 제목이 왼쪽으로 밀림

**해결 (`webapp/src/components/table/tableRow.tsx`):**
```tsx
{props.hasSubCards ? (
    <button className='expand-toggle'>...</button>
) : props.isSubCard && (
    <span className='expand-toggle-placeholder'/>
)}
```

#### 4.2 스타일 (`webapp/src/components/table/tableRow.scss`)

```scss
.sub-card-indent {
    display: inline-block;
    flex-shrink: 0;
}

.expand-toggle-placeholder {
    display: inline-block;
    flex-shrink: 0;
    width: 20px;
    height: 20px;
}
```

---

## 파일 변경 목록

### 서버
| 파일 | 변경 내용 |
|------|----------|
| `server/model/card.go` | `MaxCardDepth = 5` |
| `server/app/cards.go` | `getMaxSubCardDepth`, `updateSubCardsDepth` 함수 추가, `LinkCardAsSubCard`, `UnlinkSubCard` 개선 |

### 프론트엔드
| 파일 | 변경 내용 |
|------|----------|
| `webapp/src/constants.ts` | `Constants.maxCardDepth = 5` 추가 |
| `webapp/src/components/cardDetail/cardDetail.tsx` | `Constants.maxCardDepth` 사용 |
| `webapp/src/components/cardDetail/subCards.tsx` | `Constants.maxCardDepth` 사용, 에러 처리 및 다국어화 |
| `webapp/src/components/cardDetail/cardLinkSelector.tsx` | `Constants.maxCardDepth` 사용 |
| `webapp/src/octoClient.ts` | `linkCardAsSubCard` 에러 throw 추가 |
| `webapp/src/components/table/tableRow.tsx` | 확장 버튼 placeholder 추가 |
| `webapp/src/components/table/tableRow.scss` | placeholder 스타일 추가 |
| `webapp/i18n/ko.json` | 에러 메시지 번역 추가 |
| `webapp/i18n/en.json` | 에러 메시지 번역 추가 |

---

## Depth 구조 예시

```
최상위 카드 (depth: 0)
├── 하위 카드 1 (depth: 1)
│   ├── 하위 카드 1-1 (depth: 2)
│   │   └── 하위 카드 1-1-1 (depth: 3)
│   │       └── 하위 카드 1-1-1-1 (depth: 4)
│   │           └── 하위 카드 1-1-1-1-1 (depth: 5) ← 최대
│   └── 하위 카드 1-2 (depth: 2)
└── 하위 카드 2 (depth: 1)
```

**maxCardDepth = 5**는 depth가 최대 5까지 허용됨을 의미합니다. (총 6단계: depth 0~5)

---

## 테스트 시나리오

1. **새 하위카드 생성**: depth가 올바르게 설정되는지 확인
2. **기존 카드 연결**: 하위카드가 있는 카드를 연결할 때 모든 하위카드 depth 업데이트 확인
3. **연결 해제**: 하위카드들의 depth가 올바르게 감소하는지 확인
4. **depth 초과 시 에러**: maxCardDepth 초과 시 에러 메시지가 올바르게 표시되는지 확인
5. **테이블 뷰 정렬**: 하위카드 유무와 관계없이 제목 정렬이 일관적인지 확인
