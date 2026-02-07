# Draft: Select/MultiSelect 옵션 Rename & Reorder

## Requirements (confirmed)
- **Goal**: Select/MultiSelect 속성의 드롭다운 메뉴에서 옵션 값을 "이름 바꾸기"하고 "순서 변경"할 수 있도록 개선
- **User's exact words**: 
  1. **이름 바꾸기 (Rename)**: 속성 값을 직접 수정할 수 있어야 함 (현재는 삭제 후 재등록 필요)
  2. **순서 변경 (Reorder)**: 마우스 드래그&드랍으로 속성 값 순서 변경

## Technical Decisions
- **Backend Methods**: mutator.ts에 이미 존재
  - `changePropertyOptionValue()` - RENAME (구현됨, Kanban/Table에서 사용 중)
  - `changePropertyOptionOrder()` - REORDER (구현됨, **하지만 UI에서 미사용**)
- **DnD Library**: `react-beautiful-dnd` (이미 설치됨, sidebar/cardDetail에서 사용 중)
- **Edit Icon**: `webapp/src/widgets/icons/edit.tsx` (EditIcon, pencil-outline)
- **Inline Edit**: 기존 `Editable` 컴포넌트 재사용 (`webapp/src/widgets/editable.tsx`)

## Research Findings

### 1. valueSelector.tsx 분석
- **위치**: `webapp/src/widgets/valueSelector.tsx`
- **현재 메뉴 항목** (line 87-103):
  - Delete (삭제)
  - Color picker (색상 선택)
- **누락된 기능**:
  - Rename (이름 바꾸기)
  - Drag & Drop 순서 변경
- **Props 타입** (line 27-38):
  ```typescript
  type Props = {
      options: IPropertyOption[]
      onChangeColor: (option: IPropertyOption, color: string) => void
      onDeleteOption: (option: IPropertyOption) => void
      // Missing: onRenameOption
      // Missing: onReorderOption
  }
  ```

### 2. mutator.ts 메서드 분석
- **changePropertyOptionValue** (line 655-664):
  ```typescript
  async changePropertyOptionValue(
    boardId: string, 
    oldCardProperties: IPropertyTemplate[], 
    propertyTemplate: IPropertyTemplate, 
    option: IPropertyOption, 
    value: string
  )
  ```
  - Kanban column header에서 사용 중 (`kanban.tsx:81`)
  - Table group header에서 사용 중 (`table.tsx:171`)

- **changePropertyOptionOrder** (line 644-652):
  ```typescript
  async changePropertyOptionOrder(
    boardId: string, 
    oldCardProperties: IPropertyTemplate[], 
    template: IPropertyTemplate, 
    option: IPropertyOption, 
    destIndex: number
  )
  ```
  - **현재 UI에서 사용되지 않음** (backend만 구현됨)

### 3. DnD 패턴 (cardDetailProperties.tsx 참조)
```tsx
<DragDropContext onDragEnd={onDragEnd}>
    <Droppable droppableId='property-list' type='property'>
        {(droppableProvided) => (
            <div ref={droppableProvided.innerRef} {...droppableProvided.droppableProps}>
                {items.map((item, index) => (
                    <Draggable key={item.id} draggableId={item.id} index={index}>
                        {(draggableProvided, snapshot) => (
                            <div ref={draggableProvided.innerRef} {...draggableProvided.draggableProps}>
                                <div className='drag-handle' {...draggableProvided.dragHandleProps}>
                                    <GripIcon/>
                                </div>
                                {content}
                            </div>
                        )}
                    </Draggable>
                ))}
                {droppableProvided.placeholder}
            </div>
        )}
    </Droppable>
</DragDropContext>
```

### 4. 기존 Rename 패턴 (Kanban column header)
- Kanban에서는 column header 클릭 시 inline editable로 변환
- `propertyNameChanged` callback으로 `mutator.changePropertyOptionValue()` 호출

### 5. i18n 패턴
- 기존 키: `BoardComponent.delete` = "삭제하기"
- 추가 필요:
  - `ValueSelector.rename` = "이름 바꾸기"

## Scope Boundaries

### INCLUDE
1. **valueSelector.tsx**:
   - `onRenameOption` prop 추가
   - Rename 메뉴 항목 추가 (EditIcon 사용)
   - Inline rename UI (상태: 편집 중 여부)
   - DragDropContext, Droppable, Draggable로 옵션 목록 래핑
   - `onDragEnd` 핸들러로 순서 변경

2. **select.tsx**:
   - `onRenameOption` callback 추가 (mutator.changePropertyOptionValue 호출)
   - `onReorderOption` callback 추가 (mutator.changePropertyOptionOrder 호출)

3. **multiselect.tsx**:
   - 동일한 변경사항 적용

4. **valueSelector.scss**:
   - Rename input 스타일
   - Drag handle 스타일
   - Dragging 상태 스타일

5. **i18n**:
   - en.json, ko.json에 새 키 추가

### EXCLUDE
- Kanban/Table 컴포넌트 수정 (이미 별도로 rename 기능 있음)
- mutator.ts 수정 (이미 완벽히 구현됨)
- 새 아이콘 추가 (EditIcon, GripIcon 재사용)
- 새 라이브러리 추가

## Open Questions

### 1. Rename UI 방식
**옵션들:**
- A) Menu 클릭 시 inline input으로 변환 (Notion 스타일)
- B) Menu 클릭 시 모달/팝업 표시
- C) 레이블 더블클릭 시 inline input

**기본값**: A (Notion 스타일) - 가장 직관적

### 2. Drag Handle 표시 방식
**옵션들:**
- A) 항상 표시
- B) Hover 시에만 표시 (Notion 스타일)

**기본값**: B (Hover 시에만 표시)

### 3. react-select 커스터마이징 제약
- react-select의 MenuList를 커스터마이징하여 DnD 적용 필요
- `components` prop으로 커스텀 MenuList 전달

## Implementation Approach

### ValueSelector.tsx 구조 변화
```tsx
// Before
<CreatableSelect
    formatOptionLabel={(option, meta) => <ValueSelectorLabel ... />}
    ...
/>

// After
<CreatableSelect
    formatOptionLabel={(option, meta) => <ValueSelectorLabel ... />}
    components={{
        MenuList: (props) => (
            <DragDropContext onDragEnd={handleDragEnd}>
                <Droppable droppableId="options-list">
                    {(provided) => (
                        <div ref={provided.innerRef} {...provided.droppableProps}>
                            {props.children}
                            {provided.placeholder}
                        </div>
                    )}
                </Droppable>
            </DragDropContext>
        )
    }}
    ...
/>
```

### 주의사항
- react-select의 내부 구조와 DnD 통합 시 children 처리 필요
- Draggable은 각 option 아이템에 적용해야 함
- formatOptionLabel에서 Draggable 래핑이 필요할 수 있음
