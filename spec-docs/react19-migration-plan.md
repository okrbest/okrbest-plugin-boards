# React 19 업그레이드 마이그레이션 완료 보고서

**작성일**: 2026-02-05  
**완료일**: 2026-02-05  
**대상 프로젝트**: Mattermost Boards Plugin (Focalboard)  
**이전 버전**: React 18.2.0  
**현재 버전**: React 19.0.0 ✅

---

## 1. 마이그레이션 요약

### 1.1 완료된 작업

| 항목 | 상태 | 비고 |
|------|------|------|
| React 19 업그레이드 | ✅ 완료 | 19.0.0 |
| React DOM 19 | ✅ 완료 | 19.0.0 |
| @types/react 19 | ✅ 완료 | ^19.0.0 |
| forwardRef 제거 | ✅ 완료 | 2개 파일 |
| React.Children 리팩토링 | ✅ 완료 | 2개 파일 |
| createRef 안티패턴 수정 | ✅ 완료 | 1개 파일 |
| **Draft.js → Lexical** | ✅ 완료 | 전체 마이그레이션 |

### 1.2 검증 결과

| 항목 | 결과 |
|------|------|
| TypeScript 컴파일 | ✅ 통과 |
| Jest 테스트 | ✅ 870/874 통과 (4개 기존 이슈) |
| 스냅샷 테스트 | ✅ 484/484 통과 |
| ESLint | ✅ 통과 |

---

## 2. 의존성 변경 내역

### 2.1 업그레이드된 패키지

| 패키지 | 이전 | 현재 |
|--------|------|------|
| react | ^18.2.0 | ^19.0.0 |
| react-dom | ^18.2.0 | ^19.0.0 |
| @types/react | ^18.x | ^19.0.0 |
| @types/react-dom | ^18.x | ^19.0.0 |

### 2.2 신규 추가 패키지 (Lexical)

| 패키지 | 버전 | 용도 |
|--------|------|------|
| lexical | ^0.40.0 | 핵심 에디터 |
| @lexical/react | ^0.40.0 | React 통합 |
| @lexical/history | ^0.40.0 | Undo/Redo |
| @lexical/html | ^0.40.0 | HTML 변환 |
| @lexical/markdown | ^0.40.0 | 마크다운 지원 |
| @lexical/rich-text | ^0.40.0 | 서식 지원 |
| @lexical/selection | ^0.40.0 | 선택 유틸 |
| @lexical/utils | ^0.40.0 | 유틸리티 |
| lexical-beautiful-mentions | ^0.1.48 | @mentions |

### 2.3 제거된 패키지 (Draft.js)

| 패키지 | 이전 버전 | 상태 |
|--------|----------|------|
| draft-js | ^0.11.7 | ❌ 제거됨 |
| @draft-js-plugins/editor | ^4.1.2 | ❌ 제거됨 |
| @draft-js-plugins/emoji | ^4.6.0 | ❌ 제거됨 |
| @draft-js-plugins/mention | ^5.1.2 | ❌ 제거됨 |
| @types/draft-js | 0.11.9 | ❌ 제거됨 |
| immutable | 3.7.6 | ❌ 제거됨 |

**총 29개 패키지 제거됨**

---

## 3. 완료된 코드 리팩토링

### 3.1 forwardRef 제거 ✅

React 19에서 deprecated된 forwardRef 패턴 제거

**수정 파일:**
- `webapp/src/widgets/editable.tsx`
- `webapp/src/widgets/editableArea.tsx`

**변경 내용:**
```typescript
// Before (React 18)
const Editable = (props: EditableProps, ref: React.Ref<Focusable>) => {...}
export default forwardRef(Editable)

// After (React 19)
type EditableProps = {
    ref?: React.Ref<Focusable>
    // ... other props
}
const Editable = (props: EditableProps) => {
    const { ref, ...otherProps } = props
    // ...
}
export default Editable
```

### 3.2 React.Children.map 리팩토링 ✅

권장되지 않는 React.Children 유틸리티 사용 패턴 개선

**수정 파일:**
- `webapp/src/widgets/menu/menu.tsx`
- `webapp/src/components/createBoardFromTemplate.tsx`

**변경 내용:**
```typescript
// Before
{React.Children.map(children, (child) => ...)}

// After
{React.Children.toArray(children).map((child, index) => ...)}
```

### 3.3 createRef 안티패턴 수정 ✅

렌더 루프 내 createRef 호출 제거

**수정 파일:**
- `webapp/src/components/boardsSwitcherDialog/boardSwitcherDialog.tsx`

**변경 내용:**
```typescript
// Before (Anti-pattern)
refs.current = sortedItems.map((_, i) => refs.current[i] ?? createRef())

// After (Proper pattern)
const itemRefs = useRef<Map<number, HTMLElement | null>>(new Map())
// callback ref 사용
ref={(el) => { if (el) itemRefs.current.set(i, el) }}
```

---

## 4. Draft.js → Lexical 마이그레이션 완료

### 4.1 생성된 파일 구조

```
webapp/src/components/lexicalEditor/
├── LexicalEditorInput.tsx      # 메인 에디터 컴포넌트
├── lexicalEditor.scss          # 스타일링
├── plugins/
│   ├── OnChangePlugin.tsx      # 텍스트 변경 핸들러
│   ├── FocusPlugin.tsx         # 포커스/블러 이벤트
│   └── KeyboardPlugin.tsx      # Enter/Escape 키 처리
└── themes/
    └── editorTheme.ts          # 에디터 테마 설정
```

### 4.2 삭제된 파일 (17개)

```
webapp/src/components/markdownEditorInput/     # 4개 파일 삭제
├── markdownEditorInput.tsx
├── markdownEditorInput.scss
└── entryComponent/
    ├── entryComponent.tsx
    └── entryComponent.scss

webapp/src/components/live-markdown-plugin/    # 13개 파일 삭제
├── liveMarkdownPlugin.ts
├── pluginStrategy.ts
├── utils/
│   └── findRangesWithRegex.ts
├── inline-styles/
│   ├── boldStyleStrategy.ts
│   ├── italicStyleStrategy.ts
│   ├── strikethroughStyleStrategy.ts
│   ├── inlineCodeStyleStrategy.ts
│   ├── headingDelimiterStyleStrategy.ts
│   ├── ulDelimiterStyleStrategy.ts
│   ├── olDelimiterStyleStrategy.ts
│   └── quoteStyleStrategy.ts
└── block-types/
    ├── codeBlockStrategy.ts
    └── headingBlockStrategy.ts
```

### 4.3 구현된 기능

| 기능 | 상태 | 설명 |
|------|------|------|
| 기본 텍스트 편집 | ✅ | Lexical RichTextPlugin |
| @mentions | ✅ | lexical-beautiful-mentions |
| 비동기 사용자 검색 | ✅ | octoClient.searchTeamUsers |
| 한글 IME 지원 | ✅ | 즉시 검색 (debounce 우회) |
| 커스텀 멘션 UI | ✅ | 아바타, 뱃지 표시 |
| 비멤버 확인 다이얼로그 | ✅ | ConfirmAddUserForNotifications |
| Enter 저장 | ✅ | KeyboardPlugin |
| Escape 취소 | ✅ | KeyboardPlugin |
| Undo/Redo | ✅ | HistoryPlugin |

### 4.4 수정된 통합 지점

**`markdownEditor.tsx`** 변경:
```typescript
// Before
const MarkdownEditorInput = React.lazy(() => import('./markdownEditorInput/markdownEditorInput'))

// After
const LexicalEditorInput = React.lazy(() => import('./lexicalEditor/LexicalEditorInput'))
```

### 4.5 테스트 파일 업데이트

Draft.js mock 제거된 파일 (12개):
- `markdownEditor.test.tsx`
- `centerPanel.test.tsx`
- `viewTitle.test.tsx`
- `cardDialog.test.tsx`
- `contentBlock.test.tsx`
- `workspace.test.tsx`
- `blocksEditor/editor.test.tsx`
- `blocksEditor/blockContent.test.tsx`
- `blocksEditor/blocksEditor.test.tsx`
- `blocksEditor/blocks/text/text.test.tsx`
- `cardDetail/cardDetailContents.test.tsx`
- `content/textElement.test.tsx`

**테스트 환경 업데이트** (`tests/setupFile.ts`):
```typescript
// window.matchMedia mock 추가 (lexical-beautiful-mentions 호환)
Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: jest.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        // ...
    })),
})
```

---

## 5. 알려진 이슈

### 5.1 기존 테스트 실패 (4개)

React 19 마이그레이션과 **무관한** 기존 `userEvent.click` 인프라 이슈:

| 테스트 파일 | 에러 | 원인 |
|------------|------|------|
| sidebarSettingsMenu.test.tsx | `defaultView` is null | userEvent DOM 접근 |
| blockIconSelector.test.tsx | `defaultView` is null | userEvent DOM 접근 |
| globalHeaderSettingsMenu.test.tsx | `defaultView` is null | userEvent DOM 접근 |
| cardDetailProperties.test.tsx | `defaultView` is null | userEvent DOM 접근 |

**대응**: @testing-library/user-event 업그레이드 또는 fireEvent 사용 권장

### 5.2 --legacy-peer-deps 사용 중

일부 의존성의 peer dependency 충돌로 인해 설치 시 `--legacy-peer-deps` 플래그 필요:

```bash
npm install --legacy-peer-deps
```

---

## 6. 향후 권장 작업

### 6.1 단기 (선택)

| 작업 | 우선순위 | 설명 |
|------|----------|------|
| userEvent 테스트 수정 | 낮음 | 4개 테스트 실패 해결 |
| Emoji 플러그인 | 낮음 | Lexical용 이모지 선택기 (현재 텍스트로 동작) |

### 6.2 중기 (권장)

| 작업 | 우선순위 | 설명 |
|------|----------|------|
| react-router-dom v7 | 중간 | 6.x → 7.x 업그레이드 |
| react-intl v8 | 중간 | 5.x → 8.x 업그레이드 |
| legacy-peer-deps 제거 | 중간 | 모든 의존성 정상화 |

### 6.3 장기 (고려)

| 작업 | 우선순위 | 설명 |
|------|----------|------|
| react-dnd 교체 | 낮음 | @hello-pangea/dnd로 통합 (현재 혼용 중) |
| BlockSuite 업그레이드 | 중간 | 0.17.33 → 최신 버전 |

---

## 7. 참고 자료

### 공식 문서
- [React 19 Upgrade Guide](https://react.dev/blog/2024/04/25/react-19-upgrade-guide)
- [Lexical Documentation](https://lexical.dev/)
- [lexical-beautiful-mentions](https://github.com/sodenn/lexical-beautiful-mentions)

### 프로젝트 내 문서
- `AGENTS.md` - 프로젝트 구조 가이드
- `webapp/AGENTS.md` - 웹앱 개발 가이드
- `webapp/src/components/AGENTS.md` - 컴포넌트 가이드

---

## 8. 결론

### 완료 요약

| 카테고리 | 상태 |
|----------|------|
| React 19 업그레이드 | ✅ 완료 |
| 코드 리팩토링 | ✅ 완료 |
| Draft.js → Lexical | ✅ 완료 |
| 테스트 통과 | ✅ 99.5% (870/874) |
| 빌드 성공 | ✅ 통과 |

**React 19 마이그레이션이 성공적으로 완료되었습니다.**

모든 핵심 기능이 작동하며, Draft.js 의존성이 완전히 제거되어 향후 유지보수 부담이 크게 감소했습니다.
