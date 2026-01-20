---
description: 테스트 가이드
globs: ["server/**/*_test.go", "webapp/src/**/*.test.tsx", "webapp/src/**/*.test.ts"]
---

# 테스트 (Testing) 도메인

## 개요

서버(Go)와 웹앱(TypeScript/React) 테스트 가이드입니다.

## 테스트 종류 및 위치

| 테스트 유형 | 위치 | 실행 명령 |
|------------|------|-----------|
| 서버 단위 테스트 | `server/**/*_test.go` | `make server-test` |
| 서버 통합 테스트 | `server/integrationtests/` | `go test ./integrationtests/...` |
| Store 테스트 | `server/services/store/storetests/` | `go test ./services/store/...` |
| 웹앱 단위 테스트 | `webapp/src/**/*.test.ts(x)` | `cd webapp && npm test` |

## 서버 테스트 (Go)

### 실행 명령

```bash
# 전체 서버 테스트
make server-test

# 특정 패키지 테스트
go test ./server/app/...

# 특정 테스트 함수
go test -v ./server/app/... -run TestMyFunction

# 커버리지 리포트
make coverage
```

### 테스트 파일 패턴

```go
// server/app/boards_test.go
package app

import (
    "testing"
    "github.com/stretchr/testify/require"
)

func TestCreateBoard(t *testing.T) {
    th := SetupTestHelper(t)
    defer th.TearDown()

    board := &model.Board{
        Title:  "Test Board",
        TeamID: th.TeamID,
    }

    result, err := th.App.CreateBoard(board, th.UserID, true)
    require.NoError(t, err)
    require.NotNil(t, result)
    require.Equal(t, "Test Board", result.Title)
}
```

### 테스트 헬퍼

```go
// SetupTestHelper로 테스트 환경 구성
th := SetupTestHelper(t)
defer th.TearDown()

// 테스트용 객체 접근
th.App      // App 인스턴스
th.Store    // Store 인스턴스
th.TeamID   // 테스트 팀 ID
th.UserID   // 테스트 사용자 ID
```

### Mock Store

```go
// server/services/store/mockstore/
// 테스트용 Mock 구현

mockStore := &mockstore.Store{}
mockStore.On("GetBoard", "board-id").Return(&model.Board{...}, nil)
```

## 통합 테스트

### 위치 및 패턴

```go
// server/integrationtests/board_test.go
func TestBoardAPI(t *testing.T) {
    th := SetupTestHelper(t).InitBasic()
    defer th.TearDown()

    // API 클라이언트로 실제 HTTP 요청
    boards, err := th.Client.GetBoardsForTeam(th.TeamID)
    require.NoError(t, err)
    // ...
}
```

### 테스트 클라이언트

```go
// integrationtests/clienttestlib.go
th.Client.CreateBoard(board)
th.Client.GetBoard(boardID)
th.Client.PatchBoard(boardID, patch)
```

## 웹앱 테스트 (React/TypeScript)

### 실행 명령

```bash
cd webapp

# 전체 테스트
npm test

# Watch 모드
npm test -- --watch

# 특정 파일
npm test -- --testPathPattern=myComponent

# 커버리지
npm test -- --coverage

# 스냅샷 업데이트
npm test -- -u
```

### 컴포넌트 테스트

```tsx
// components/myComponent/myComponent.test.tsx
import React from 'react'
import {render, screen, fireEvent} from '@testing-library/react'
import MyComponent from './myComponent'

describe('MyComponent', () => {
    it('renders correctly', () => {
        render(<MyComponent value="test" onChange={() => {}} />)
        expect(screen.getByText('test')).toBeInTheDocument()
    })

    it('calls onChange on input', () => {
        const onChange = jest.fn()
        render(<MyComponent value="" onChange={onChange} />)
        
        fireEvent.change(screen.getByRole('textbox'), {
            target: {value: 'new value'}
        })
        
        expect(onChange).toHaveBeenCalledWith('new value')
    })
})
```

### Redux 스토어 테스트

```tsx
import {renderWithRedux} from '../testUtils'
import MyComponent from './myComponent'

it('renders with Redux state', () => {
    const initialState = {
        boards: {current: 'board-123'}
    }
    
    renderWithRedux(<MyComponent />, {initialState})
    // ...
})
```

### 스냅샷 테스트

```tsx
it('matches snapshot', () => {
    const {container} = render(<MyComponent />)
    expect(container).toMatchSnapshot()
})
```

## 품질 게이트

### Go 린트

```bash
cd server && golangci-lint run ./...
```

### TypeScript/ESLint

```bash
cd webapp
npm run check        # ESLint + Stylelint
npm run check-types  # TypeScript 타입 체크
```

## CI 실행

```bash
# CI 전체 시뮬레이션
make ci

# 개별 단계
make check-style  # 스타일 체크
make test         # 전체 테스트
make dist         # 빌드
```

## 테스트 작성 팁

### 서버

1. 각 `{feature}.go`에 대응하는 `{feature}_test.go` 작성
2. 테이블 기반 테스트 활용
3. `require`로 assertion (stretchr/testify)
4. 테스트 헬퍼로 반복 코드 제거

### 웹앱

1. 각 컴포넌트 폴더에 `*.test.tsx` 작성
2. React Testing Library 사용
3. 사용자 관점에서 테스트 작성
4. 스냅샷은 신중하게 사용

---

## Q&A 목록

> 개발 중 생긴 질문들이 `q-{주제}.md` 파일로 이 폴더에 추가됩니다.

| 질문 | 파일 |
|------|------|
| (새 질문이 생기면 여기에 추가) | |
