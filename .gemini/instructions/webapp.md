---
description: React/TypeScript 웹앱 코드 규칙
globs: ["webapp/**/*.tsx", "webapp/**/*.ts", "webapp/**/*.scss"]
---

# 웹앱 코드 규칙

## 디렉토리 구조

```
webapp/src/
├── components/      # UI 컴포넌트
│   ├── cardDetail/  # 카드 상세
│   ├── kanban/      # 칸반 뷰
│   ├── table/       # 테이블 뷰
│   ├── calendar/    # 캘린더 뷰
│   ├── gallery/     # 갤러리 뷰
│   └── ...
├── store/           # Redux 슬라이스
├── blocks/          # 블록 타입 정의
├── properties/      # 프로퍼티 타입 정의
├── widgets/         # 재사용 위젯
├── utils/           # 유틸리티
└── i18n/            # 국제화
```

## 컴포넌트 패턴

### 컴포넌트 생성

```tsx
// components/myComponent/myComponent.tsx
import React from 'react'
import './myComponent.scss'

type Props = {
    value: string
    onChange: (value: string) => void
}

const MyComponent = (props: Props): JSX.Element => {
    const {value, onChange} = props
    
    return (
        <div className='MyComponent'>
            {/* 구현 */}
        </div>
    )
}

export default MyComponent
```

### 스타일 규칙

- 각 컴포넌트마다 같은 이름의 `.scss` 파일
- BEM 네이밍 또는 컴포넌트명 기반 클래스명
- CSS 변수 활용 (`var(--center-channel-bg)`)

## Redux 상태 관리

### 슬라이스 구조

```typescript
// store/mySlice.ts
import {createSlice, PayloadAction} from '@reduxjs/toolkit'

const mySlice = createSlice({
    name: 'myFeature',
    initialState: {},
    reducers: {
        updateItem: (state, action: PayloadAction<Item>) => {
            // 상태 업데이트
        }
    }
})

export const {updateItem} = mySlice.actions
export default mySlice.reducer
```

### 주요 슬라이스

| 슬라이스 | 파일 | 역할 |
|---------|------|------|
| boards | `store/boards.ts` | 보드 데이터 |
| cards | `store/cards.ts` | 카드 데이터 |
| views | `store/views.ts` | 뷰 설정 |
| contents | `store/contents.ts` | 콘텐츠 블록 |
| sidebar | `store/sidebar.ts` | 사이드바 카테고리 |
| users | `store/users.ts` | 사용자 정보 |

## API 통신

### OctoClient (`octoClient.ts`)

서버 REST API와 통신하는 클라이언트:

```typescript
// 보드 관련
const boards = await octoClient.getBoards()
await octoClient.createBoard(board)
await octoClient.patchBoard(boardId, patch)

// 블록 관련
const blocks = await octoClient.getAllBlocks(boardId)
await octoClient.insertBlocks(boardId, blocks)
await octoClient.patchBlock(boardId, blockId, patch)

// 파일 관련
const fileId = await octoClient.uploadFile(boardId, file)
```

### WSClient (`wsclient.ts`)

WebSocket을 통한 실시간 동기화:

```typescript
// 팀 구독
wsClient.subscribeToTeam(teamId)

// 변경 이벤트 핸들러
wsClient.addOnChange((items) => {
    // 블록 변경 처리
}, 'block')

wsClient.addOnChange((boards) => {
    // 보드 변경 처리
}, 'board')
```

#### WebSocket 이벤트 타입

| 이벤트 | 설명 |
|--------|------|
| `UPDATE_BOARD` | 보드 변경 |
| `UPDATE_BLOCK` | 블록 변경 |
| `UPDATE_MEMBER` | 멤버 변경 |
| `UPDATE_CATEGORY` | 카테고리 변경 |
| `UPDATE_SUBSCRIPTION` | 구독 변경 |

### Mutator (`mutator.ts`)

상태 변경 유틸리티 (Undo/Redo 지원):

```typescript
// 블록 변경 예시
await mutator.changeBlockTitle(block, newTitle, 'update title')

// 보드 변경 예시
await mutator.changeIcon(board, newIcon, 'update icon')

// 프로퍼티 값 변경
await mutator.changePropertyValue(card, propertyId, newValue)
```

**Mutator 패턴:**
1. 변경 전 상태 저장 (Undo용)
2. 서버 API 호출
3. Redux 스토어 업데이트
4. 설명 메시지로 Undo/Redo 히스토리 관리

## 블록 & 프로퍼티 시스템

### 블록 타입 (`blocks/`)

| 파일 | 설명 |
|------|------|
| `block.ts` | Block 인터페이스 |
| `board.ts` | Board 관련 타입 |
| `card.ts` | Card 관련 타입 |
| `boardView.ts` | View 관련 타입 |
| `contentBlock.ts` | 콘텐츠 블록 타입 |

### 프로퍼티 타입 (`properties/`)

| 타입 | 폴더 | 설명 |
|------|------|------|
| text | `properties/text/` | 텍스트 |
| select | `properties/select/` | 단일 선택 |
| multiselect | `properties/multiselect/` | 다중 선택 |
| date | `properties/date/` | 날짜 |
| person | `properties/person/` | 담당자 |
| checkbox | `properties/checkbox/` | 체크박스 |

### 새 프로퍼티 추가

1. `webapp/src/properties/{type}/` 폴더 생성
2. `property.tsx` - PropertyType 정의
3. 에디터/디스플레이 컴포넌트 구현
4. `webapp/src/properties/index.tsx`에 등록

## 테스트

```bash
# 웹앱 테스트
cd webapp && npm test

# 특정 파일 테스트
npm test -- --testPathPattern=myComponent

# 스냅샷 업데이트
npm test -- -u
```

## 국제화

```typescript
// 번역 파일: webapp/i18n/*.json
import {useIntl} from 'react-intl'

const intl = useIntl()
const text = intl.formatMessage({
    id: 'component.key',
    defaultMessage: 'Default Text'
})
```

## 빌드

```bash
# 개발 빌드
cd webapp && npm run build:dev

# 프로덕션 빌드
cd webapp && npm run build

# 타입 체크
npm run check-types

# 린트
npm run check
```
