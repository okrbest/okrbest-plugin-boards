---
description: 카드 속성 필터링 구현 관련 Q&A
globs: ["webapp/src/properties/card/**", "webapp/src/components/viewHeader/cardFilterValue.*", "webapp/src/cardFilter.ts"]
---

# Q: 카드 속성 필터링은 어떻게 구현되어 있나요?

## 배경

카드 속성(card property)은 다른 보드의 카드를 참조할 수 있는 속성입니다.
기존에는 `filterValueType = 'text'`로 설정되어 텍스트 입력 방식으로 필터링되었으나,
사용자 경험 개선을 위해 카드 선택 방식으로 변경되었습니다.

## 변경 사항

### 1. FilterValueType에 'card' 타입 추가

```typescript
// webapp/src/properties/types.tsx
export type FilterValueType = 'none'|'options'|'boolean'|'text'|'date'|'person'|'card'
```

### 2. 카드 속성의 filterValueType 변경

```typescript
// webapp/src/properties/card/property.tsx
export default class CardProperty extends PropertyType {
    canFilter = true
    filterValueType = 'card' as FilterValueType  // 기존: 'text'
}
```

### 3. CardFilterValue 컴포넌트 생성

`webapp/src/components/viewHeader/cardFilterValue.tsx`

- 현재 보드의 모든 카드에서 해당 속성에 참조된 카드들을 자동으로 수집
- 드롭다운 메뉴에서 카드를 다중 선택 가능
- 카드 제목으로 표시

### 4. filterValue.tsx 업데이트

```typescript
// webapp/src/components/viewHeader/filterValue.tsx
if (propertyType.filterValueType === 'card') {
    if (filter.condition !== 'includes' && filter.condition !== 'notIncludes') {
        return null
    }
    return (
        <CardFilterValue
            view={view}
            filter={filter}
            template={template}
        />
    )
}
```

### 5. filterEntry.tsx에 조건 메뉴 추가

```typescript
// webapp/src/components/viewHeader/filterEntry.tsx
{propertyType.filterValueType === 'card' &&
    <>
        <Menu.Text id='includes' name='includes' ... />
        <Menu.Text id='notIncludes' name="doesn't include" ... />
        <Menu.Text id='isEmpty' name='is empty' ... />
        <Menu.Text id='isNotEmpty' name='is not empty' ... />
    </>}
```

### 6. OctoUtils 필터 조건 업데이트

```typescript
// webapp/src/octoUtils.tsx

// filterConditionDisplayString에 'card' 추가
if (filterValueType === 'options' || filterValueType === 'person' || filterValueType === 'card') {
    // includes, notIncludes, isEmpty, isNotEmpty 조건 표시
}

// filterConditionValidOrDefault에 'card' 추가
} else if (filterValueType === 'card') {
    switch (currentFilterCondition) {
    case 'includes':
    case 'notIncludes':
    case 'isEmpty':
    case 'isNotEmpty':
        return currentFilterCondition
    default:
        return 'includes'
    }
}
```

### 7. CardFilter 필터링 로직 업데이트

```typescript
// webapp/src/cardFilter.ts

// 카드 속성 값에서 cardId 배열 추출
function extractCardIds(propertyValue: string): string[] {
    // "boardId|cardId1:title1,cardId2:title2,..." 형식에서 cardId 추출
    if (propertyValue.includes('|')) {
        const [, cardsStr] = propertyValue.split('|')
        return cardsStr.split(',').map(cardStr => {
            const colonIndex = cardStr.indexOf(':')
            return colonIndex === -1 ? cardStr : cardStr.substring(0, colonIndex)
        }).filter(id => id)
    }
    // 이전 형식: "boardId:cardId:title"
    const parts = propertyValue.split(':')
    return parts.length >= 2 ? [parts[1]] : []
}

// isClauseMet에서 카드 타입 처리
if (template?.type === 'card') {
    cardIds = extractCardIds(value as string)
}

switch (filter.condition) {
case 'includes':
    if (cardIds !== undefined) {
        return filter.values.some((cValue) => cardIds.includes(cValue))
    }
    // ...
case 'notIncludes':
    if (cardIds !== undefined) {
        return !filter.values.some((cValue) => cardIds.includes(cValue))
    }
    // ...
case 'isEmpty':
    if (cardIds !== undefined) {
        return cardIds.length === 0
    }
    // ...
case 'isNotEmpty':
    if (cardIds !== undefined) {
        return cardIds.length > 0
    }
    // ...
}
```

## 필터 조건

| 조건 | 설명 |
|------|------|
| includes | 선택한 카드를 참조하는 카드만 표시 |
| notIncludes | 선택한 카드를 참조하지 않는 카드만 표시 |
| isEmpty | 카드가 참조되지 않은 카드만 표시 |
| isNotEmpty | 카드가 하나라도 참조된 카드만 표시 |

## 관련 파일

| 파일 | 설명 |
|------|------|
| `properties/types.tsx` | FilterValueType 정의 |
| `properties/card/property.tsx` | 카드 PropertyType 정의 |
| `cardFilter.ts` | 필터링 로직 (extractCardIds, isClauseMet) |
| `viewHeader/cardFilterValue.tsx` | 카드 선택 UI 컴포넌트 |
| `viewHeader/cardFilterValue.scss` | 스타일 |
| `viewHeader/filterEntry.tsx` | 필터 조건 선택 메뉴 |
| `viewHeader/filterValue.tsx` | FilterValueType별 필터 값 컴포넌트 분기 |
| `octoUtils.tsx` | 필터 조건 표시 문자열 및 유효성 검사 |
