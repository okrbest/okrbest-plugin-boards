# Draft: Property Drag & Drop Reordering

## Requirements (confirmed)
- **Goal**: Replace "Move Up/Move Down" menu buttons with drag & drop reordering (Notion-style)
- **User's exact words**: "Notion-style drag & drop"로 property 위치 편집 개선
- **Files to modify**: 
  1. `webapp/src/components/cardDetail/cardDetailProperties.tsx` - Add DnD
  2. `webapp/src/widgets/propertyMenu.tsx` - Remove move up/down menu items
  3. Create `webapp/src/components/cardDetail/cardDetailProperties.scss` - Add drag styles

## Technical Decisions
- **DnD Library**: `react-beautiful-dnd` (already installed ^13.1.1, used in sidebar)
- **Drag Handle Icon**: Use existing `GripIcon` from `webapp/src/widgets/icons/grip.tsx`
- **Pattern to follow**: Sidebar DnD implementation (`sidebar.tsx`, `sidebarCategory.tsx`, `sidebarBoardItem.tsx`)

## Research Findings

### Existing Code Analysis
1. **GripIcon already exists**: `webapp/src/widgets/icons/grip.tsx` - 6-dot vertical grip pattern
2. **moveProperty function** (lines 287-334): Already handles reordering logic
   - Uses `Utils.arrayMove()` for array reordering
   - Updates Redux store via `dispatch(updateBoards([updatedBoard]))`
   - Calls `mutator.changePropertyTemplateOrder()` for persistence
   - Also updates view's `visiblePropertyIds` order
3. **PropertyMenu props**: `onMoveUp`, `onMoveDown`, `canMoveUp`, `canMoveDown` (lines 259-278)
4. **Test file exists**: `cardDetailProperties.test.tsx` - uses `wrapIntl` pattern

### Sidebar DnD Pattern (Reference)
```tsx
// sidebar.tsx structure
<DragDropContext onDragEnd={onDragEnd}>
    <Droppable droppableId='lhs-categories' type='category'>
        {(provided) => (
            <div ref={provided.innerRef} {...provided.droppableProps}>
                {items.map((item, index) => (
                    <SidebarCategory key={item.id} index={index} ... />
                ))}
                {provided.placeholder}
            </div>
        )}
    </Droppable>
</DragDropContext>

// sidebarBoardItem.tsx - Draggable pattern
<Draggable draggableId={props.board.id} key={props.board.id} index={props.index}>
    {(provided, snapshot) => (
        <div {...provided.draggableProps} ref={provided.innerRef}>
            <div {...provided.dragHandleProps} className='...'> // whole item is handle
                {content}
            </div>
        </div>
    )}
</Draggable>
```

### Key Implementation Notes
- `provided.placeholder` MUST be inside Droppable children
- `draggableId` should be unique (use `propertyTemplate.id`)
- For hover-to-show handle: CSS opacity transition on `.octo-propertyrow:hover .drag-handle`
- Readonly mode: Use `isDragDisabled={props.readonly || !canEditBoardProperties}`

## Scope Boundaries

### INCLUDE
- Add `DragDropContext`, `Droppable`, `Draggable` to cardDetailProperties.tsx
- Add drag handle (GripIcon) to each property row
- Implement `onDragEnd` handler that reuses existing `moveProperty` logic
- Remove `onMoveUp`, `onMoveDown`, `canMoveUp`, `canMoveDown` props from PropertyMenu
- Remove "Move property up/down" menu items from propertyMenu.tsx
- Create cardDetailProperties.scss with drag handle styles
- Add visual feedback during drag (snapshot.isDragging)
- Readonly mode support (disable drag when readonly)
- Update existing tests

### EXCLUDE
- NOT changing the underlying reordering logic (keep using mutator.changePropertyTemplateOrder)
- NOT adding new icons (use existing GripIcon)
- NOT modifying other components (sidebar, kanban, etc.)
- NOT adding new dependencies

## Open Questions (Resolved with Defaults)
1. **Drag handle visibility**: Hover-to-show (Notion style) - DEFAULT
2. **Test strategy**: Update existing test file with DnD wrapper - DEFAULT

## Implementation Approach

### 1. cardDetailProperties.tsx Changes
- Import: `DragDropContext, Droppable, Draggable, DropResult` from 'react-beautiful-dnd'
- Import: `GripIcon` from '../../widgets/icons/grip'
- Wrap property list in DragDropContext > Droppable
- Wrap each property row in Draggable
- Add drag handle with GripIcon before property name
- Implement onDragEnd using existing moveProperty logic

### 2. propertyMenu.tsx Changes
- Remove: `onMoveUp`, `onMoveDown`, `canMoveUp`, `canMoveDown` from Props type
- Remove: Menu.Text items for 'move-up' and 'move-down' (lines 259-278)

### 3. cardDetailProperties.scss (New File)
```scss
.CardDetailProperties {
    .drag-handle {
        opacity: 0;
        cursor: grab;
        transition: opacity 0.15s ease;
    }
    
    .octo-propertyrow:hover .drag-handle {
        opacity: 1;
    }
    
    .octo-propertyrow--dragging {
        background: rgba(var(--center-channel-color-rgb), 0.08);
        box-shadow: 0 4px 8px rgba(0,0,0,0.12);
    }
}
```

### 4. Test Updates
- Add `wrapRBDNDDroppable` wrapper from testUtils.tsx to existing tests
- Add new test for drag & drop reordering
