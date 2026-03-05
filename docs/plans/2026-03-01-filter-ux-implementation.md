# Filter UX Improvement Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the row-based filter UI with a 2-panel property-list + value-checkbox UI that lets users filter by selecting values directly.

**Architecture:** Create 3 new components (`FilterPanel`, `FilterPropertyList`, `FilterValuePanel`) in a `filterPanel/` directory. Reuse existing data model (`FilterGroup`/`FilterClause`), filter engine (`CardFilter`), and persistence (`mutator.changeViewFilter`). The new UI translates checkbox selections into `FilterClause` objects with `includes` condition by default.

**Tech Stack:** React 19, TypeScript, SCSS (BEM), react-intl, Redux (read-only selectors for users), existing `mutator`/`undoManager` for persistence.

---

## Key Reference Files

| File | Purpose |
|---|---|
| `webapp/src/blocks/filterClause.ts` | `FilterClause`, `FilterCondition`, `createFilterClause()` |
| `webapp/src/blocks/filterGroup.ts` | `FilterGroup`, `createFilterGroup()`, `isAFilterGroupInstance()` |
| `webapp/src/blocks/board.ts` | `Board`, `IPropertyTemplate`, `IPropertyOption` |
| `webapp/src/blocks/boardView.ts` | `BoardView` (stores filter in `fields.filter`) |
| `webapp/src/properties/types.tsx` | `FilterValueType`, `PropertyType` abstract class |
| `webapp/src/properties/index.tsx` | `propsRegistry` — property type registry |
| `webapp/src/mutator.ts:867` | `changeViewFilter()` — undo-aware save |
| `webapp/src/components/modal.tsx` | `Modal` component (click-outside-to-close) |
| `webapp/src/components/viewHeader/viewHeader.tsx` | Entry point — filter button + showFilter state |
| `webapp/src/components/viewHeader/filterComponent.tsx` | OLD — to be replaced |
| `webapp/src/components/viewHeader/filterEntry.tsx` | OLD — to be replaced |
| `webapp/src/components/viewHeader/filterValue.tsx` | OLD — to be replaced |
| `webapp/src/components/viewHeader/dateFilter.tsx` | KEEP — reuse for date type |
| `webapp/src/components/viewHeader/multipersonFilterValue.tsx` | REFERENCE — person value logic |

---

### Task 1: Create FilterPanel container with SCSS

The popover container that wraps the 2-panel layout.

**Files:**
- Create: `webapp/src/components/viewHeader/filterPanel/filterPanel.tsx`
- Create: `webapp/src/components/viewHeader/filterPanel/filterPanel.scss`
- Create: `webapp/src/components/viewHeader/filterPanel/index.ts`

**Step 1: Create the directory**

Run: `mkdir -p webapp/src/components/viewHeader/filterPanel`

**Step 2: Create `filterPanel.scss`**

```scss
.FilterPanel {
    width: 520px;
    max-height: 400px;
    display: flex;
    flex-direction: column;

    &__content {
        display: flex;
        flex-direction: row;
        flex: 1;
        min-height: 0;
    }
}
```

**Step 3: Create `filterPanel.tsx`**

```tsx
// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useState, useMemo} from 'react'

import {Board, IPropertyTemplate} from '../../../blocks/board'
import {BoardView} from '../../../blocks/boardView'
import {FilterClause} from '../../../blocks/filterClause'
import {isAFilterGroupInstance} from '../../../blocks/filterGroup'
import propsRegistry from '../../../properties'

import Modal from '../../modal'

import FilterPropertyList from './filterPropertyList'
import FilterValuePanel from './filterValuePanel'

import './filterPanel.scss'

type Props = {
    board: Board
    activeView: BoardView
    onClose: () => void
}

const FilterPanel = (props: Props): React.JSX.Element => {
    const {board, activeView, onClose} = props

    const filterableProperties = useMemo(() => {
        return board.cardProperties.filter(
            (p: IPropertyTemplate) => propsRegistry.get(p.type).canFilter,
        )
    }, [board.cardProperties])

    const activeFilters = useMemo(() => {
        return (activeView.fields.filter?.filters?.filter(
            (f) => !isAFilterGroupInstance(f),
        ) as FilterClause[]) || []
    }, [activeView.fields.filter])

    // Find the first property that has an active filter, or default to first property
    const initialProperty = useMemo(() => {
        const withFilter = filterableProperties.find((p) =>
            activeFilters.some((f) => f.propertyId === p.id),
        )
        return withFilter || filterableProperties[0] || null
    }, [filterableProperties, activeFilters])

    const [selectedPropertyId, setSelectedPropertyId] = useState<string>(
        initialProperty?.id || '',
    )

    const selectedProperty = filterableProperties.find((p) => p.id === selectedPropertyId) || null

    return (
        <Modal onClose={onClose}>
            <div className='FilterPanel'>
                <div className='FilterPanel__content'>
                    <FilterPropertyList
                        properties={filterableProperties}
                        activeFilters={activeFilters}
                        selectedPropertyId={selectedPropertyId}
                        onSelectProperty={setSelectedPropertyId}
                    />
                    <FilterValuePanel
                        board={board}
                        activeView={activeView}
                        property={selectedProperty}
                        activeFilters={activeFilters}
                    />
                </div>
            </div>
        </Modal>
    )
}

export default React.memo(FilterPanel)
```

**Step 4: Create `index.ts`**

```ts
export {default} from './filterPanel'
```

**Step 5: Verify build compiles (will fail until children exist)**

This step is deferred — will verify after Task 2 and Task 3.

**Step 6: Commit**

```bash
git add webapp/src/components/viewHeader/filterPanel/
git commit -m "feat(filter): add FilterPanel container component with 2-panel layout"
```

---

### Task 2: Create FilterPropertyList (left panel)

The left panel showing the list of filterable properties.

**Files:**
- Create: `webapp/src/components/viewHeader/filterPanel/filterPropertyList.tsx`
- Create: `webapp/src/components/viewHeader/filterPanel/filterPropertyList.scss`

**Step 1: Create `filterPropertyList.scss`**

```scss
.FilterPropertyList {
    width: 180px;
    border-right: 1px solid rgba(var(--center-channel-color-rgb), 0.08);
    overflow-y: auto;
    flex-shrink: 0;

    &__header {
        padding: 12px 16px 8px;
        font-size: 12px;
        font-weight: 600;
        color: rgba(var(--center-channel-color-rgb), 0.56);
        text-transform: uppercase;
    }

    &__item {
        display: flex;
        align-items: center;
        padding: 8px 16px;
        cursor: pointer;
        font-size: 14px;
        color: rgba(var(--center-channel-color-rgb), 0.72);
        border-left: 3px solid transparent;
        transition: background-color 0.1s ease;

        &:hover {
            background-color: rgba(var(--center-channel-color-rgb), 0.04);
        }

        &--active {
            border-left-color: rgb(var(--button-bg-rgb));
            background-color: rgba(var(--button-bg-rgb), 0.08);
            color: rgb(var(--button-bg-rgb));
            font-weight: 600;
        }

        &--has-filter {
            font-weight: 600;
        }
    }

    &__name {
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    &__badge {
        margin-left: 8px;
        font-size: 11px;
        font-weight: 600;
        color: rgb(var(--button-bg-rgb));
        background-color: rgba(var(--button-bg-rgb), 0.12);
        border-radius: 10px;
        padding: 1px 6px;
        min-width: 18px;
        text-align: center;
    }

    &__empty {
        padding: 16px;
        font-size: 13px;
        color: rgba(var(--center-channel-color-rgb), 0.48);
        text-align: center;
    }
}
```

**Step 2: Create `filterPropertyList.tsx`**

```tsx
// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react'
import {useIntl} from 'react-intl'

import {IPropertyTemplate} from '../../../blocks/board'
import {FilterClause} from '../../../blocks/filterClause'

import './filterPropertyList.scss'

type Props = {
    properties: IPropertyTemplate[]
    activeFilters: FilterClause[]
    selectedPropertyId: string
    onSelectProperty: (propertyId: string) => void
}

const FilterPropertyList = (props: Props): React.JSX.Element => {
    const {properties, activeFilters, selectedPropertyId, onSelectProperty} = props
    const intl = useIntl()

    const getFilterCount = (propertyId: string): number => {
        const clause = activeFilters.find((f) => f.propertyId === propertyId)
        return clause?.values.length || 0
    }

    if (properties.length === 0) {
        return (
            <div className='FilterPropertyList'>
                <div className='FilterPropertyList__empty'>
                    {intl.formatMessage({id: 'FilterPanel.no-properties', defaultMessage: 'No filterable properties'})}
                </div>
            </div>
        )
    }

    return (
        <div className='FilterPropertyList'>
            <div className='FilterPropertyList__header'>
                {intl.formatMessage({id: 'FilterPanel.title', defaultMessage: 'Filter'})}
            </div>
            {properties.map((property) => {
                const filterCount = getFilterCount(property.id)
                const isActive = property.id === selectedPropertyId
                const hasFilter = filterCount > 0

                let className = 'FilterPropertyList__item'
                if (isActive) {
                    className += ' FilterPropertyList__item--active'
                }
                if (hasFilter) {
                    className += ' FilterPropertyList__item--has-filter'
                }

                return (
                    <div
                        key={property.id}
                        className={className}
                        onClick={() => onSelectProperty(property.id)}
                    >
                        <span className='FilterPropertyList__name'>
                            {property.name}
                        </span>
                        {hasFilter && (
                            <span className='FilterPropertyList__badge'>
                                {filterCount}
                            </span>
                        )}
                    </div>
                )
            })}
        </div>
    )
}

export default React.memo(FilterPropertyList)
```

**Step 3: Commit**

```bash
git add webapp/src/components/viewHeader/filterPanel/filterPropertyList.*
git commit -m "feat(filter): add FilterPropertyList left panel component"
```

---

### Task 3: Create FilterValuePanel — select/multiSelect type (core)

The right panel. Start with the most common case: `select` and `multiSelect` properties (filterValueType = 'options').

**Files:**
- Create: `webapp/src/components/viewHeader/filterPanel/filterValuePanel.tsx`
- Create: `webapp/src/components/viewHeader/filterPanel/filterValuePanel.scss`

**Step 1: Create `filterValuePanel.scss`**

```scss
.FilterValuePanel {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    overflow: hidden;

    &__search {
        padding: 8px 12px;
        border-bottom: 1px solid rgba(var(--center-channel-color-rgb), 0.08);

        input {
            width: 100%;
            padding: 6px 8px 6px 28px;
            border: 1px solid rgba(var(--center-channel-color-rgb), 0.16);
            border-radius: 4px;
            font-size: 13px;
            outline: none;
            background: rgba(var(--center-channel-color-rgb), 0.04);
            color: rgb(var(--center-channel-color-rgb));

            &:focus {
                border-color: rgb(var(--button-bg-rgb));
            }

            &::placeholder {
                color: rgba(var(--center-channel-color-rgb), 0.4);
            }
        }
    }

    &__search-wrapper {
        position: relative;

        .search-icon {
            position: absolute;
            left: 8px;
            top: 50%;
            transform: translateY(-50%);
            color: rgba(var(--center-channel-color-rgb), 0.4);
            font-size: 14px;
        }
    }

    &__list {
        flex: 1;
        overflow-y: auto;
        padding: 4px 0;
    }

    &__item {
        display: flex;
        align-items: center;
        padding: 6px 12px;
        cursor: pointer;
        gap: 8px;
        font-size: 14px;
        color: rgba(var(--center-channel-color-rgb), 0.88);

        &:hover {
            background-color: rgba(var(--center-channel-color-rgb), 0.04);
        }

        &--checked {
            font-weight: 500;
        }
    }

    &__checkbox {
        width: 16px;
        height: 16px;
        border: 1px solid rgba(var(--center-channel-color-rgb), 0.24);
        border-radius: 3px;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;

        &--checked {
            background-color: rgb(var(--button-bg-rgb));
            border-color: rgb(var(--button-bg-rgb));
            color: #fff;
        }
    }

    &__color-chip {
        width: 16px;
        height: 16px;
        border-radius: 50%;
        flex-shrink: 0;
    }

    &__avatar {
        width: 20px;
        height: 20px;
        border-radius: 50%;
        flex-shrink: 0;
    }

    &__empty {
        padding: 24px 16px;
        font-size: 13px;
        color: rgba(var(--center-channel-color-rgb), 0.48);
        text-align: center;
    }

    &__text-input {
        padding: 12px;

        input {
            width: 100%;
            padding: 8px;
            border: 1px solid rgba(var(--center-channel-color-rgb), 0.16);
            border-radius: 4px;
            font-size: 14px;
            outline: none;
            color: rgb(var(--center-channel-color-rgb));

            &:focus {
                border-color: rgb(var(--button-bg-rgb));
            }
        }
    }
}
```

**Step 2: Create `filterValuePanel.tsx`**

This is the core component. It dispatches to different value renderers based on `filterValueType`.

```tsx
// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useState, useMemo, useCallback} from 'react'
import {useIntl} from 'react-intl'

import {Board, IPropertyTemplate} from '../../../blocks/board'
import {BoardView} from '../../../blocks/boardView'
import {FilterClause, createFilterClause} from '../../../blocks/filterClause'
import {createFilterGroup, isAFilterGroupInstance} from '../../../blocks/filterGroup'
import mutator from '../../../mutator'
import propsRegistry from '../../../properties'

import DateFilter from '../dateFilter'

import './filterValuePanel.scss'

type Props = {
    board: Board
    activeView: BoardView
    property: IPropertyTemplate | null
    activeFilters: FilterClause[]
}

const FilterValuePanel = (props: Props): React.JSX.Element => {
    const {board, activeView, property, activeFilters} = props
    const intl = useIntl()
    const [searchText, setSearchText] = useState('')

    // Reset search when property changes
    React.useEffect(() => {
        setSearchText('')
    }, [property?.id])

    const currentFilter = useMemo(() => {
        if (!property) {
            return null
        }
        return activeFilters.find((f) => f.propertyId === property.id) || null
    }, [property, activeFilters])

    const checkedValues = useMemo(() => {
        return new Set(currentFilter?.values || [])
    }, [currentFilter])

    const toggleValue = useCallback((valueId: string) => {
        if (!property) {
            return
        }

        const filterGroup = createFilterGroup(activeView.fields.filter)
        const existingIndex = filterGroup.filters.findIndex(
            (f) => !isAFilterGroupInstance(f) && (f as FilterClause).propertyId === property.id,
        )

        if (existingIndex >= 0) {
            const clause = filterGroup.filters[existingIndex] as FilterClause
            if (clause.values.includes(valueId)) {
                clause.values = clause.values.filter((v) => v !== valueId)
                // Remove clause if no values left
                if (clause.values.length === 0) {
                    filterGroup.filters.splice(existingIndex, 1)
                }
            } else {
                clause.values.push(valueId)
            }
        } else {
            // Create new clause
            const newClause = createFilterClause()
            newClause.propertyId = property.id
            newClause.condition = 'includes'
            newClause.values = [valueId]
            filterGroup.filters.push(newClause)
        }

        mutator.changeViewFilter(board.id, activeView.id, activeView.fields.filter, filterGroup)
    }, [property, activeView, board.id])

    const setTextFilter = useCallback((text: string) => {
        if (!property) {
            return
        }

        const filterGroup = createFilterGroup(activeView.fields.filter)
        const existingIndex = filterGroup.filters.findIndex(
            (f) => !isAFilterGroupInstance(f) && (f as FilterClause).propertyId === property.id,
        )

        if (text) {
            if (existingIndex >= 0) {
                const clause = filterGroup.filters[existingIndex] as FilterClause
                clause.condition = 'contains'
                clause.values = [text]
            } else {
                const newClause = createFilterClause()
                newClause.propertyId = property.id
                newClause.condition = 'contains'
                newClause.values = [text]
                filterGroup.filters.push(newClause)
            }
        } else if (existingIndex >= 0) {
            filterGroup.filters.splice(existingIndex, 1)
        }

        mutator.changeViewFilter(board.id, activeView.id, activeView.fields.filter, filterGroup)
    }, [property, activeView, board.id])

    if (!property) {
        return (
            <div className='FilterValuePanel'>
                <div className='FilterValuePanel__empty'>
                    {intl.formatMessage({id: 'FilterPanel.no-properties', defaultMessage: 'No filterable properties'})}
                </div>
            </div>
        )
    }

    const propertyType = propsRegistry.get(property.type)
    const {filterValueType} = propertyType

    // --- options type (select/multiSelect) ---
    if (filterValueType === 'options') {
        const options = property.options || []
        const filtered = searchText
            ? options.filter((o) => o.value.toLowerCase().includes(searchText.toLowerCase()))
            : options

        return (
            <div className='FilterValuePanel'>
                <div className='FilterValuePanel__search'>
                    <div className='FilterValuePanel__search-wrapper'>
                        <input
                            type='text'
                            placeholder={intl.formatMessage({id: 'FilterPanel.search-placeholder', defaultMessage: 'Search...'})}
                            value={searchText}
                            onChange={(e) => setSearchText(e.target.value)}
                        />
                    </div>
                </div>
                <div className='FilterValuePanel__list'>
                    {filtered.length === 0 && (
                        <div className='FilterValuePanel__empty'>
                            {intl.formatMessage({id: 'FilterPanel.no-values', defaultMessage: 'No values available'})}
                        </div>
                    )}
                    {filtered.map((option) => {
                        const isChecked = checkedValues.has(option.id)
                        return (
                            <div
                                key={option.id}
                                className={`FilterValuePanel__item ${isChecked ? 'FilterValuePanel__item--checked' : ''}`}
                                onClick={() => toggleValue(option.id)}
                            >
                                <div className={`FilterValuePanel__checkbox ${isChecked ? 'FilterValuePanel__checkbox--checked' : ''}`}>
                                    {isChecked && <span>&#10003;</span>}
                                </div>
                                {option.color && (
                                    <div
                                        className='FilterValuePanel__color-chip'
                                        style={{backgroundColor: `var(--propColor${option.color.charAt(0).toUpperCase() + option.color.slice(1)})`}}
                                    />
                                )}
                                <span>{option.value}</span>
                            </div>
                        )
                    })}
                </div>
            </div>
        )
    }

    // --- person type (person/multiPerson/createdBy/updatedBy) ---
    if (filterValueType === 'person') {
        return (
            <PersonValueList
                board={board}
                activeView={activeView}
                property={property}
                checkedValues={checkedValues}
                toggleValue={toggleValue}
                searchText={searchText}
                setSearchText={setSearchText}
            />
        )
    }

    // --- boolean type (checkbox) ---
    if (filterValueType === 'boolean') {
        return (
            <BooleanValueList
                board={board}
                activeView={activeView}
                property={property}
                currentFilter={currentFilter}
            />
        )
    }

    // --- text type ---
    if (filterValueType === 'text') {
        return (
            <TextValueInput
                currentFilter={currentFilter}
                setTextFilter={setTextFilter}
            />
        )
    }

    // --- date type ---
    if (filterValueType === 'date') {
        // Reuse existing DateFilter component
        // We need a filter clause to pass to DateFilter
        if (currentFilter) {
            return (
                <div className='FilterValuePanel'>
                    <div className='FilterValuePanel__list' style={{padding: '12px'}}>
                        <DateFilter
                            view={activeView}
                            filter={currentFilter}
                        />
                    </div>
                </div>
            )
        }

        // No active filter yet — create placeholder
        return (
            <div className='FilterValuePanel'>
                <div className='FilterValuePanel__empty'>
                    {intl.formatMessage({id: 'FilterPanel.no-values', defaultMessage: 'No values available'})}
                </div>
            </div>
        )
    }

    // --- fallback for card or unsupported types ---
    return (
        <div className='FilterValuePanel'>
            <div className='FilterValuePanel__empty'>
                {intl.formatMessage({id: 'FilterPanel.no-values', defaultMessage: 'No values available'})}
            </div>
        </div>
    )
}

// ========================================
// Sub-components (same file to keep simple)
// ========================================

// --- Person Value List ---
import {useAppSelector} from '../../../store/hooks'
import {getBoardUsers} from '../../../store/users'

type PersonValueListProps = {
    board: Board
    activeView: BoardView
    property: IPropertyTemplate
    checkedValues: Set<string>
    toggleValue: (valueId: string) => void
    searchText: string
    setSearchText: (text: string) => void
}

const PersonValueList = (props: PersonValueListProps): React.JSX.Element => {
    const {checkedValues, toggleValue, searchText, setSearchText} = props
    const intl = useIntl()
    const boardUsers = useAppSelector(getBoardUsers)

    const users = useMemo(() => {
        const userList = Object.values(boardUsers || {})
        if (!searchText) {
            return userList
        }
        return userList.filter((u) =>
            u.username.toLowerCase().includes(searchText.toLowerCase()),
        )
    }, [boardUsers, searchText])

    return (
        <div className='FilterValuePanel'>
            <div className='FilterValuePanel__search'>
                <div className='FilterValuePanel__search-wrapper'>
                    <input
                        type='text'
                        placeholder={intl.formatMessage({id: 'FilterPanel.search-placeholder', defaultMessage: 'Search...'})}
                        value={searchText}
                        onChange={(e) => setSearchText(e.target.value)}
                    />
                </div>
            </div>
            <div className='FilterValuePanel__list'>
                {users.length === 0 && (
                    <div className='FilterValuePanel__empty'>
                        {intl.formatMessage({id: 'FilterPanel.no-values', defaultMessage: 'No values available'})}
                    </div>
                )}
                {users.map((user) => {
                    const isChecked = checkedValues.has(user.id)
                    return (
                        <div
                            key={user.id}
                            className={`FilterValuePanel__item ${isChecked ? 'FilterValuePanel__item--checked' : ''}`}
                            onClick={() => toggleValue(user.id)}
                        >
                            <div className={`FilterValuePanel__checkbox ${isChecked ? 'FilterValuePanel__checkbox--checked' : ''}`}>
                                {isChecked && <span>&#10003;</span>}
                            </div>
                            <span>{user.username}</span>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

// --- Boolean Value List ---
type BooleanValueListProps = {
    board: Board
    activeView: BoardView
    property: IPropertyTemplate
    currentFilter: FilterClause | null
}

const BooleanValueList = (props: BooleanValueListProps): React.JSX.Element => {
    const {board, activeView, property, currentFilter} = props
    const intl = useIntl()

    const currentCondition = currentFilter?.condition || null

    const toggleBoolean = (condition: 'isSet' | 'isNotSet') => {
        const filterGroup = createFilterGroup(activeView.fields.filter)
        const existingIndex = filterGroup.filters.findIndex(
            (f) => !isAFilterGroupInstance(f) && (f as FilterClause).propertyId === property.id,
        )

        if (existingIndex >= 0) {
            const clause = filterGroup.filters[existingIndex] as FilterClause
            if (clause.condition === condition) {
                // Uncheck — remove filter
                filterGroup.filters.splice(existingIndex, 1)
            } else {
                clause.condition = condition
                clause.values = []
            }
        } else {
            const newClause = createFilterClause()
            newClause.propertyId = property.id
            newClause.condition = condition
            newClause.values = []
            filterGroup.filters.push(newClause)
        }

        mutator.changeViewFilter(board.id, activeView.id, activeView.fields.filter, filterGroup)
    }

    return (
        <div className='FilterValuePanel'>
            <div className='FilterValuePanel__list'>
                <div
                    className={`FilterValuePanel__item ${currentCondition === 'isSet' ? 'FilterValuePanel__item--checked' : ''}`}
                    onClick={() => toggleBoolean('isSet')}
                >
                    <div className={`FilterValuePanel__checkbox ${currentCondition === 'isSet' ? 'FilterValuePanel__checkbox--checked' : ''}`}>
                        {currentCondition === 'isSet' && <span>&#10003;</span>}
                    </div>
                    <span>{intl.formatMessage({id: 'FilterPanel.checked', defaultMessage: 'Checked'})}</span>
                </div>
                <div
                    className={`FilterValuePanel__item ${currentCondition === 'isNotSet' ? 'FilterValuePanel__item--checked' : ''}`}
                    onClick={() => toggleBoolean('isNotSet')}
                >
                    <div className={`FilterValuePanel__checkbox ${currentCondition === 'isNotSet' ? 'FilterValuePanel__checkbox--checked' : ''}`}>
                        {currentCondition === 'isNotSet' && <span>&#10003;</span>}
                    </div>
                    <span>{intl.formatMessage({id: 'FilterPanel.unchecked', defaultMessage: 'Unchecked'})}</span>
                </div>
            </div>
        </div>
    )
}

// --- Text Value Input ---
type TextValueInputProps = {
    currentFilter: FilterClause | null
    setTextFilter: (text: string) => void
}

const TextValueInput = (props: TextValueInputProps): React.JSX.Element => {
    const {currentFilter, setTextFilter} = props
    const intl = useIntl()
    const [inputValue, setInputValue] = useState(currentFilter?.values[0] || '')
    const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = e.target.value
        setInputValue(newValue)

        if (debounceRef.current) {
            clearTimeout(debounceRef.current)
        }
        debounceRef.current = setTimeout(() => {
            setTextFilter(newValue)
        }, 300)
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            if (debounceRef.current) {
                clearTimeout(debounceRef.current)
            }
            setTextFilter(inputValue)
        }
    }

    return (
        <div className='FilterValuePanel'>
            <div className='FilterValuePanel__text-input'>
                <input
                    type='text'
                    placeholder={intl.formatMessage({id: 'FilterPanel.search-placeholder', defaultMessage: 'Search...'})}
                    value={inputValue}
                    onChange={handleChange}
                    onKeyDown={handleKeyDown}
                />
            </div>
        </div>
    )
}

export default React.memo(FilterValuePanel)
```

**Important notes for implementer:**
- `getBoardUsers` selector: check `webapp/src/store/users.ts` for the exact selector name. If it doesn't exist, you may need to use `getUser` or a similar selector that provides users list. Verify by reading the file.
- The `option.color` values in the codebase use format like `propColorBrown`, `propColorGreen`, etc. Check `webapp/src/theme.ts` or SCSS variables for exact variable names. The color chip may need a different approach — check how existing select property values render colors (look at `webapp/src/components/properties/select/select.tsx` or `webapp/src/widgets/label.tsx`).

**Step 3: Commit**

```bash
git add webapp/src/components/viewHeader/filterPanel/filterValuePanel.*
git commit -m "feat(filter): add FilterValuePanel with select/multiSelect/person/boolean/text/date support"
```

---

### Task 4: Wire FilterPanel into ViewHeader

Replace the old `FilterComponent` with the new `FilterPanel` in `viewHeader.tsx`.

**Files:**
- Modify: `webapp/src/components/viewHeader/viewHeader.tsx`

**Step 1: Update the import**

In `viewHeader.tsx`, change line 45:
```
// OLD:
import FilterComponent from './filterComponent'

// NEW:
import FilterPanel from './filterPanel'
```

**Step 2: Update the JSX rendering**

Replace lines 181-203 in `viewHeader.tsx`:

```tsx
// OLD:
<ModalWrapper>
    <Button
        active={hasFilter}
        onClick={() => setShowFilter(!showFilter)}
        onMouseOver={() => setLockFilterOnClose(true)}
        onMouseLeave={() => setLockFilterOnClose(false)}
    >
        <FormattedMessage
            id='ViewHeader.filter'
            defaultMessage='Filter'
        />
    </Button>
    {showFilter &&
    <FilterComponent
        board={board}
        activeView={activeView}
        onClose={() => {
            if (!lockFilterOnClose) {
                setShowFilter(false)
            }
        }}
    />}
</ModalWrapper>

// NEW:
<ModalWrapper>
    <Button
        active={hasFilter}
        onClick={() => setShowFilter(!showFilter)}
        onMouseOver={() => setLockFilterOnClose(true)}
        onMouseLeave={() => setLockFilterOnClose(false)}
    >
        <FormattedMessage
            id='ViewHeader.filter'
            defaultMessage='Filter'
        />
    </Button>
    {showFilter &&
    <FilterPanel
        board={board}
        activeView={activeView}
        onClose={() => {
            if (!lockFilterOnClose) {
                setShowFilter(false)
            }
        }}
    />}
</ModalWrapper>
```

**Step 3: Remove unused lockFilterOnClose if not needed**

Note: Keep `lockFilterOnClose` for now — the `DateFilter` sub-modal in the new FilterValuePanel still uses `ModalWrapper` which could trigger the same close-on-click issue.

**Step 4: Verify the build compiles**

Run: `cd webapp && npm run check` (or the project's type-check command)
Expected: No TypeScript errors related to FilterPanel/FilterComponent

**Step 5: Commit**

```bash
git add webapp/src/components/viewHeader/viewHeader.tsx
git commit -m "feat(filter): wire FilterPanel into ViewHeader, replacing FilterComponent"
```

---

### Task 5: Verify person selector works correctly

The person value list uses `getBoardUsers` from the store. Verify this selector exists and provides the correct data.

**Files:**
- Possibly modify: `webapp/src/components/viewHeader/filterPanel/filterValuePanel.tsx`

**Step 1: Check the users store**

Run: Read `webapp/src/store/users.ts` and find available selectors for getting board member users.

Common patterns in Focalboard:
- `getBoardUsers` — may return users for current board
- `getUsers` — may return all loaded users
- Look for how `multipersonFilterValue.tsx` and `PersonSelector` component get their user data

**Step 2: Adjust the PersonValueList if needed**

If `getBoardUsers` doesn't exist or returns wrong format, use the correct selector. The goal is to list all users who are members of the current board.

**Step 3: Verify manually**

Run the dev server and test that person properties show user list with checkboxes.

**Step 4: Commit if changes were needed**

```bash
git add webapp/src/components/viewHeader/filterPanel/filterValuePanel.tsx
git commit -m "fix(filter): adjust person selector for correct user data source"
```

---

### Task 6: Verify option colors render correctly

The `option.color` field stores values like `propColorBrown`. Check how existing code renders these.

**Files:**
- Possibly modify: `webapp/src/components/viewHeader/filterPanel/filterValuePanel.tsx`

**Step 1: Check how Label widget renders colors**

Read: `webapp/src/widgets/label.tsx` and `webapp/src/widgets/label.scss`
Read: `webapp/src/components/properties/select/select.tsx`

The existing codebase uses CSS classes like `propColorBrown`, `propColorGreen`, etc. on a `Label` element. The color is applied via a CSS class, not an inline style.

**Step 2: Update the color chip rendering**

If the color is a CSS class name (not a CSS variable), update the color chip in FilterValuePanel:

```tsx
// Instead of inline style:
<div
    className='FilterValuePanel__color-chip'
    style={{backgroundColor: `var(--propColor...)`}}
/>

// Use CSS class:
<div className={`FilterValuePanel__color-chip ${option.color}`} />
```

And in the SCSS, add styles to support the `propColor*` classes on the chip, or import the existing label color SCSS.

**Step 3: Commit if changes were needed**

```bash
git add webapp/src/components/viewHeader/filterPanel/
git commit -m "fix(filter): use correct CSS class for option color rendering"
```

---

### Task 7: Write tests for FilterPanel

**Files:**
- Create: `webapp/src/components/viewHeader/filterPanel/filterPanel.test.tsx`

**Step 1: Write tests**

Follow existing test pattern from `filterComponent.test.tsx`:

```tsx
// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react'
import {render, screen} from '@testing-library/react'
import {Provider as ReduxProvider} from 'react-redux'
import {mocked} from 'jest-mock'
import '@testing-library/jest-dom'
import userEvent from '@testing-library/user-event'

import {TestBlockFactory} from '../../../test/testBlockFactory'
import mutator from '../../../mutator'
import {wrapIntl, mockStateStore} from '../../../testUtils'

import FilterPanel from './filterPanel'

jest.mock('../../../mutator')
const mockedMutator = mocked(mutator, true)

const board = TestBlockFactory.createBoard()
const activeView = TestBlockFactory.createBoardView(board)

// Setup: board has 3 select properties with canFilter=true
// board.cardProperties[0] = {id: 'property1', name: 'Property 1', type: 'select', options: [{id: 'value1', value: 'value 1', color: 'propColorBrown'}]}

const state = {
    users: {
        me: {
            id: 'user-id-1',
            username: 'username_1',
        },
        boardUsers: {
            'user-id-1': {id: 'user-id-1', username: 'username_1'},
        },
    },
}

describe('FilterPanel', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        activeView.fields.filter = {operation: 'and', filters: []}
    })

    test('renders property list with filterable properties', () => {
        const store = mockStateStore([], state)
        render(
            wrapIntl(
                <ReduxProvider store={store}>
                    <FilterPanel
                        board={board}
                        activeView={activeView}
                        onClose={jest.fn()}
                    />
                </ReduxProvider>,
            ),
        )

        // Should show all 3 properties from TestBlockFactory
        expect(screen.getByText('Property 1')).toBeInTheDocument()
        expect(screen.getByText('Property 2')).toBeInTheDocument()
        expect(screen.getByText('Property 3')).toBeInTheDocument()
    })

    test('clicking a property shows its options', async () => {
        const store = mockStateStore([], state)
        render(
            wrapIntl(
                <ReduxProvider store={store}>
                    <FilterPanel
                        board={board}
                        activeView={activeView}
                        onClose={jest.fn()}
                    />
                </ReduxProvider>,
            ),
        )

        // First property is auto-selected, should show its options
        expect(screen.getByText('value 1')).toBeInTheDocument()
    })

    test('checking a value calls mutator.changeViewFilter', async () => {
        const store = mockStateStore([], state)
        render(
            wrapIntl(
                <ReduxProvider store={store}>
                    <FilterPanel
                        board={board}
                        activeView={activeView}
                        onClose={jest.fn()}
                    />
                </ReduxProvider>,
            ),
        )

        // Click on option value to toggle it
        const valueItem = screen.getByText('value 1')
        await userEvent.click(valueItem)

        expect(mockedMutator.changeViewFilter).toHaveBeenCalledTimes(1)
    })

    test('shows existing filter state as checked', () => {
        activeView.fields.filter = {
            operation: 'and',
            filters: [{
                propertyId: board.cardProperties[0].id,
                condition: 'includes',
                values: ['value1'],
            }],
        }

        const store = mockStateStore([], state)
        render(
            wrapIntl(
                <ReduxProvider store={store}>
                    <FilterPanel
                        board={board}
                        activeView={activeView}
                        onClose={jest.fn()}
                    />
                </ReduxProvider>,
            ),
        )

        // The badge should show filter count
        expect(screen.getByText('1')).toBeInTheDocument()
    })
})
```

**Step 2: Run tests**

Run: `cd webapp && npx jest --testPathPattern='filterPanel/filterPanel.test' --no-coverage`
Expected: All tests pass

**Step 3: Fix any test failures**

Adjust test setup (state shape, mock structure) as needed based on actual selectors used.

**Step 4: Commit**

```bash
git add webapp/src/components/viewHeader/filterPanel/filterPanel.test.tsx
git commit -m "test(filter): add FilterPanel component tests"
```

---

### Task 8: Update snapshot tests

The old filter components have snapshot tests that reference the old UI. Update them.

**Files:**
- Delete: `webapp/src/components/viewHeader/__snapshots__/filterComponent.test.tsx.snap` (if exists)
- Delete: `webapp/src/components/viewHeader/__snapshots__/filterEntry.test.tsx.snap` (if exists)
- Delete: `webapp/src/components/viewHeader/__snapshots__/filterValue.test.tsx.snap` (if exists)

**Step 1: Remove old snapshots**

```bash
rm -f webapp/src/components/viewHeader/__snapshots__/filterComponent.test.tsx.snap
rm -f webapp/src/components/viewHeader/__snapshots__/filterEntry.test.tsx.snap
rm -f webapp/src/components/viewHeader/__snapshots__/filterValue.test.tsx.snap
```

**Step 2: Check if old test files reference FilterComponent**

If `filterComponent.test.tsx`, `filterEntry.test.tsx`, `filterValue.test.tsx` still import the old components, either:
- Delete these test files (they test deleted components)
- Or update them to test the new components

Recommended: Delete old test files and rely on the new `filterPanel.test.tsx`.

```bash
rm -f webapp/src/components/viewHeader/filterComponent.test.tsx
rm -f webapp/src/components/viewHeader/filterEntry.test.tsx
rm -f webapp/src/components/viewHeader/filterValue.test.tsx
```

**Step 3: Run full test suite to check for broken imports**

Run: `cd webapp && npx jest --no-coverage 2>&1 | head -50`
Expected: No failures related to missing filterComponent/filterEntry/filterValue imports

**Step 4: Commit**

```bash
git add -A webapp/src/components/viewHeader/
git commit -m "test(filter): remove old filter component tests, update snapshots"
```

---

### Task 9: Clean up old filter files

Remove the old filter component files that are no longer used.

**Files:**
- Delete: `webapp/src/components/viewHeader/filterComponent.tsx`
- Delete: `webapp/src/components/viewHeader/filterComponent.scss`
- Delete: `webapp/src/components/viewHeader/filterEntry.tsx`
- Delete: `webapp/src/components/viewHeader/filterEntry.scss`
- Delete: `webapp/src/components/viewHeader/filterValue.tsx`
- Delete: `webapp/src/components/viewHeader/filterValue.scss`

**Step 1: Check for other imports of old components**

Run: Search for `filterComponent`, `filterEntry`, `filterValue` imports across the codebase (excluding test files and the deleted files themselves).

```bash
grep -r "from.*filterComponent\|from.*filterEntry\|from.*filterValue" webapp/src/ --include="*.tsx" --include="*.ts" | grep -v test | grep -v __snapshots__
```

Expected: Only `viewHeader.tsx` (already updated) should reference these. If other files reference them, update those imports.

**Step 2: Delete old files**

```bash
rm webapp/src/components/viewHeader/filterComponent.tsx
rm webapp/src/components/viewHeader/filterComponent.scss
rm webapp/src/components/viewHeader/filterEntry.tsx
rm webapp/src/components/viewHeader/filterEntry.scss
rm webapp/src/components/viewHeader/filterValue.tsx
rm webapp/src/components/viewHeader/filterValue.scss
```

**Step 3: Verify build**

Run: `cd webapp && npm run check`
Expected: No TypeScript errors

**Step 4: Commit**

```bash
git add -A webapp/src/components/viewHeader/
git commit -m "refactor(filter): remove old FilterComponent/FilterEntry/FilterValue files"
```

---

### Task 10: End-to-end manual verification

**Step 1: Start dev server**

Run the development server per project instructions.

**Step 2: Verify the following scenarios**

1. **기본 동작**: 필터 버튼 클릭 → 2패널 팝오버 표시
2. **속성 선택**: 좌측 패널에서 다른 속성 클릭 → 우측 값 목록 변경
3. **select 속성**: 체크박스 클릭 → 즉시 필터 적용, 카드 필터링 확인
4. **다중 선택**: 같은 속성에서 여러 값 체크 → OR 로직 확인
5. **다중 속성**: 다른 속성에서도 값 체크 → AND 로직 확인
6. **필터 해제**: 모든 체크 해제 → 필터 비활성화, 모든 카드 표시
7. **필터 유지**: 팝오버 닫고 다시 열기 → 기존 체크 상태 유지
8. **뱃지**: 필터 적용된 속성에 숫자 뱃지 표시
9. **외부 클릭**: 팝오버 외부 클릭 → 팝오버 닫힘
10. **Undo/Redo**: Ctrl+Z로 필터 변경 되돌리기

**Step 3: Fix any issues found**

Address any visual or functional issues.

**Step 4: Final commit**

```bash
git add -A
git commit -m "fix(filter): address issues found during manual verification"
```

---

## Summary of all tasks

| Task | Description | New Files | Modified Files |
|---|---|---|---|
| 1 | FilterPanel container + SCSS | `filterPanel/filterPanel.tsx`, `filterPanel.scss`, `index.ts` | — |
| 2 | FilterPropertyList (left panel) | `filterPanel/filterPropertyList.tsx`, `filterPropertyList.scss` | — |
| 3 | FilterValuePanel (all types) | `filterPanel/filterValuePanel.tsx`, `filterValuePanel.scss` | — |
| 4 | Wire into ViewHeader | — | `viewHeader.tsx` |
| 5 | Verify person selector | — | possibly `filterValuePanel.tsx` |
| 6 | Verify option colors | — | possibly `filterValuePanel.tsx` |
| 7 | Write tests | `filterPanel/filterPanel.test.tsx` | — |
| 8 | Update snapshot tests | — | delete old test/snapshot files |
| 9 | Clean up old files | — | delete old filter files |
| 10 | Manual verification | — | bug fixes as needed |
