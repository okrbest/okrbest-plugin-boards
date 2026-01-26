---
description: 프로퍼티(Property) 시스템 관련 Q&A
globs: ["webapp/src/properties/**"]
---

# 프로퍼티 (Properties) 도메인

## 개요

프로퍼티는 카드의 속성(필드)을 정의합니다.
보드 레벨에서 `cardProperties`로 정의되고, 각 카드에서 값을 설정합니다.

## 프로퍼티 타입

| 타입 | 폴더 | 설명 | 값 형식 |
|------|------|------|---------|
| text | `properties/text/` | 텍스트 | `string` |
| number | `properties/number/` | 숫자 | `string` (숫자 문자열) |
| select | `properties/select/` | 단일 선택 | `string` (옵션 ID) |
| multiselect | `properties/multiselect/` | 다중 선택 | `string[]` (옵션 ID 배열) |
| date | `properties/date/` | 날짜 | `string` (JSON 객체) |
| person | `properties/person/` | 담당자 (단일) | `string` (사용자 ID) |
| multiperson | `properties/multiperson/` | 담당자 (다중) | `string[]` (사용자 ID 배열) |
| checkbox | `properties/checkbox/` | 체크박스 | `string` ("true"/"false") |
| url | `properties/url/` | URL | `string` |
| email | `properties/email/` | 이메일 | `string` |
| phone | `properties/phone/` | 전화번호 | `string` |
| createdTime | `properties/createdTime/` | 생성 시간 | 자동 계산 |
| updatedTime | `properties/updatedTime/` | 수정 시간 | 자동 계산 |
| createdBy | `properties/createdBy/` | 생성자 | 자동 계산 |
| updatedBy | `properties/updatedBy/` | 수정자 | 자동 계산 |
| card | `properties/card/` | 카드 참조 | `string` (아래 형식 참조) |

## 프로퍼티 정의 (Board)

```typescript
// Board.cardProperties
[
  {
    "id": "prop-1",
    "name": "상태",
    "type": "select",
    "options": [
      {"id": "opt-1", "value": "To Do", "color": "propColorRed"},
      {"id": "opt-2", "value": "In Progress", "color": "propColorYellow"},
      {"id": "opt-3", "value": "Done", "color": "propColorGreen"}
    ]
  },
  {
    "id": "prop-2",
    "name": "담당자",
    "type": "multiperson"
  },
  {
    "id": "prop-3",
    "name": "마감일",
    "type": "date"
  }
]
```

## 프로퍼티 값 (Card)

```typescript
// Card.fields.properties
{
  "prop-1": "opt-2",              // select: 옵션 ID
  "prop-2": ["user-1", "user-2"], // multiperson: 사용자 ID 배열
  "prop-3": "{\"from\":1704067200000}"  // date: JSON 문자열
}
```

## 프로퍼티 구조

```
properties/{type}/
├── property.tsx   # PropertyType 정의 (메인)
├── {type}.tsx     # 에디터/디스플레이 컴포넌트
└── {type}.scss    # 스타일 (선택)
```

### PropertyType 인터페이스

```typescript
interface IPropertyTemplate {
    id: string
    name: string
    type: PropertyTypeEnum
    options: IPropertyOption[]
}

interface PropertyType {
    type: PropertyTypeEnum
    displayName: string
    
    // 디스플레이 컴포넌트
    Display: React.FC<PropertyProps>
    
    // 에디터 컴포넌트
    Editor: React.FC<PropertyProps>
    
    // 값 검증
    validateValue?: (value: string) => boolean
    
    // 정렬 함수
    sortValue?: (a: string, b: string) => number
}
```

## 새 프로퍼티 추가

### 1. 폴더 생성

```bash
mkdir webapp/src/properties/{newType}
```

### 2. property.tsx 작성

```typescript
// properties/{newType}/property.tsx
import {PropertyType, PropertyTypeEnum} from '../types'
import {NewTypeEditor} from './{newType}'

const NewTypeProperty: PropertyType = {
    type: PropertyTypeEnum.NewType,
    displayName: '새 타입',
    Display: NewTypeDisplay,
    Editor: NewTypeEditor,
}

export default NewTypeProperty
```

### 3. 컴포넌트 구현

```typescript
// properties/{newType}/{newType}.tsx
const NewTypeDisplay: React.FC<PropertyProps> = ({value}) => {
    return <div>{value}</div>
}

const NewTypeEditor: React.FC<PropertyProps> = ({value, onChange}) => {
    return (
        <input 
            value={value}
            onChange={(e) => onChange(e.target.value)}
        />
    )
}
```

### 4. 등록

```typescript
// properties/index.tsx
import NewTypeProperty from './newType/property'

export const propertyTypes: Record<string, PropertyType> = {
    // ...
    [PropertyTypeEnum.NewType]: NewTypeProperty,
}
```

## Select/MultiSelect 옵션

### 옵션 색상

| 색상 | 클래스 |
|------|--------|
| 기본 | `propColorDefault` |
| 회색 | `propColorGray` |
| 갈색 | `propColorBrown` |
| 주황 | `propColorOrange` |
| 노랑 | `propColorYellow` |
| 초록 | `propColorGreen` |
| 청록 | `propColorTeal` |
| 파랑 | `propColorBlue` |
| 보라 | `propColorPurple` |
| 분홍 | `propColorPink` |
| 빨강 | `propColorRed` |

### 옵션 추가/수정

```typescript
await mutator.changePropertyOption(board, propertyTemplate, option)
```

## 날짜 프로퍼티 형식

```typescript
// 날짜 값 형식
interface DatePropertyValue {
    from?: number      // 시작 타임스탬프 (ms)
    to?: number        // 종료 타임스탬프 (ms, 범위인 경우)
    includeTime?: boolean  // 시간 포함 여부
}

// JSON 문자열로 저장
const dateValue = JSON.stringify({from: Date.now()})
```

## 계산 프로퍼티

읽기 전용 프로퍼티:

| 타입 | 값 계산 |
|------|--------|
| createdTime | `card.createAt` |
| updatedTime | `card.updateAt` |
| createdBy | `card.createdBy` |
| updatedBy | `card.modifiedBy` |

---

## 카드 속성 (Card Property)

카드 속성은 다른 보드의 카드를 참조할 수 있는 특수한 속성입니다.

### 값 형식

```typescript
// 새 형식 (다중 카드 지원)
"boardId|cardId1:cardTitle1,cardId2:cardTitle2,..."

// 이전 형식 (단일 카드, 하위 호환)
"boardId:cardId:cardTitle"
```

### 예시

```typescript
// 단일 카드 참조
"board123|card456:버그 수정"

// 다중 카드 참조
"board123|card456:버그 수정,card789:기능 추가"
```

### 주요 파일

| 파일 | 설명 |
|------|------|
| `properties/card/property.tsx` | PropertyType 정의 |
| `properties/card/card.tsx` | 에디터 컴포넌트 (카드 선택 UI) |
| `properties/card/card.scss` | 스타일 |

---

## 프로퍼티 필터링

### FilterValueType

프로퍼티마다 필터링 방식이 다릅니다:

| FilterValueType | 지원 조건 | 대상 프로퍼티 |
|-----------------|----------|--------------|
| `options` | includes, notIncludes, isEmpty, isNotEmpty | select, multiSelect |
| `person` | includes, notIncludes, isEmpty, isNotEmpty | person, multiPerson, createdBy, updatedBy |
| `text` | is, contains, notContains, startsWith, notStartsWith, endsWith, notEndsWith | text, url, email, phone |
| `boolean` | isSet, isNotSet | checkbox |
| `date` | is, isBefore, isAfter, isSet, isNotSet | date, createdTime, updatedTime |
| `card` | includes, notIncludes, isEmpty, isNotEmpty | card |

### 카드 속성 필터링

카드 속성 필터링은 참조된 카드 목록에서 선택하는 방식입니다.

#### 필터 조건

| 조건 | 설명 |
|------|------|
| includes | 선택한 카드를 참조하는 카드만 표시 |
| notIncludes | 선택한 카드를 참조하지 않는 카드만 표시 |
| isEmpty | 카드가 참조되지 않은 카드만 표시 |
| isNotEmpty | 카드가 하나라도 참조된 카드만 표시 |

#### 필터링 로직

1. **CardFilterValue 컴포넌트** (`viewHeader/cardFilterValue.tsx`):
   - 현재 보드의 모든 카드에서 해당 속성에 참조된 카드들을 수집
   - 드롭다운 메뉴로 카드 다중 선택 가능

2. **CardFilter.isClauseMet** (`cardFilter.ts`):
   - `extractCardIds()` 함수로 속성값에서 cardId 배열 추출
   - cardId 배열과 필터 값을 비교하여 조건 충족 여부 판단

```typescript
// cardFilter.ts - 카드 ID 추출 함수
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
```

#### 관련 파일

| 파일 | 설명 |
|------|------|
| `cardFilter.ts` | 필터링 로직 (extractCardIds, isClauseMet) |
| `viewHeader/cardFilterValue.tsx` | 카드 선택 UI 컴포넌트 |
| `viewHeader/filterEntry.tsx` | 필터 조건 선택 메뉴 |
| `viewHeader/filterValue.tsx` | FilterValueType별 필터 값 컴포넌트 분기 |
| `octoUtils.tsx` | 필터 조건 표시 문자열 및 유효성 검사 |

---

## Q&A 목록

> 개발 중 생긴 질문들이 `q-{주제}.md` 파일로 이 폴더에 추가됩니다.

| 질문 | 파일 |
|------|------|
| 카드 속성 필터링은 어떻게 구현되어 있나요? | `q-card-filtering.md` |
