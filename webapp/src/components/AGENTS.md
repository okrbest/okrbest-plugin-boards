# COMPONENTS

## OVERVIEW

118 component directories. Functional React + hooks. SCSS styling with BEM.

## STRUCTURE

```
components/
├── blockSuite/           # BlockSuite editor (Yjs)
├── cardDetail/           # Card edit dialog (21 files)
├── kanban/               # Kanban view + calculations
├── table/                # Table view (20 files)
├── sidebar/              # Navigation sidebar (20 files)
├── viewHeader/           # View controls (36 files)
├── shareBoard/           # Sharing UI (12 files)
├── content/              # Content blocks (17 files)
├── gallery/              # Gallery view
├── blocksEditor/         # Legacy block editor (being replaced)
└── ...                   # Other feature components
```

## KEY COMPONENTS

| Directory | Entry | Purpose |
|-----------|-------|---------|
| `blockSuite/` | `BlockSuiteEditor.tsx` | Rich text editor (Yjs CRDT) |
| `cardDetail/` | `cardDetail.tsx` | Card properties + content |
| `kanban/` | `kanban.tsx` | Drag-drop Kanban board |
| `table/` | `table.tsx` | Spreadsheet-like view |
| `sidebar/` | `sidebar.tsx` | Board navigation |
| `viewHeader/` | `viewHeader.tsx` | Filter, sort, group controls |

## COMPONENT PATTERN

```tsx
import React, {useCallback} from 'react'
import {useIntl} from 'react-intl'
import {useAppSelector} from '../../store/hooks'

import './myComponent.scss'

type Props = {
    id: string
    onAction?: () => void
}

const MyComponent: React.FC<Props> = ({id, onAction}) => {
    const intl = useIntl()
    const data = useAppSelector(state => state.boards.boards[id])
    
    const handleClick = useCallback(() => {
        onAction?.()
    }, [onAction])
    
    return (
        <div className='MyComponent'>
            <div className='MyComponent__header'>
                {intl.formatMessage({id: 'Component.title', defaultMessage: 'Title'})}
            </div>
        </div>
    )
}

export default React.memo(MyComponent)
```

## SCSS PATTERN

```scss
.MyComponent {
    display: flex;
    color: var(--center-channel-color);
    background: var(--center-channel-bg);
    
    &__header {
        font-weight: 600;
    }
    
    &__content {
        padding: 8px;
    }
    
    &--active {
        border-color: var(--button-bg);
    }
}
```

## BLOCKSUITE EDITOR

Located in `blockSuite/`:
- `BlockSuiteEditor.tsx` - Entry, mounts editor
- `EditorProvider.tsx` - State, auto-save (2s debounce)
- `EditorContainer.tsx` - DOM mount, drag/drop
- `editor/editor.ts` - Init logic
- `editor/context.ts` - React context

## ANTI-PATTERNS

- Class components
- Inline styles
- Non-memoized event handlers
- Direct DOM access
- Importing from parent directories (`../../..`)

## TESTS

```bash
npm run test -- components/cardDetail/
npm run test -- --watch
```

Snapshots in `__snapshots__/` dirs.
