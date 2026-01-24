# WEBAPP (REACT FRONTEND)

## OVERVIEW

React 17 + TypeScript frontend. Redux Toolkit state. Webpack build. BlockSuite editor integration (Yjs CRDT).

## STRUCTURE

```
webapp/
├── src/
│   ├── index.tsx         # Plugin entry (Mattermost integration)
│   ├── app.tsx           # Root App component
│   ├── router.tsx        # React Router config
│   ├── store/            # Redux Toolkit (17 slices)
│   ├── components/       # UI components (118 dirs)
│   ├── blocks/           # Block type definitions
│   ├── widgets/          # Reusable primitives
│   ├── properties/       # Property type handlers
│   ├── utils/            # Helpers (utils.ts, blockSuiteUtils.ts)
│   ├── octoClient.ts     # API client (47KB)
│   ├── mutator.ts        # Optimistic updates (53KB)
│   └── wsclient.ts       # WebSocket client
├── webpack.config.js     # Build config
└── package.json          # Dependencies
```

## WHERE TO LOOK

| Task | Location |
|------|----------|
| New component | `src/components/{feature}/` |
| State slice | `src/store/{slice}.ts` |
| API calls | `src/octoClient.ts` |
| Optimistic updates | `src/mutator.ts` |
| WebSocket handling | `src/wsclient.ts` |
| Block type | `src/blocks/{type}.ts` |
| Property type | `src/properties/{type}/` |
| Card editor | `src/components/blockSuite/` |

## REDUX STORE

Slices in `store/`:
- `boards.ts` - Board entities
- `cards.ts` - Card entities  
- `views.ts` - View configurations
- `users.ts` - User data
- `teams.ts` - Team selection
- `sidebar.ts` - Sidebar state
- `rhs.ts` - Right-hand sidebar

Usage:
```tsx
import {useAppSelector, useAppDispatch} from '../store/hooks'
import {getBoard} from '../store/boards'

const board = useAppSelector(getBoard)
```

## COMPONENT PATTERNS

```tsx
// Functional + hooks only
const MyComponent: React.FC<Props> = ({prop1}) => {
    const intl = useIntl()
    const dispatch = useAppDispatch()
    const data = useAppSelector(selector)
    
    const handleClick = useCallback(() => {
        // action
    }, [deps])
    
    return <div className='MyComponent'>...</div>
}

export default React.memo(MyComponent)
```

## STYLING

SCSS with BEM naming:
```scss
.MyComponent {
    &__header { }
    &__content { }
    &--active { }
}
```

CSS variables for theming (from Mattermost):
```scss
color: var(--center-channel-color);
background: var(--center-channel-bg);
```

## API CLIENT

`octoClient.ts` wraps all REST calls:
```typescript
await octoClient.getBoard(boardId)
await octoClient.patchBlock(blockId, patch)
await octoClient.createCard(card)
```

## MUTATOR

`mutator.ts` handles optimistic updates with undo:
```typescript
await mutator.changePropertyValue(...)
await mutator.insertBlock(block, description)
```

## BLOCKSUITE EDITOR

Card content uses BlockSuite (Yjs-based):
- Entry: `components/blockSuite/BlockSuiteEditor.tsx`
- State: `components/blockSuite/EditorProvider.tsx`
- Init: `components/blockSuite/editor/editor.ts`
- Migration: `utils/blockSuiteUtils.ts`

Auto-save: 2s debounce on Yjs doc changes.

## KEY COMPONENTS

| Component | Path | Purpose |
|-----------|------|---------|
| CardDetail | `components/cardDetail/` | Card edit dialog |
| KanbanView | `components/kanban/` | Kanban board |
| TableView | `components/table/` | Table view |
| Sidebar | `components/sidebar/` | Navigation |
| ViewHeader | `components/viewHeader/` | View controls |

## ANTI-PATTERNS

- Class components (use functional + hooks)
- Direct DOM manipulation
- Inline styles (use SCSS)
- Non-memoized callbacks in render
- Type assertions (`as any`)

## COMMANDS

```bash
npm install              # Install deps
npm run build           # Production build
npm run debug           # Dev build
npm run test            # Jest tests
npm run check           # ESLint + Stylelint
npm run check-types     # TypeScript check
```

## TESTS

Colocated `*.test.tsx` files:
```bash
npm run test                           # All tests
npm run test -- --watch               # Watch mode
npm run test -- path/to/file.test.tsx # Specific
npm run updatesnapshot                # Update snapshots
```
