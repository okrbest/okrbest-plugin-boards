# BlockSuite 에디터 구조 리팩토링 및 통합 가이드

## 1. 개요
이 문서는 `okrbest-plugin-newboards`의 BlockSuite 에디터 컴포넌트를 `blocksuite-react-sample`의 구조와 동일하게 리팩토링한 내용을 설명합니다. 기존의 단일 파일(`BlockSuiteEditor.tsx`)에 집중된 로직을 **Context API**를 활용하여 역할별로 분리함으로써 유지보수성과 확장성을 향상시켰습니다.

## 2. 변경된 구조

### 파일 구조
```
webapp/src/components/blockSuite/
├── BlockSuiteEditor.tsx      # [Entry] 메인 진입점
├── EditorProvider.tsx        # [Logic] 상태 관리, 초기화, 데이터 로드, 자동 저장
├── EditorContainer.tsx       # [UI] 에디터 DOM 렌더링, 이벤트 핸들링 (D&D, Paste)
├── BlockSuiteEditor.scss     # 스타일 정의
└── editor/
    ├── context.ts            # React Context 정의
    └── editor.ts             # 순수 에디터 초기화 및 설정 로직
```

### 컴포넌트 역할

1.  **BlockSuiteEditor (`BlockSuiteEditor.tsx`)**
    *   단순 래퍼 컴포넌트입니다.
    *   `EditorProvider`와 `EditorContainer`를 합성하여 반환합니다.
    *   외부(`cardDetail.tsx`)에서 사용하는 인터페이스(`Props`)는 동일하게 유지됩니다.

2.  **EditorProvider (`EditorProvider.tsx`)**
    *   **역할**: 비즈니스 로직 및 상태 관리의 중심.
    *   **기능**:
        *   `initEditor()`를 호출하여 BlockSuite 인스턴스(`doc`, `collection`, `editor`) 생성.
        *   `loadEditorData()`를 통해 데이터 로드 (비동기).
        *   `doc`의 변경 사항을 감지하여 `octoClient`를 통해 자동 저장 (Debounce 적용).
    *   **제공 데이터**: `editor`, `doc`, `card`, `isLoading`, `saveStatus` 등을 하위 컴포넌트에 제공.

3.  **EditorContainer (`EditorContainer.tsx`)**
    *   **역할**: 실제 UI 렌더링 및 사용자 인터랙션 처리.
    *   **기능**:
        *   `AffineEditorContainer` (Web Component)를 DOM에 마운트.
        *   이미지 드래그 앤 드롭(Drag & Drop) 처리.
        *   클립보드 이미지 붙여넣기(Paste) 처리.
        *   로딩 상태 및 저장 상태 표시 UI.

4.  **editor/editor.ts**
    *   **역할**: React와 무관한 순수 BlockSuite 로직.
    *   **기능**:
        *   `DocCollection` 및 `Schema` 등록.
        *   `Doc` 생성 또는 로드.
        *   기본 페이지 구조 초기화 (Page -> Surface -> Note -> Paragraph).

## 3. 주요 로직 흐름

### 초기화 (Initialization)
1.  `BlockSuiteEditor` 마운트.
2.  `EditorProvider` 내부 `useLayoutEffect` 실행.
3.  `editor/editor.ts`의 `initEditor(cardId)` 호출.
4.  생성된 `editor`, `doc` 객체를 Context state에 저장.

### 데이터 로드 (Loading)
1.  `EditorProvider` 내부 `useEffect` 실행 (`editor` 생성 직후).
2.  `blockSuiteUtils.ts`의 `loadData` 호출.
    *   서버에서 JSON 스냅샷 데이터를 받아와 `Job` API를 통해 `doc`을 복원 (`job.snapshotToDoc`).
    *   데이터가 없으면 레거시 블록 데이터를 변환하여 초기화.

### 자동 저장 (Auto-Save)
1.  사용자가 에디터 편집 -> `doc` 업데이트 발생.
2.  `EditorProvider`가 `doc.spaceDoc.on('update')` 이벤트를 감지.
3.  2초간의 Debounce 후 `octoClient.saveBlockSuiteContent` 호출.
4.  저장 상태(`saving` -> `saved`)를 Context를 통해 `EditorContainer`에 전달하여 UI 표시.

## 4. 통합 및 테스트 계획

### 4.1 기능 플래그 활성화
서버 설정(`config.json`) 또는 플러그인 설정에서 `FeatureFlags`를 활성화해야 합니다.
```json
"FeatureFlags": {
    "newBoardsEditor": "true"
}
```

### 4.2 검증 절차
1.  **새 카드 생성**: 빈 에디터가 정상적으로 로드되는지 확인.
2.  **텍스트 입력**: 입력 후 우측 상단 "Saving..." -> "Saved" 상태 변경 확인.
3.  **이미지 업로드**:
    *   이미지 파일을 에디터로 드래그 앤 드롭.
    *   클립보드 이미지를 붙여넣기 (Ctrl+V).
    *   이미지가 정상적으로 블록으로 삽입되는지 확인.
4.  **새로고침**: 페이지 새로고침 후 입력한 데이터가 그대로 유지되는지 확인.

## 5. 향후 개선 사항 (TODO)
*   **React 18 업그레이드**: 현재 React 17 환경이므로, 향후 React 18로 업그레이드 시 `createRoot` 등을 활용한 렌더링 최적화 검토 필요.
*   **협업 기능 테스트**: Yjs 기반의 실시간 협업(Collab) 기능이 멀티 유저 환경에서 정상 동작하는지 부하 테스트 필요.
*   **에러 핸들링 강화**: 에디터 로드 실패 시 "Retry" 버튼 또는 "Text View(Fallback)" 모드 제공 고려.
