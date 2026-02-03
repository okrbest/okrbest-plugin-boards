# Select/MultiSelect Option Rename & Reorder

## TL;DR

> **Quick Summary**: Select/MultiSelect 속성의 드롭다운 메뉴에서 옵션 값에 대한 "이름 바꾸기(Rename)"와 "드래그&드롭 순서 변경(Reorder)" 기능 추가. 기존 `mutator` 메서드(`changePropertyOptionValue`, `changePropertyOptionOrder`)를 활용하여 UI만 연결.
> 
> **Deliverables**:
> - 드롭다운 메뉴에 "Rename" 항목 추가 (EditIcon)
> - Inline editable input으로 옵션 이름 수정
> - Drag handle로 옵션 순서 변경 (react-beautiful-dnd)
> - Select와 MultiSelect 모두 지원
> 
> **Estimated Effort**: Medium (~4-6시간)
> **Parallel Execution**: YES - 2 waves
> **Critical Path**: Task 1 → Task 2 → Task 4 → Task 5

---

## Context

### Original Request
Select/MultiSelect 속성의 드롭다운 메뉴에서 두 가지 기능 요청:
1. **이름 바꾸기 (Rename)**: 속성 값을 직접 수정할 수 있어야 함 (현재는 삭제 후 재등록 필요)
2. **순서 변경 (Reorder)**: 마우스 드래그&드랍으로 속성 값 순서 변경

### Interview Summary
**Key Discussions**:
- Backend 메서드 이미 완벽 구현됨 (`mutator.ts`)
- `changePropertyOptionOrder`는 구현되어 있지만 **UI에서 사용되지 않음**
- Kanban/Table에서는 column header rename이 별도 구현됨
- react-beautiful-dnd 패턴이 sidebar, cardDetailProperties에서 사용 중

**Research Findings**:
- `valueSelector.tsx:87-103` - 현재 메뉴: Delete + Color picker만 존재
- `mutator.ts:644-664` - Reorder/Rename 메서드 구현됨
- `cardDetailProperties.tsx:344-426` - DnD 패턴 참조 가능
- `widgets/editable.tsx` - Inline edit 컴포넌트 존재
- react-select `components` prop으로 MenuList 커스터마이징 가능

### Gap Analysis (Self-Review)
**Identified Gaps** (addressed):
- react-select MenuList + DnD 통합 복잡성 → 커스텀 MenuList 컴포넌트로 해결
- Rename 중 드롭다운 닫힘 방지 → stopPropagation 처리
- 빈 이름 검증 → validator prop 활용

---

## Work Objectives

### Core Objective
Select/MultiSelect 속성의 드롭다운에서 옵션 값을 직접 수정하고 드래그로 순서 변경할 수 있도록 UX 개선

### Concrete Deliverables
1. `webapp/src/widgets/valueSelector.tsx` - Rename 기능 + DnD 적용
2. `webapp/src/properties/select/select.tsx` - onRenameOption, onReorderOption callback 추가
3. `webapp/src/properties/multiselect/multiselect.tsx` - 동일 callback 추가
4. `webapp/src/widgets/valueSelector.scss` - Rename input + Drag handle 스타일
5. `webapp/i18n/en.json`, `webapp/i18n/ko.json` - i18n 키 추가

### Definition of Done
- [ ] 드롭다운 메뉴에서 "Rename" 클릭 시 inline input으로 이름 수정 가능
- [ ] Enter 또는 blur 시 변경 저장, Escape 시 취소
- [ ] 빈 이름 입력 시 원래 값 유지
- [ ] 옵션을 드래그하여 순서 변경 가능
- [ ] Drag handle이 옵션 hover 시에만 표시됨
- [ ] Select와 MultiSelect 모두 동작
- [ ] Readonly 모드에서 Rename/Reorder 불가
- [ ] 기존 테스트 통과 (npm test)
- [ ] 빌드 성공 (npm run build)

### Must Have
- 기존 `mutator.changePropertyOptionValue()` 재활용 (새 API 호출 없음)
- 기존 `mutator.changePropertyOptionOrder()` 활용 (현재 미사용 메서드)
- Inline editable (Notion 스타일)
- Hover-to-show drag handle
- 기존 Delete/Color 메뉴 유지

### Must NOT Have (Guardrails)
- mutator.ts 수정 금지 (이미 완벽 구현됨)
- 새 외부 라이브러리 추가 금지
- Kanban/Table 컴포넌트 수정 금지 (별도 구현 있음)
- 과도한 애니메이션 금지
- `@ts-ignore` 또는 `as any` 사용 금지
- react-select 코어 동작 변경 금지

---

## Verification Strategy (MANDATORY)

### Test Decision
- **Infrastructure exists**: YES (Jest + React Testing Library)
- **User wants tests**: Tests-after (기존 테스트 업데이트)
- **Framework**: Jest + @testing-library/react

### Automated Verification

**For Each Task:**
```bash
# 타입 체크
cd webapp && npm run check-types

# 린트
cd webapp && npm run check

# 테스트
cd webapp && npm test -- --testPathPattern=select --watchAll=false

# 빌드
cd webapp && npm run build
```

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately):
├── Task 1: valueSelector.tsx - Rename 기능 추가 [no dependencies]
└── Task 3: i18n - 번역 키 추가 [no dependencies]

Wave 2 (After Task 1):
├── Task 2: valueSelector.tsx - DnD 순서 변경 추가 [depends: 1]
└── Task 4: valueSelector.scss - 스타일 추가 [depends: 1]

Wave 3 (After Wave 2):
├── Task 5: select.tsx, multiselect.tsx - Callback 연결 [depends: 1, 2]
└── Task 6: select.test.tsx - 테스트 업데이트 [depends: 5]

Wave 4 (Final):
└── Task 7: 통합 검증 및 빌드 확인 [depends: all]

Critical Path: Task 1 → Task 2 → Task 5 → Task 7
Parallel Speedup: ~35% faster than sequential
```

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
|------|------------|--------|---------------------|
| 1 | None | 2, 4, 5, 6 | 3 |
| 2 | 1 | 5, 6, 7 | 4 |
| 3 | None | 7 | 1 |
| 4 | 1 | 7 | 2 |
| 5 | 1, 2 | 6, 7 | None |
| 6 | 5 | 7 | None |
| 7 | All | None | None (final) |

---

## TODOs

### Wave 1

- [ ] 1. valueSelector.tsx에 Rename 기능 추가

  **What to do**:
  - Props 타입에 `onRenameOption?: (option: IPropertyOption, newValue: string) => void` 추가
  - LabelProps에 동일한 prop 추가
  - `ValueSelectorLabel` 컴포넌트에 `editingOptionId` 상태 추가 (useState)
  - Menu에 Rename 항목 추가 (EditIcon 사용)
  - Rename 클릭 시 해당 옵션을 inline input으로 변환
  - `Editable` 컴포넌트 활용 또는 직접 input 구현
  - Enter/blur 시 `onRenameOption` 호출, Escape 시 취소
  - 빈 값 입력 시 원래 값 유지

  **Must NOT do**:
  - 기존 Delete/Color 메뉴 항목 수정 금지
  - react-select 기본 동작 변경 금지

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: React 컴포넌트 + 인터랙션 구현
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Inline edit UX 패턴 구현에 필요

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 3)
  - **Blocks**: Tasks 2, 4, 5, 6
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References** (existing code to follow):
  - `webapp/src/widgets/editable.tsx:120-139` - Editable 컴포넌트 구현
  - `webapp/src/components/kanban/kanban.tsx:80-82` - changePropertyOptionValue 호출 패턴
  - `webapp/src/widgets/menu/textOption.tsx` - Menu.Text 컴포넌트

  **File to Modify**:
  - `webapp/src/widgets/valueSelector.tsx:27-38` - Props 타입 정의
  - `webapp/src/widgets/valueSelector.tsx:40-47` - LabelProps 타입 정의
  - `webapp/src/widgets/valueSelector.tsx:49-107` - ValueSelectorLabel 컴포넌트
  - `webapp/src/widgets/valueSelector.tsx:87-103` - 현재 Menu 영역

  **Icon References**:
  - `webapp/src/widgets/icons/edit.tsx` - EditIcon (pencil-outline)

  **Acceptance Criteria**:

  **Automated Verification:**
  ```bash
  # 타입 체크
  cd webapp && npm run check-types
  # Expected: 0 errors
  
  # 빌드 확인
  cd webapp && npm run build
  # Expected: Build successful
  ```

  **Behavioral Verification (Playwright via skill):**
  ```
  # Agent executes via playwright browser automation:
  1. Navigate to: http://localhost:8065 (login to Mattermost)
  2. Open a board with Select property
  3. Click on a card to open detail
  4. Click on Select property to open dropdown
  5. Click the "..." menu on an option
  6. Click "Rename"
  7. Assert: Input field appears with current value
  8. Type: "New Value"
  9. Press: Enter
  10. Assert: Option label changed to "New Value"
  ```

  **Commit**: NO (groups with Task 2)

---

- [ ] 3. i18n 번역 키 추가

  **What to do**:
  - `webapp/i18n/en.json`에 추가:
    - `"ValueSelector.rename": "Rename"`
  - `webapp/i18n/ko.json`에 추가:
    - `"ValueSelector.rename": "이름 바꾸기"`

  **Must NOT do**:
  - 기존 번역 키 수정 금지
  - 다른 언어 파일 수정 금지 (en, ko만)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 단순 JSON 추가 작업
  - **Skills**: []
    - 특별한 스킬 불필요

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 1)
  - **Blocks**: Task 7
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `webapp/i18n/en.json:16` - `"BoardComponent.delete": "Delete"` 패턴
  - `webapp/i18n/ko.json:16` - `"BoardComponent.delete": "삭제하기"` 패턴

  **Acceptance Criteria**:

  **Automated Verification:**
  ```bash
  # JSON 유효성 확인
  cd webapp && node -e "require('./i18n/en.json'); require('./i18n/ko.json'); console.log('JSON valid')"
  # Expected: JSON valid
  ```

  **Commit**: YES
  - Message: `i18n: add rename option translation keys`
  - Files: `webapp/i18n/en.json`, `webapp/i18n/ko.json`
  - Pre-commit: JSON 유효성 확인

---

### Wave 2

- [ ] 2. valueSelector.tsx에 Drag & Drop 순서 변경 추가

  **What to do**:
  - Import 추가: `DragDropContext, Droppable, Draggable, DropResult` from 'react-beautiful-dnd'
  - Import 추가: `GripIcon` from './icons/grip'
  - Props 타입에 `onReorderOption?: (option: IPropertyOption, destIndex: number) => void` 추가
  - Props 타입에 `propertyTemplate?: IPropertyTemplate` 추가 (드래그 시 index 계산용)
  - react-select의 `components.MenuList` 커스터마이징으로 DnD 컨텍스트 적용
  - 각 옵션에 Draggable 래핑 (formatOptionLabel 내부에서)
  - GripIcon을 drag handle로 추가
  - `onDragEnd` 핸들러에서 `onReorderOption` 호출

  **Must NOT do**:
  - react-select 기본 키보드 네비게이션 방해 금지
  - 드래그 중 드롭다운 닫힘 현상 발생 금지

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: 복잡한 DnD + react-select 통합
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Drag & Drop UX 패턴

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Task 4)
  - **Blocks**: Tasks 5, 6, 7
  - **Blocked By**: Task 1

  **References**:

  **Pattern References** (existing code to follow):
  - `webapp/src/components/cardDetail/cardDetailProperties.tsx:344-426` - DragDropContext + Droppable + Draggable 패턴
  - `webapp/src/components/calculations/options.tsx:193` - react-select components prop 사용 패턴
  - `webapp/src/testUtils.tsx:32-43` - wrapRBDNDDroppable 패턴

  **API References**:
  - `webapp/src/mutator.ts:644-652` - changePropertyOptionOrder 시그니처

  **Icon References**:
  - `webapp/src/widgets/icons/grip.tsx` - GripIcon (drag handle)

  **Type References**:
  - `webapp/src/blocks/board.ts:IPropertyOption` - 옵션 타입
  - `webapp/src/blocks/board.ts:IPropertyTemplate` - 템플릿 타입 (options 배열 포함)

  **Implementation Notes**:
  - react-select의 MenuList는 `components` prop으로 커스터마이징
  - 드래그 중 드롭다운이 닫히지 않도록 `closeMenuOnSelect={false}` 활용
  - Draggable의 `draggableId`는 option.id 사용

  **Acceptance Criteria**:

  **Automated Verification:**
  ```bash
  # 타입 체크
  cd webapp && npm run check-types
  # Expected: 0 errors
  
  # 빌드 확인
  cd webapp && npm run build
  # Expected: Build successful
  ```

  **Behavioral Verification (Playwright):**
  ```
  # Agent executes via playwright browser automation:
  1. Open board with Select property having 3+ options
  2. Click on Select property dropdown
  3. Hover over first option
  4. Assert: Drag handle (GripIcon) appears on left
  5. Drag first option to third position
  6. Assert: Option order changed
  7. Close and reopen dropdown
  8. Assert: New order persisted
  ```

  **Commit**: YES (includes Task 1)
  - Message: `feat(valueSelector): add rename and drag-drop reorder for options`
  - Files: `webapp/src/widgets/valueSelector.tsx`
  - Pre-commit: `cd webapp && npm run check-types`

---

- [ ] 4. valueSelector.scss에 스타일 추가

  **What to do**:
  - Rename input 스타일 추가
  - Drag handle (GripIcon) 스타일: 기본 숨김, hover 시 표시
  - Dragging 상태 스타일: 배경색 변경, 그림자
  - 기존 CSS 변수 활용 (--center-channel-color-rgb 등)

  **Must NOT do**:
  - 기존 스타일 삭제/변경 금지
  - 새 CSS 변수 정의 금지

  **Recommended Agent Profile**:
  - **Category**: `artistry`
    - Reason: 스타일링 전문 작업
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Drag handle visibility UX

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Task 2)
  - **Blocks**: Task 7
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `webapp/src/widgets/valueSelector.scss:62-85` - 현재 .value-menu-option 스타일
  - `webapp/src/components/cardDetail/cardDetailProperties.scss` - drag handle 스타일 패턴 (참조)
  - `webapp/src/components/sidebar/sidebarCategory.scss:231-235` - draggingOver 스타일

  **CSS Variable References**:
  - `--center-channel-color-rgb` - 텍스트 색상
  - `--center-channel-bg-rgb` - 배경 색상

  **Expected Styles:**
  ```scss
  .ValueSelector {
      .option-drag-handle {
          opacity: 0;
          cursor: grab;
          transition: opacity 0.15s ease;
          margin-right: 4px;
          display: flex;
          align-items: center;
      }
      
      .value-menu-option:hover .option-drag-handle {
          opacity: 1;
      }
      
      .value-menu-option--dragging {
          background: rgba(var(--center-channel-color-rgb), 0.08);
          box-shadow: 0 4px 8px rgba(0, 0, 0, 0.12);
          border-radius: var(--default-rad);
      }
      
      .option-rename-input {
          border: 1px solid rgba(var(--center-channel-color-rgb), 0.16);
          border-radius: var(--default-rad);
          padding: 4px 8px;
          font-size: 14px;
          width: 100%;
          
          &:focus {
              border-color: var(--button-bg);
              outline: none;
          }
      }
  }
  ```

  **Acceptance Criteria**:

  **Automated Verification:**
  ```bash
  # Stylelint 체크
  cd webapp && npm run check
  # Expected: No style errors
  
  # 빌드 확인
  cd webapp && npm run build
  # Expected: Build successful
  ```

  **Commit**: YES
  - Message: `style(valueSelector): add rename input and drag handle styles`
  - Files: `webapp/src/widgets/valueSelector.scss`
  - Pre-commit: `cd webapp && npm run check`

---

### Wave 3

- [ ] 5. select.tsx, multiselect.tsx에 Callback 연결

  **What to do**:
  
  **select.tsx:**
  - `onRenameOption` callback 추가: `mutator.changePropertyOptionValue()` 호출
  - `onReorderOption` callback 추가: `mutator.changePropertyOptionOrder()` 호출
  - ValueSelector에 새 props 전달: `onRenameOption`, `onReorderOption`, `propertyTemplate`
  
  **multiselect.tsx:**
  - 동일한 변경사항 적용

  **Must NOT do**:
  - 기존 callback 수정 금지 (onCreate, onChange 등)
  - mutator 호출 시그니처 변경 금지

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 기존 패턴 따라 callback 추가
  - **Skills**: []
    - 특별한 스킬 불필요

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3
  - **Blocks**: Tasks 6, 7
  - **Blocked By**: Tasks 1, 2

  **References**:

  **Pattern References** (existing code to follow):
  - `webapp/src/properties/select/select.tsx:37-39` - 기존 callback 패턴 (onChangeColor, onDeleteOption)
  - `webapp/src/components/kanban/kanban.tsx:80-82` - changePropertyOptionValue 호출 패턴

  **API References**:
  - `webapp/src/mutator.ts:644-652` - changePropertyOptionOrder 시그니처
  - `webapp/src/mutator.ts:655-664` - changePropertyOptionValue 시그니처

  **Files to Modify**:
  - `webapp/src/properties/select/select.tsx:37-72` - callback 정의 및 ValueSelector 호출
  - `webapp/src/properties/multiselect/multiselect.tsx:26-88` - 동일 변경

  **Implementation Pattern:**
  ```typescript
  // select.tsx 추가 내용
  const onRenameOption = useCallback((option: IPropertyOption, newValue: string) => {
      mutator.changePropertyOptionValue(board.id, board.cardProperties, propertyTemplate, option, newValue)
  }, [board, propertyTemplate])
  
  const onReorderOption = useCallback((option: IPropertyOption, destIndex: number) => {
      mutator.changePropertyOptionOrder(board.id, board.cardProperties, propertyTemplate, option, destIndex)
  }, [board, propertyTemplate])
  ```

  **Acceptance Criteria**:

  **Automated Verification:**
  ```bash
  # 타입 체크
  cd webapp && npm run check-types
  # Expected: 0 errors
  
  # 테스트
  cd webapp && npm test -- --testPathPattern=select --watchAll=false
  # Expected: All tests pass
  ```

  **Commit**: YES
  - Message: `feat(properties): connect rename and reorder callbacks for select/multiselect`
  - Files: `webapp/src/properties/select/select.tsx`, `webapp/src/properties/multiselect/multiselect.tsx`
  - Pre-commit: `cd webapp && npm run check-types`

---

- [ ] 6. select.test.tsx 테스트 업데이트

  **What to do**:
  - `wrapRBDNDDroppable` 유틸 import 추가 (from testUtils) - DnD 컨텍스트 필요시
  - 기존 테스트에 DnD 래퍼 추가 (필요한 경우)
  - Rename 기능 테스트 추가 (선택사항)
  - Reorder 기능 테스트 추가 (선택사항)
  - 기존 스냅샷 업데이트 (필요시)

  **Must NOT do**:
  - 기존 테스트 로직 변경 금지
  - 불필요한 mock 추가 금지

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 기존 테스트 패턴 따라 업데이트
  - **Skills**: []
    - 특별한 스킬 불필요

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (after Task 5)
  - **Blocks**: Task 7
  - **Blocked By**: Task 5

  **References**:

  **Pattern References**:
  - `webapp/src/testUtils.tsx:32-43` - wrapRBDNDDroppable 함수
  - `webapp/src/properties/select/select.test.tsx:48-202` - 기존 테스트 구조
  - `webapp/src/components/sidebar/sidebarBoardItem.test.tsx:78-130` - DnD 래퍼 사용 예시

  **Acceptance Criteria**:

  **Automated Verification:**
  ```bash
  # 테스트 실행
  cd webapp && npm test -- --testPathPattern=select --watchAll=false
  # Expected: All tests pass
  
  # 스냅샷 업데이트 필요시
  cd webapp && npm test -- --testPathPattern=select -u --watchAll=false
  ```

  **Commit**: YES
  - Message: `test(properties): update select tests for rename and reorder`
  - Files: `webapp/src/properties/select/select.test.tsx`
  - Pre-commit: `cd webapp && npm test -- --testPathPattern=select --watchAll=false`

---

### Wave 4

- [ ] 7. 통합 검증 및 최종 빌드 확인

  **What to do**:
  - 전체 타입 체크 실행
  - 전체 린트 실행
  - 전체 테스트 실행
  - 프로덕션 빌드 확인

  **Must NOT do**:
  - 코드 추가 수정 금지 (검증만)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 검증 명령어 실행만
  - **Skills**: []
    - 특별한 스킬 불필요

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (final)
  - **Blocks**: None (final task)
  - **Blocked By**: All tasks

  **References**:

  **Build Commands**:
  - `webapp/package.json` - 빌드 스크립트 정의

  **Acceptance Criteria**:

  **Automated Verification:**
  ```bash
  # 1. 타입 체크
  cd webapp && npm run check-types
  # Expected: 0 errors
  
  # 2. 린트
  cd webapp && npm run check
  # Expected: No errors
  
  # 3. 테스트
  cd webapp && npm test -- --watchAll=false
  # Expected: All tests pass
  
  # 4. 빌드
  cd webapp && npm run build
  # Expected: Build successful
  ```

  **Commit**: NO (final verification only)

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 3 | `i18n: add rename option translation keys` | en.json, ko.json | JSON valid |
| 1+2 | `feat(valueSelector): add rename and drag-drop reorder for options` | valueSelector.tsx | npm run check-types |
| 4 | `style(valueSelector): add rename input and drag handle styles` | valueSelector.scss | npm run check |
| 5 | `feat(properties): connect rename and reorder callbacks for select/multiselect` | select.tsx, multiselect.tsx | npm run check-types |
| 6 | `test(properties): update select tests for rename and reorder` | select.test.tsx | npm test |
| 7 | - (verification only) | - | Full suite |

---

## Success Criteria

### Verification Commands
```bash
# Full verification suite
cd webapp && npm run check-types && npm run check && npm test -- --watchAll=false && npm run build
# Expected: All pass, build successful
```

### Final Checklist
- [ ] 드롭다운 메뉴에 "Rename" 항목 표시됨
- [ ] Rename 클릭 시 inline input으로 변환됨
- [ ] Enter/blur 시 이름 변경 저장됨
- [ ] Escape 시 이름 변경 취소됨
- [ ] 빈 이름 입력 시 원래 값 유지됨
- [ ] 옵션 드래그하여 순서 변경 가능
- [ ] Drag handle이 hover 시에만 표시됨
- [ ] Select와 MultiSelect 모두 동작함
- [ ] Readonly 모드에서 Rename/Reorder 불가
- [ ] 기존 Delete/Color 기능 정상 동작
- [ ] 모든 테스트 통과
- [ ] 빌드 성공
