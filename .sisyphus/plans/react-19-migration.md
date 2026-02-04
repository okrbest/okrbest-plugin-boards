# React 19 마이그레이션 계획서

## TL;DR

> **Quick Summary**: React 17.0.2에서 React 19로 점진적 마이그레이션. @hello-pangea/dnd로 DND 라이브러리 교체, createRoot API 도입, 클래스 컴포넌트 전환.
> 
> **Deliverables**:
> - react-beautiful-dnd → @hello-pangea/dnd 교체 (5개 파일)
> - ReactDOM.render() → createRoot() 마이그레이션 (2개 파일)
> - Menu 클래스 컴포넌트 → 함수형 전환 (1개 파일)
> - JSX Transform 및 TypeScript 타입 업데이트
> - Redux 및 테스트 라이브러리 업그레이드
> 
> **Estimated Effort**: Medium (3-4일)
> **Parallel Execution**: YES - 3 phases
> **Critical Path**: Phase 1 → Phase 2 → Phase 3

---

## 1. 개요

### 1.1 목표
- Mattermost v11.x (React 18.2.0 제공) 호환 코드 작성
- React 19 신규 기능 및 API 호환성 확보
- 더 이상 유지보수되지 않는 라이브러리(react-beautiful-dnd) 교체
- 현대적 React 패턴 적용 (함수형 컴포넌트, hooks)

### 1.2 마이그레이션 경로
```
React 17.0.2 → React 18.x → React 19.x
     ↓              ↓             ↓
  Phase 1       Phase 2       Phase 3
 (사전 준비)   (18 업그레이드) (19 업그레이드)
```

### 1.3 총 예상 기간
- **Phase 1**: 0.5일 (사전 준비)
- **Phase 2**: 1.5일 (React 18 업그레이드)
- **Phase 3**: 1-2일 (React 19 업그레이드)
- **총계**: 3-4일

### 1.4 범위

**포함 (IN SCOPE)**:
- react-beautiful-dnd → @hello-pangea/dnd 교체
- ReactDOM.render() → createRoot() 전환
- Menu 클래스 컴포넌트 → 함수형 전환
- JSX Transform 설정 변경
- TypeScript 타입 업데이트
- react-redux 7 → 9, @reduxjs/toolkit 1 → 2
- @testing-library/react 11 → 15+

**제외 (OUT OF SCOPE)**:
- react-router-dom 5 → 6 마이그레이션
- react-dnd 마이그레이션 (이미 React 19 호환)
- @dnd-kit 통합 (별도 작업)
- ErrorBoundary 함수형 전환 (클래스 필수)
- Draft.js/BlockSuite 관련 변경

---

## 2. Phase 1: 사전 준비 (React 17 환경에서)

### 2.1 목표
- React 17 환경에서 안전하게 수행 가능한 변경 먼저 적용
- @hello-pangea/dnd로 DND 라이브러리 교체 (API 100% 호환)
- Menu 클래스 컴포넌트를 함수형으로 전환
- 기존 테스트 통과 확인

### 2.2 작업 목록

| ID | 작업 | 대상 파일 | 예상 시간 | 선행 작업 |
|:---|:-----|:----------|:----------|:----------|
| 1.1 | 환경 준비 및 baseline 캡처 | - | 15분 | 없음 |
| 1.2 | @hello-pangea/dnd 설치 | `package.json` | 5분 | 1.1 |
| 1.3 | sidebar.tsx DND import 교체 | `components/sidebar/sidebar.tsx` | 10분 | 1.2 |
| 1.4 | sidebarCategory.tsx DND import 교체 | `components/sidebar/sidebarCategory.tsx` | 10분 | 1.2 |
| 1.5 | sidebarBoardItem.tsx DND import 교체 | `components/sidebar/sidebarBoardItem.tsx` | 10분 | 1.2 |
| 1.6 | cardDetailProperties.tsx DND import 교체 | `components/cardDetail/cardDetailProperties.tsx` | 10분 | 1.2 |
| 1.7 | testUtils.tsx DND import 교체 | `testUtils.tsx` | 10분 | 1.2 |
| 1.8 | react-beautiful-dnd 제거 | `package.json` | 5분 | 1.3-1.7 |
| 1.9 | Menu 클래스 → 함수형 전환 | `widgets/menu/menu.tsx` | 45분 | 1.1 |
| 1.10 | Phase 1 검증 및 커밋 | - | 15분 | 1.8, 1.9 |

**Phase 1 예상 소요 시간**: 약 2.5시간

### 2.3 검증 방법

```bash
# 1. 테스트 통과 확인
cd webapp && npm run test

# 2. 타입 체크
cd webapp && npm run check-types

# 3. 빌드 성공 확인
cd webapp && npm run build

# 4. ESLint 통과
cd webapp && npm run check

# 5. react-beautiful-dnd 완전 제거 확인
grep -r "from 'react-beautiful-dnd'" webapp/src/ | wc -l
# Expected: 0
```

### 2.4 롤백 방법

```bash
# Phase 1 시작 전 태그 생성
git tag react-migration-pre-phase1

# 롤백 필요 시
git checkout react-migration-pre-phase1
npm install
```

### 2.5 작업 상세

#### 1.1 환경 준비 및 baseline 캡처

**What to do**:
- 현재 테스트 상태 캡처
- node_modules 정리 및 재설치

**Commands**:
```bash
cd webapp
rm -rf node_modules package-lock.json
npm install
npm run test -- --passWithNoTests 2>&1 | tee ../.sisyphus/evidence/baseline-test.txt
npm run build 2>&1 | tee ../.sisyphus/evidence/baseline-build.txt
```

**Commit**: `chore: capture baseline state before React migration`

---

#### 1.2 @hello-pangea/dnd 설치

**What to do**:
- @hello-pangea/dnd 설치 (react-beautiful-dnd 대체)

**Commands**:
```bash
cd webapp && npm install @hello-pangea/dnd
```

**References**:
- [hello-pangea/dnd GitHub](https://github.com/hello-pangea/dnd) - API 100% 호환

---

#### 1.3-1.7 DND import 교체

**What to do**:
- import 문만 변경 (로직 변경 없음)

**변경 패턴**:
```diff
- import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
+ import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
```

**대상 파일 및 라인**:

| 파일 | import 라인 | 변경 내용 |
|:-----|:------------|:----------|
| `sidebar/sidebar.tsx` | L6 | DragDropContext, Droppable, DropResult |
| `sidebar/sidebarCategory.tsx` | L10 | Draggable, Droppable |
| `sidebar/sidebarBoardItem.tsx` | L7 | Draggable |
| `cardDetail/cardDetailProperties.tsx` | L6 | DragDropContext, Droppable, Draggable |
| `testUtils.tsx` | L11 | DragDropContext, Droppable |

**Commit**: `refactor(dnd): replace react-beautiful-dnd with @hello-pangea/dnd`

---

#### 1.8 react-beautiful-dnd 제거

**What to do**:
- package.json에서 react-beautiful-dnd 및 @types 제거

**Commands**:
```bash
cd webapp && npm uninstall react-beautiful-dnd @types/react-beautiful-dnd
```

---

#### 1.9 Menu 클래스 → 함수형 전환

**What to do**:
- `React.PureComponent` → 함수형 + `React.memo`
- `React.createRef()` → `useRef()`
- `this.state` → `useState()`
- Static properties 유지

**Before**:
```tsx
export default class Menu extends React.PureComponent<Props> {
    static Color = ColorOption;
    menuRef: React.RefObject<HTMLDivElement>;
    
    constructor(props: Props) {
        super(props);
        this.menuRef = React.createRef<HTMLDivElement>();
    }
    
    public state = { hovering: null, menuStyle: {} };
    
    render(): JSX.Element { ... }
}
```

**After**:
```tsx
const Menu: React.FC<Props> = React.memo((props) => {
    const menuRef = useRef<HTMLDivElement>(null);
    const [hovering, setHovering] = useState<string | null>(null);
    const [menuStyle, setMenuStyle] = useState({});
    
    return ( ... );
});

// Static properties as separate exports
Menu.Color = ColorOption;
Menu.SubMenu = SubMenuOption;
// ...

export default Menu;
```

**References**:
- `webapp/src/widgets/menu/menu.tsx:24-91` - 현재 구현
- `webapp/src/widgets/editable.tsx:4-139` - 함수형 패턴 참조

**Commit**: `refactor(menu): convert Menu class component to functional`

---

#### 1.10 Phase 1 검증

**Acceptance Criteria**:
- [ ] `npm run test` → All tests pass
- [ ] `npm run check-types` → Exit code 0
- [ ] `npm run build` → Exit code 0
- [ ] `grep "react-beautiful-dnd" webapp/src/ -r | wc -l` → 0
- [ ] `grep "PureComponent" webapp/src/widgets/menu/menu.tsx | wc -l` → 0

**Commit**: `chore: complete Phase 1 - pre-migration cleanup`

**Tag**: `git tag react-migration-phase1-complete`

---

## 3. Phase 2: React 18 업그레이드

### 3.1 목표
- React 17 → 18 핵심 API 변경 적용
- ReactDOM.render() → createRoot() 전환
- JSX Transform 설정 변경
- TypeScript 타입 업데이트 (children prop 명시)

### 3.2 작업 목록

| ID | 작업 | 대상 파일 | 예상 시간 | 선행 작업 |
|:---|:-----|:----------|:----------|:----------|
| 2.1 | React 18 의존성 업데이트 | `package.json` | 15분 | Phase 1 완료 |
| 2.2 | tsconfig.json JSX 설정 변경 | `tsconfig.json` | 5분 | 2.1 |
| 2.3 | babel.config.js 업데이트 | `babel.config.js` | 5분 | 2.1 |
| 2.4 | main.tsx createRoot 전환 | `main.tsx` | 15분 | 2.1 |
| 2.5 | devmain.tsx createRoot 전환 | `blocksEditor/devmain.tsx` | 15분 | 2.1 |
| 2.6 | TypeScript children prop 명시 | 영향받는 컴포넌트 | 30분 | 2.1 |
| 2.7 | react-redux 9.x 업그레이드 | `package.json`, store 파일 | 30분 | 2.1 |
| 2.8 | @reduxjs/toolkit 2.x 업그레이드 | `package.json`, slice 파일 | 30분 | 2.7 |
| 2.9 | @testing-library/react 업그레이드 | `package.json`, 테스트 파일 | 30분 | 2.1 |
| 2.10 | Phase 2 검증 및 커밋 | - | 30분 | 2.4-2.9 |

**Phase 2 예상 소요 시간**: 약 3.5시간

### 3.3 검증 방법

```bash
# 1. 의존성 버전 확인
npm ls react react-dom react-redux @reduxjs/toolkit @testing-library/react

# 2. 테스트 통과 (스냅샷 업데이트 포함)
cd webapp && npm run test -- --updateSnapshot

# 3. 타입 체크
cd webapp && npm run check-types

# 4. 빌드 성공
cd webapp && npm run build

# 5. ReactDOM.render 제거 확인
grep "ReactDOM.render" webapp/src/ -r | wc -l
# Expected: 0

# 6. createRoot 사용 확인
grep "createRoot" webapp/src/main.tsx | wc -l
# Expected: 1
```

### 3.4 롤백 방법

```bash
# Phase 2 시작 전 태그 생성
git tag react-migration-pre-phase2

# 롤백 필요 시
git checkout react-migration-pre-phase2
rm -rf node_modules package-lock.json
npm install
```

### 3.5 작업 상세

#### 2.1 React 18 의존성 업데이트

**What to do**:
- React, ReactDOM을 peerDependencies로 유지 (Mattermost externals)
- @types/react, @types/react-dom 18.x로 업데이트

**Commands**:
```bash
cd webapp
npm install --save-dev @types/react@^18.0.0 @types/react-dom@^18.0.0
```

**Note**: react, react-dom은 Mattermost 호스트가 제공하므로 직접 업데이트하지 않음

---

#### 2.2 tsconfig.json JSX 설정 변경

**What to do**:
- JSX Transform을 새 방식으로 변경

**Before**:
```json
{
  "compilerOptions": {
    "jsx": "react"
  }
}
```

**After**:
```json
{
  "compilerOptions": {
    "jsx": "react-jsx"
  }
}
```

**Commit**: `chore(config): update tsconfig for React 18 JSX transform`

---

#### 2.3 babel.config.js 업데이트

**What to do**:
- @babel/preset-react를 automatic runtime으로 변경

**Before**:
```js
['@babel/preset-react', {
    useBuiltIns: true,
}],
```

**After**:
```js
['@babel/preset-react', {
    runtime: 'automatic',
}],
```

---

#### 2.4 main.tsx createRoot 전환

**What to do**:
- ReactDOM.render() → createRoot() 변경

**Before** (L43-50):
```tsx
ReactDOM.render(
    (
        <ReduxProvider store={store}>
            <MainApp/>
        </ReduxProvider>
    ),
    document.getElementById('focalboard-app'),
)
```

**After**:
```tsx
import { createRoot } from 'react-dom/client';

const container = document.getElementById('focalboard-app');
if (container) {
    const root = createRoot(container);
    root.render(
        <ReduxProvider store={store}>
            <MainApp/>
        </ReduxProvider>
    );
}
```

**References**:
- `webapp/src/main.tsx:43-50` - 현재 구현

**Commit**: `refactor(react): migrate main.tsx to createRoot API`

---

#### 2.5 devmain.tsx createRoot 전환

**What to do**:
- ReactDOM.render() → createRoot() 변경

**Before** (L111):
```tsx
ReactDOM.render(<App/>, document.getElementById('focalboard-app'))
```

**After**:
```tsx
import { createRoot } from 'react-dom/client';

const container = document.getElementById('focalboard-app');
if (container) {
    const root = createRoot(container);
    root.render(<App/>);
}
```

**References**:
- `webapp/src/components/blocksEditor/devmain.tsx:111` - 현재 구현

---

#### 2.6 TypeScript children prop 명시

**What to do**:
- React 18 @types/react에서 `FC`는 더 이상 `children`을 암시적으로 포함하지 않음
- 필요한 컴포넌트에 `children?: React.ReactNode` 추가

**Pattern**:
```diff
- interface Props {
-   title: string;
- }
+ interface Props {
+   title: string;
+   children?: React.ReactNode;
+ }
```

**Codemod** (권장):
```bash
npx types-react-codemod@latest preset-18 ./webapp/src
```

---

#### 2.7 react-redux 9.x 업그레이드

**What to do**:
- react-redux 7.2.4 → 9.x 업그레이드
- Pre-typed hooks 패턴 적용 (선택사항)

**Commands**:
```bash
cd webapp && npm install react-redux@^9.0.0
```

**Breaking Changes**:
- React 18 필수
- 커스텀 context 타이핑 변경

**Commit**: `chore(deps): upgrade react-redux to v9`

---

#### 2.8 @reduxjs/toolkit 2.x 업그레이드

**What to do**:
- @reduxjs/toolkit 1.8.0 → 2.x 업그레이드
- `extraReducers` builder 문법 확인 (이미 사용 중일 가능성)

**Commands**:
```bash
cd webapp && npm install @reduxjs/toolkit@^2.0.0
```

**Breaking Changes 확인**:
```bash
# object syntax extraReducers 사용 여부 확인
grep -r "extraReducers:" webapp/src/store/ | head -20
```

**Codemod** (필요시):
```bash
npx @reduxjs/rtk-codemods createSliceBuilder ./webapp/src
```

**Commit**: `chore(deps): upgrade @reduxjs/toolkit to v2`

---

#### 2.9 @testing-library/react 업그레이드

**What to do**:
- @testing-library/react 11.2.5 → 15.x 업그레이드
- @testing-library/dom peer dependency 설치
- act import 경로 변경

**Commands**:
```bash
cd webapp
npm install --save-dev @testing-library/react@^15.0.0 @testing-library/dom
```

**Import 변경**:
```diff
- import { act } from 'react-dom/test-utils';
+ import { act } from 'react';
```

**Commit**: `chore(deps): upgrade @testing-library/react to v15`

---

#### 2.10 Phase 2 검증

**Acceptance Criteria**:
- [ ] `npm run test -- --updateSnapshot` → All tests pass
- [ ] `npm run check-types` → Exit code 0
- [ ] `npm run build` → Exit code 0
- [ ] `npm run check` → No errors
- [ ] `grep "ReactDOM.render" webapp/src/ -r | wc -l` → 0
- [ ] `npm ls react-redux` → "9.x"
- [ ] `npm ls @reduxjs/toolkit` → "2.x"

**Commit**: `chore: complete Phase 2 - React 18 upgrade`

**Tag**: `git tag react-migration-phase2-complete`

---

## 4. Phase 3: React 19 업그레이드

### 4.1 목표
- React 19 호환 타입 패턴 적용
- useRef 인자 추가 (React 19 필수)
- ref cleanup 패턴 수정
- Jest 29 업그레이드 (선택사항)

### 4.2 작업 목록

| ID | 작업 | 대상 파일 | 예상 시간 | 선행 작업 |
|:---|:-----|:----------|:----------|:----------|
| 3.1 | @types/react 19.x 업데이트 | `package.json` | 10분 | Phase 2 완료 |
| 3.2 | useRef 인자 추가 (codemod) | 영향받는 파일 | 30분 | 3.1 |
| 3.3 | ref cleanup 패턴 수정 | 영향받는 파일 | 20분 | 3.1 |
| 3.4 | ReactElement props unknown 대응 | 영향받는 파일 | 20분 | 3.1 |
| 3.5 | Jest 29 업그레이드 (선택) | `package.json`, jest.config | 30분 | 3.1 |
| 3.6 | 스냅샷 테스트 업데이트 | `__snapshots__/*.snap` | 15분 | 3.5 |
| 3.7 | 최종 검증 및 E2E 테스트 | - | 45분 | 3.2-3.6 |

**Phase 3 예상 소요 시간**: 약 3시간

### 4.3 검증 방법

```bash
# 1. 타입 버전 확인
npm ls @types/react @types/react-dom

# 2. 전체 테스트 통과
cd webapp && npm run test

# 3. 타입 체크
cd webapp && npm run check-types

# 4. 빌드 성공
cd webapp && npm run build

# 5. ESLint 통과
cd webapp && npm run check

# 6. useRef 인자 없는 호출 확인
grep -r "useRef()" webapp/src/ | wc -l
# Expected: 0
```

### 4.4 롤백 방법

```bash
# Phase 3 시작 전 태그 생성
git tag react-migration-pre-phase3

# 롤백 필요 시
git checkout react-migration-pre-phase3
rm -rf node_modules package-lock.json
npm install
```

### 4.5 작업 상세

#### 3.1 @types/react 19.x 업데이트

**What to do**:
- @types/react, @types/react-dom을 19.x로 업데이트

**Commands**:
```bash
cd webapp
npm install --save-dev @types/react@^19.0.0 @types/react-dom@^19.0.0
```

**Note**: 실제 react, react-dom은 Mattermost가 제공하므로 타입만 업데이트

---

#### 3.2 useRef 인자 추가 (codemod)

**What to do**:
- `useRef()` → `useRef(undefined)` 또는 `useRef(null)` 변환
- React 19에서 인자 없는 useRef는 타입 에러

**Codemod**:
```bash
npx types-react-codemod@latest preset-19 ./webapp/src
```

**Manual Pattern**:
```diff
- const ref = useRef<HTMLDivElement>();
+ const ref = useRef<HTMLDivElement>(null);
```

**Acceptance Criteria**:
- [ ] `grep -r "useRef()" webapp/src/ | wc -l` → 0

**Commit**: `refactor(types): add useRef arguments for React 19 compatibility`

---

#### 3.3 ref cleanup 패턴 수정

**What to do**:
- ref callback에서 암묵적 return 제거
- React 19에서 cleanup 함수로 해석되어 오류 발생

**Pattern**:
```diff
- <div ref={current => (instance = current)} />
+ <div ref={current => { instance = current }} />
```

**Search**:
```bash
# 암묵적 return 패턴 검색
grep -rn "ref={.*=>.*(" webapp/src/ | head -20
```

**Commit**: `refactor(refs): update ref callbacks for React 19 cleanup behavior`

---

#### 3.4 ReactElement props unknown 대응

**What to do**:
- `ReactElement["props"]`가 `any` → `unknown`으로 변경됨
- 타입 가드 또는 명시적 타입 캐스팅 추가

**Pattern**:
```diff
- const props = element.props;
+ const props = element.props as MyProps;
```

**Codemod**:
```bash
npx types-react-codemod@latest react-element-default-any-props ./webapp/src
```

---

#### 3.5 Jest 29 업그레이드 (선택)

**What to do**:
- Jest 27.5.1 → 29.x 업그레이드
- jest.config.js 설정 확인

**Commands**:
```bash
cd webapp
npm install --save-dev jest@^29.0.0 @types/jest@^29.0.0 ts-jest@^29.0.0
```

**Breaking Changes**:
- `jest.fn().mockReturnValue()` 타입 개선
- 일부 matcher 동작 변경

---

#### 3.6 스냅샷 테스트 업데이트

**What to do**:
- React 19 렌더링 변경으로 인한 스냅샷 업데이트

**Commands**:
```bash
cd webapp && npm run test -- --updateSnapshot
```

**Review**: 변경된 스냅샷을 검토하여 의도치 않은 변경 확인

---

#### 3.7 최종 검증

**Acceptance Criteria**:
- [ ] `npm run test` → All tests pass
- [ ] `npm run check-types` → Exit code 0
- [ ] `npm run build` → Exit code 0
- [ ] `npm run check` → No errors
- [ ] 모든 DND 기능 정상 동작 (수동 또는 E2E 테스트)

**Commit**: `chore: complete Phase 3 - React 19 compatibility`

**Tag**: `git tag react-migration-phase3-complete`

---

## 5. 위험 요소 및 대응

| 위험 | 영향도 | 확률 | 대응 방안 |
|:-----|:-------|:-----|:----------|
| @hello-pangea/dnd 호환성 이슈 | HIGH | LOW | API 100% 호환. 이슈 발생 시 특정 버전 고정 |
| Mattermost externals 버전 충돌 | CRITICAL | MEDIUM | v11.x 환경에서 테스트 필수. peerDependencies 범위 확인 |
| 스냅샷 테스트 대량 변경 | LOW | HIGH | 일괄 업데이트 후 diff 검토 |
| react-redux 9.x breaking changes | MEDIUM | LOW | 공식 마이그레이션 가이드 참조, pre-typed hooks 적용 |
| RTK 2.x extraReducers 문법 | MEDIUM | LOW | codemod 실행 또는 수동 변환 |
| BlockSuite React 19 호환성 | HIGH | UNKNOWN | BlockSuite 코드 수정 제외, 별도 검증 필요 |
| children prop 타입 에러 다수 | MEDIUM | MEDIUM | codemod로 자동 변환, 수동 검토 병행 |
| useRef 타입 에러 다수 | MEDIUM | HIGH | codemod 실행 필수, 38개 파일 영향 |

### 롤백 전략

각 Phase 완료 시점에 Git tag 생성:
```bash
git tag react-migration-pre-phase1    # Phase 1 시작 전
git tag react-migration-phase1-complete   # Phase 1 완료
git tag react-migration-pre-phase2    # Phase 2 시작 전
git tag react-migration-phase2-complete   # Phase 2 완료
git tag react-migration-pre-phase3    # Phase 3 시작 전
git tag react-migration-phase3-complete   # Phase 3 완료 (최종)
```

롤백 필요 시:
```bash
git checkout react-migration-phase{N-1}-complete
rm -rf node_modules package-lock.json
npm install
```

---

## 6. 테스트 전략

### 6.1 단위 테스트

| Phase | 테스트 방식 | 명령어 |
|:------|:-----------|:-------|
| Phase 1 | 기존 테스트 실행 | `npm run test` |
| Phase 2 | 스냅샷 업데이트 포함 | `npm run test -- --updateSnapshot` |
| Phase 3 | 전체 테스트 + 스냅샷 검토 | `npm run test -- --updateSnapshot` |

### 6.2 수동 테스트 (각 Phase 완료 후)

| 기능 | 테스트 시나리오 |
|:-----|:---------------|
| 사이드바 DND | 보드를 다른 카테고리로 드래그 |
| 카테고리 DND | 카테고리 순서 변경 |
| 프로퍼티 DND | 카드 상세에서 프로퍼티 순서 변경 |
| Menu 컴포넌트 | 메뉴 열기/닫기, 호버 상태 |
| 앱 부팅 | 페이지 로드 및 렌더링 |

### 6.3 검증 체크리스트 (Phase별)

**Phase 1 완료 시**:
```bash
npm run test && npm run check-types && npm run build
grep "react-beautiful-dnd" webapp/src/ -r | wc -l  # 0
grep "PureComponent" webapp/src/widgets/menu/menu.tsx | wc -l  # 0
```

**Phase 2 완료 시**:
```bash
npm run test -- --updateSnapshot
npm run check-types && npm run build
grep "ReactDOM.render" webapp/src/ -r | wc -l  # 0
npm ls react-redux  # 9.x
npm ls @reduxjs/toolkit  # 2.x
```

**Phase 3 완료 시**:
```bash
npm run test && npm run check-types && npm run build && npm run check
grep "useRef()" webapp/src/ -r | wc -l  # 0
npm ls @types/react  # 19.x
```

---

## 7. 최종 체크리스트

### 마이그레이션 완료 조건

- [ ] **Phase 1**: react-beautiful-dnd → @hello-pangea/dnd 완료
- [ ] **Phase 1**: Menu 클래스 → 함수형 전환 완료
- [ ] **Phase 2**: ReactDOM.render → createRoot 완료
- [ ] **Phase 2**: JSX Transform 설정 변경 완료
- [ ] **Phase 2**: react-redux 9.x 업그레이드 완료
- [ ] **Phase 2**: @reduxjs/toolkit 2.x 업그레이드 완료
- [ ] **Phase 2**: @testing-library/react 15.x 업그레이드 완료
- [ ] **Phase 3**: @types/react 19.x 업데이트 완료
- [ ] **Phase 3**: useRef 인자 추가 완료
- [ ] **Phase 3**: ref cleanup 패턴 수정 완료

### 검증 명령어 (최종)

```bash
# 전체 테스트 통과
cd webapp && npm run test
# Expected: All tests pass

# 타입 체크 통과
cd webapp && npm run check-types
# Expected: Exit code 0

# 빌드 성공
cd webapp && npm run build
# Expected: "webpack compiled successfully"

# 린트 통과
cd webapp && npm run check
# Expected: No errors

# 레거시 라이브러리 제거 확인
grep -r "from 'react-beautiful-dnd'" webapp/src/ | wc -l
# Expected: 0

# ReactDOM.render 제거 확인
grep "ReactDOM.render" webapp/src/ -r | wc -l
# Expected: 0

# createRoot 사용 확인
grep "createRoot" webapp/src/main.tsx | wc -l
# Expected: 1

# JSX Transform 설정 확인
grep '"jsx"' webapp/tsconfig.json
# Expected: "react-jsx"
```

### 제외된 항목 (별도 작업 필요)

| 항목 | 이유 | 별도 작업 시기 |
|:-----|:-----|:--------------|
| react-router-dom 5 → 6 | Breaking changes 다수, 별도 마이그레이션 필요 | React 19 마이그레이션 완료 후 |
| react-dnd → @dnd-kit | 이미 React 19 호환, 당장 필요 없음 | 선택적 리팩토링 |
| ErrorBoundary 함수형 전환 | React가 아직 클래스 필수 | React에서 지원 시 |
| Draft.js/BlockSuite | 별도 복잡한 마이그레이션 | 별도 계획 |

---

## Commit Strategy

| Phase | 커밋 메시지 | 파일 |
|:------|:-----------|:-----|
| 1.1 | `chore: capture baseline state before React migration` | `.sisyphus/evidence/*.txt` |
| 1.2-1.8 | `refactor(dnd): replace react-beautiful-dnd with @hello-pangea/dnd` | sidebar/*.tsx, cardDetail/*.tsx, testUtils.tsx, package.json |
| 1.9 | `refactor(menu): convert Menu class component to functional` | widgets/menu/menu.tsx |
| 1.10 | `chore: complete Phase 1 - pre-migration cleanup` | - |
| 2.1-2.3 | `chore(config): update build config for React 18` | tsconfig.json, babel.config.js, package.json |
| 2.4-2.5 | `refactor(react): migrate to createRoot API` | main.tsx, devmain.tsx |
| 2.6 | `refactor(types): add explicit children props for React 18` | 영향받는 컴포넌트 |
| 2.7-2.8 | `chore(deps): upgrade Redux ecosystem to v9/v2` | package.json, store 파일 |
| 2.9 | `chore(deps): upgrade @testing-library/react to v15` | package.json, 테스트 파일 |
| 2.10 | `chore: complete Phase 2 - React 18 upgrade` | - |
| 3.1-3.4 | `refactor(types): apply React 19 type patterns` | 영향받는 파일 |
| 3.5-3.6 | `chore(deps): upgrade Jest to v29 and update snapshots` | package.json, __snapshots__ |
| 3.7 | `chore: complete Phase 3 - React 19 compatibility` | - |

---

## Success Criteria

### 최종 검증 커맨드

```bash
# 1. 전체 검증 스크립트
cd webapp && \
  npm run test && \
  npm run check-types && \
  npm run build && \
  npm run check && \
  echo "✅ All validations passed!"

# 2. 레거시 코드 제거 확인
echo "Checking legacy code removal..."
[ $(grep -r "from 'react-beautiful-dnd'" src/ 2>/dev/null | wc -l) -eq 0 ] && echo "✅ react-beautiful-dnd removed"
[ $(grep -r "ReactDOM.render" src/ 2>/dev/null | wc -l) -eq 0 ] && echo "✅ ReactDOM.render removed"
[ $(grep -r "useRef()" src/ 2>/dev/null | wc -l) -eq 0 ] && echo "✅ useRef() with no args removed"
```

### Final Checklist

- [ ] 모든 "Must Have" 충족
- [ ] 모든 "Must NOT Have" 준수
- [ ] 모든 테스트 통과
- [ ] 타입 체크 통과
- [ ] 빌드 성공
- [ ] ESLint/Stylelint 통과
- [ ] react-beautiful-dnd 완전 제거
- [ ] ReactDOM.render 완전 제거
- [ ] createRoot API 적용 완료
- [ ] Menu 함수형 컴포넌트 전환 완료
- [ ] React 19 호환 타입 패턴 적용 완료
- [ ] 기존 기능 100% 유지
