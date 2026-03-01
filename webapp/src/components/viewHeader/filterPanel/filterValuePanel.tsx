// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useState, useMemo, useCallback, useEffect, useRef} from 'react'
import {useIntl} from 'react-intl'
import {useSelector} from 'react-redux'

import {Board, IPropertyTemplate, IPropertyOption} from '../../../blocks/board'
import {BoardView} from '../../../blocks/boardView'
import {FilterClause, FilterCondition, createFilterClause} from '../../../blocks/filterClause'
import {createFilterGroup, isAFilterGroupInstance} from '../../../blocks/filterGroup'
import mutator from '../../../mutator'
import propsRegistry from '../../../properties'
import {getBoardUsersList} from '../../../store/users'
import Label from '../../../widgets/label'

import MomentLocaleUtils from 'react-day-picker/moment'
import DayPicker from 'react-day-picker/DayPicker'

import 'react-day-picker/lib/style.css'

import {Utils} from '../../../utils'

import './filterValuePanel.scss'

type Props = {
    board: Board
    activeView: BoardView
    propertyTemplate: IPropertyTemplate | undefined
}

const FilterValuePanel = (props: Props): React.JSX.Element => {
    const {board, activeView, propertyTemplate} = props
    const intl = useIntl()

    if (!propertyTemplate) {
        return (
            <div className='FilterValuePanel'>
                <div className='FilterValuePanel__empty'>
                    {intl.formatMessage({
                        id: 'FilterPanel.select-property',
                        defaultMessage: 'Select a property to filter',
                    })}
                </div>
            </div>
        )
    }

    const propertyType = propsRegistry.get(propertyTemplate.type)
    const filterValueType = propertyType.filterValueType

    switch (filterValueType) {
    case 'options':
        return (
            <OptionsFilterPanel
                board={board}
                activeView={activeView}
                propertyTemplate={propertyTemplate}
            />
        )
    case 'person':
        return (
            <PersonFilterPanel
                board={board}
                activeView={activeView}
                propertyTemplate={propertyTemplate}
            />
        )
    case 'boolean':
        return (
            <BooleanFilterPanel
                board={board}
                activeView={activeView}
                propertyTemplate={propertyTemplate}
            />
        )
    case 'text':
        return (
            <TextFilterPanel
                board={board}
                activeView={activeView}
                propertyTemplate={propertyTemplate}
            />
        )
    case 'date':
        return (
            <DateFilterPanel
                board={board}
                activeView={activeView}
                propertyTemplate={propertyTemplate}
            />
        )
    default:
        return (
            <div className='FilterValuePanel'>
                <div className='FilterValuePanel__empty'>
                    {intl.formatMessage({
                        id: 'FilterPanel.unsupported-type',
                        defaultMessage: 'This property type does not support filtering',
                    })}
                </div>
            </div>
        )
    }
}

// ---- Options Filter (select / multiSelect) ----

type OptionsFilterPanelProps = {
    board: Board
    activeView: BoardView
    propertyTemplate: IPropertyTemplate
}

const OptionsFilterPanel = (props: OptionsFilterPanelProps): React.JSX.Element => {
    const {board, activeView, propertyTemplate} = props
    const intl = useIntl()
    const [searchText, setSearchText] = useState('')

    const existingClause = useMemo(() => {
        return findClauseForProperty(activeView, propertyTemplate.id)
    }, [activeView, propertyTemplate.id])

    const selectedValues = useMemo(() => {
        return existingClause?.values || []
    }, [existingClause])

    const filteredOptions = useMemo(() => {
        if (!searchText) {
            return propertyTemplate.options
        }
        const lower = searchText.toLowerCase()
        return propertyTemplate.options.filter((o) =>
            o.value.toLowerCase().includes(lower),
        )
    }, [propertyTemplate.options, searchText])

    const handleToggleOption = useCallback((optionId: string) => {
        toggleFilterValue(board.id, activeView, propertyTemplate.id, optionId, selectedValues, 'includes')
    }, [board.id, activeView, propertyTemplate.id, selectedValues])

    return (
        <div className='FilterValuePanel'>
            <div className='FilterValuePanel__search'>
                <input
                    type='text'
                    placeholder={intl.formatMessage({
                        id: 'FilterPanel.search-options',
                        defaultMessage: 'Search options...',
                    })}
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                />
            </div>
            <div className='FilterValuePanel__list'>
                {filteredOptions.map((option) => (
                    <OptionItem
                        key={option.id}
                        option={option}
                        isChecked={selectedValues.includes(option.id)}
                        onToggle={handleToggleOption}
                    />
                ))}
                {filteredOptions.length === 0 && (
                    <div className='FilterValuePanel__empty'>
                        {intl.formatMessage({
                            id: 'FilterPanel.no-matching-options',
                            defaultMessage: 'No matching options',
                        })}
                    </div>
                )}
            </div>
        </div>
    )
}

type OptionItemProps = {
    option: IPropertyOption
    isChecked: boolean
    onToggle: (optionId: string) => void
}

const OptionItem = React.memo((props: OptionItemProps): React.JSX.Element => {
    const {option, isChecked, onToggle} = props
    return (
        <div
            className='FilterValuePanel__option'
            onClick={() => onToggle(option.id)}
            role='checkbox'
            aria-checked={isChecked}
            tabIndex={0}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onToggle(option.id)
                }
            }}
        >
            <div className={`FilterValuePanel__checkbox${isChecked ? ' FilterValuePanel__checkbox--checked' : ''}`}/>
            <Label color={option.color}>
                {option.value}
            </Label>
        </div>
    )
})
OptionItem.displayName = 'OptionItem'

// ---- Person Filter (person / createdBy / updatedBy / multiPerson) ----

type PersonFilterPanelProps = {
    board: Board
    activeView: BoardView
    propertyTemplate: IPropertyTemplate
}

const PersonFilterPanel = (props: PersonFilterPanelProps): React.JSX.Element => {
    const {board, activeView, propertyTemplate} = props
    const boardUsers = useSelector(getBoardUsersList)
    const intl = useIntl()
    const [searchText, setSearchText] = useState('')

    const existingClause = useMemo(() => {
        return findClauseForProperty(activeView, propertyTemplate.id)
    }, [activeView, propertyTemplate.id])

    const selectedValues = useMemo(() => {
        return existingClause?.values || []
    }, [existingClause])

    const filteredUsers = useMemo(() => {
        if (!searchText) {
            return boardUsers
        }
        const lower = searchText.toLowerCase()
        return boardUsers.filter((u) =>
            u.username.toLowerCase().includes(lower) ||
            (u.nickname && u.nickname.toLowerCase().includes(lower)) ||
            (u.firstname && u.firstname.toLowerCase().includes(lower)) ||
            (u.lastname && u.lastname.toLowerCase().includes(lower)),
        )
    }, [boardUsers, searchText])

    const handleToggleUser = useCallback((userId: string) => {
        toggleFilterValue(board.id, activeView, propertyTemplate.id, userId, selectedValues, 'includes')
    }, [board.id, activeView, propertyTemplate.id, selectedValues])

    return (
        <div className='FilterValuePanel'>
            <div className='FilterValuePanel__search'>
                <input
                    type='text'
                    placeholder={intl.formatMessage({
                        id: 'FilterPanel.search-users',
                        defaultMessage: 'Search users...',
                    })}
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                />
            </div>
            <div className='FilterValuePanel__list'>
                {filteredUsers.map((user) => {
                    const displayName = user.nickname || `${user.firstname} ${user.lastname}`.trim() || user.username
                    return (
                        <div
                            key={user.id}
                            className='FilterValuePanel__option'
                            onClick={() => handleToggleUser(user.id)}
                            role='checkbox'
                            aria-checked={selectedValues.includes(user.id)}
                            tabIndex={0}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault()
                                    handleToggleUser(user.id)
                                }
                            }}
                        >
                            <div className={`FilterValuePanel__checkbox${selectedValues.includes(user.id) ? ' FilterValuePanel__checkbox--checked' : ''}`}/>
                            <span className='FilterValuePanel__option-label'>
                                {displayName}
                            </span>
                        </div>
                    )
                })}
                {filteredUsers.length === 0 && (
                    <div className='FilterValuePanel__empty'>
                        {intl.formatMessage({
                            id: 'FilterPanel.no-matching-users',
                            defaultMessage: 'No matching users',
                        })}
                    </div>
                )}
            </div>
        </div>
    )
}

// ---- Boolean Filter (checkbox) ----

type BooleanFilterPanelProps = {
    board: Board
    activeView: BoardView
    propertyTemplate: IPropertyTemplate
}

const BooleanFilterPanel = (props: BooleanFilterPanelProps): React.JSX.Element => {
    const {board, activeView, propertyTemplate} = props
    const intl = useIntl()

    const existingClause = useMemo(() => {
        return findClauseForProperty(activeView, propertyTemplate.id)
    }, [activeView, propertyTemplate.id])

    const handleToggle = useCallback((condition: 'isSet' | 'isNotSet') => {
        const filterGroup = createFilterGroup(activeView.fields.filter)
        const clauseIndex = findClauseIndex(filterGroup.filters, propertyTemplate.id)

        if (clauseIndex >= 0) {
            const clause = filterGroup.filters[clauseIndex] as FilterClause
            if (clause.condition === condition) {
                // Uncheck: remove clause
                filterGroup.filters.splice(clauseIndex, 1)
            } else {
                // Switch condition
                const newClause = createFilterClause(clause)
                newClause.condition = condition
                newClause.values = []
                filterGroup.filters[clauseIndex] = newClause
            }
        } else {
            // Add new clause
            const newClause = createFilterClause()
            newClause.propertyId = propertyTemplate.id
            newClause.condition = condition
            newClause.values = []
            filterGroup.filters.push(newClause)
        }

        mutator.changeViewFilter(board.id, activeView.id, activeView.fields.filter, filterGroup)
    }, [board.id, activeView, propertyTemplate.id])

    const isSetChecked = existingClause?.condition === 'isSet'
    const isNotSetChecked = existingClause?.condition === 'isNotSet'

    return (
        <div className='FilterValuePanel'>
            <div className='FilterValuePanel__list'>
                <div
                    className='FilterValuePanel__option'
                    onClick={() => handleToggle('isSet')}
                    role='checkbox'
                    aria-checked={isSetChecked}
                    tabIndex={0}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            handleToggle('isSet')
                        }
                    }}
                >
                    <div className={`FilterValuePanel__checkbox${isSetChecked ? ' FilterValuePanel__checkbox--checked' : ''}`}/>
                    <span className='FilterValuePanel__option-label'>
                        {intl.formatMessage({
                            id: 'FilterPanel.checked',
                            defaultMessage: 'Checked',
                        })}
                    </span>
                </div>
                <div
                    className='FilterValuePanel__option'
                    onClick={() => handleToggle('isNotSet')}
                    role='checkbox'
                    aria-checked={isNotSetChecked}
                    tabIndex={0}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            handleToggle('isNotSet')
                        }
                    }}
                >
                    <div className={`FilterValuePanel__checkbox${isNotSetChecked ? ' FilterValuePanel__checkbox--checked' : ''}`}/>
                    <span className='FilterValuePanel__option-label'>
                        {intl.formatMessage({
                            id: 'FilterPanel.unchecked',
                            defaultMessage: 'Unchecked',
                        })}
                    </span>
                </div>
            </div>
        </div>
    )
}

// ---- Text Filter ----

type TextFilterPanelProps = {
    board: Board
    activeView: BoardView
    propertyTemplate: IPropertyTemplate
}

const TextFilterPanel = (props: TextFilterPanelProps): React.JSX.Element => {
    const {board, activeView, propertyTemplate} = props
    const intl = useIntl()
    const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const existingClause = useMemo(() => {
        return findClauseForProperty(activeView, propertyTemplate.id)
    }, [activeView, propertyTemplate.id])

    const [textValue, setTextValue] = useState(existingClause?.values[0] || '')

    // Sync local state when the clause changes from outside
    useEffect(() => {
        setTextValue(existingClause?.values[0] || '')
    }, [existingClause?.values])

    // Clean up timer on unmount
    useEffect(() => {
        return () => {
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current)
            }
        }
    }, [])

    const handleTextChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = e.target.value
        setTextValue(newValue)

        if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current)
        }

        debounceTimerRef.current = setTimeout(() => {
            const filterGroup = createFilterGroup(activeView.fields.filter)
            const clauseIndex = findClauseIndex(filterGroup.filters, propertyTemplate.id)

            if (newValue) {
                if (clauseIndex >= 0) {
                    const clause = filterGroup.filters[clauseIndex] as FilterClause
                    const updatedClause = createFilterClause(clause)
                    updatedClause.values = [newValue]
                    filterGroup.filters[clauseIndex] = updatedClause
                } else {
                    const newClause = createFilterClause()
                    newClause.propertyId = propertyTemplate.id
                    newClause.condition = 'contains'
                    newClause.values = [newValue]
                    filterGroup.filters.push(newClause)
                }
            } else if (clauseIndex >= 0) {
                // Remove clause when text is cleared
                filterGroup.filters.splice(clauseIndex, 1)
            }

            mutator.changeViewFilter(board.id, activeView.id, activeView.fields.filter, filterGroup)
        }, 300)
    }, [board.id, activeView, propertyTemplate.id])

    return (
        <div className='FilterValuePanel'>
            <div className='FilterValuePanel__text-input'>
                <input
                    type='text'
                    placeholder={intl.formatMessage({
                        id: 'FilterPanel.text-contains',
                        defaultMessage: 'Contains...',
                    })}
                    value={textValue}
                    onChange={handleTextChange}
                />
            </div>
        </div>
    )
}

// ---- Date Filter ----

type DateFilterPanelProps = {
    board: Board
    activeView: BoardView
    propertyTemplate: IPropertyTemplate
}

const dateLoadedLocales: Record<string, boolean> = {}

const DateFilterPanel = (props: DateFilterPanelProps): React.JSX.Element => {
    const {board, activeView, propertyTemplate} = props
    const intl = useIntl()

    const existingClause = useMemo(() => {
        return findClauseForProperty(activeView, propertyTemplate.id)
    }, [activeView, propertyTemplate.id])

    const currentCondition: FilterCondition = (existingClause?.condition as FilterCondition) || 'is'

    const dateValue = useMemo((): Date | undefined => {
        if (existingClause?.values?.[0]) {
            return new Date(parseInt(existingClause.values[0], 10))
        }
        return undefined
    }, [existingClause?.values])

    const timeZoneOffset = (date: number): number => {
        return new Date(date).getTimezoneOffset() * 60 * 1000
    }

    const offsetDate = dateValue ? new Date(dateValue.getTime() + timeZoneOffset(dateValue.getTime())) : undefined

    const saveDateFilter = useCallback((newDate: Date | undefined, newCondition: FilterCondition) => {
        const filterGroup = createFilterGroup(activeView.fields.filter)
        const clauseIndex = findClauseIndex(filterGroup.filters, propertyTemplate.id)

        if (newDate) {
            const adjustedDate = new Date(newDate.getTime() - timeZoneOffset(newDate.getTime()))
            if (clauseIndex >= 0) {
                const clause = filterGroup.filters[clauseIndex] as FilterClause
                const updatedClause = createFilterClause(clause)
                updatedClause.condition = newCondition
                updatedClause.values = [adjustedDate.getTime().toString()]
                filterGroup.filters[clauseIndex] = updatedClause
            } else {
                const newClause = createFilterClause()
                newClause.propertyId = propertyTemplate.id
                newClause.condition = newCondition
                newClause.values = [adjustedDate.getTime().toString()]
                filterGroup.filters.push(newClause)
            }
        } else if (clauseIndex >= 0) {
            filterGroup.filters.splice(clauseIndex, 1)
        }

        mutator.changeViewFilter(board.id, activeView.id, activeView.fields.filter, filterGroup)
    }, [board.id, activeView, propertyTemplate.id])

    const handleConditionChange = useCallback((newCondition: FilterCondition) => {
        if (offsetDate) {
            saveDateFilter(offsetDate, newCondition)
        }
    }, [offsetDate, saveDateFilter])

    const handleDayClick = useCallback((day: Date) => {
        day.setHours(12, 0, 0, 0)
        saveDateFilter(day, currentCondition)
    }, [currentCondition, saveDateFilter])

    const handlePresetClick = useCallback((preset: string) => {
        const today = new Date()
        today.setHours(12, 0, 0, 0)

        switch (preset) {
        case 'today':
            saveDateFilter(today, 'is')
            break
        case 'yesterday': {
            const yesterday = new Date(today)
            yesterday.setDate(yesterday.getDate() - 1)
            saveDateFilter(yesterday, 'is')
            break
        }
        case 'last7days': {
            const d = new Date(today)
            d.setDate(d.getDate() - 7)
            saveDateFilter(d, 'isAfter')
            break
        }
        case 'last30days': {
            const d = new Date(today)
            d.setDate(d.getDate() - 30)
            saveDateFilter(d, 'isAfter')
            break
        }
        }
    }, [saveDateFilter])

    const handleClear = useCallback(() => {
        saveDateFilter(undefined, 'is')
    }, [saveDateFilter])

    const locale = intl.locale.toLowerCase()
    if (locale && locale !== 'en' && !dateLoadedLocales[locale]) {
        try {
            // eslint-disable-next-line global-require
            require(`moment/locale/${locale}`)
            dateLoadedLocales[locale] = true
        } catch {
            // Locale not available, fall back to English
        }
    }

    const conditions: Array<{value: FilterCondition, label: string}> = [
        {value: 'is', label: intl.formatMessage({id: 'DateFilterPanel.is', defaultMessage: 'Is'})},
        {value: 'isBefore', label: intl.formatMessage({id: 'DateFilterPanel.before', defaultMessage: 'Before'})},
        {value: 'isAfter', label: intl.formatMessage({id: 'DateFilterPanel.after', defaultMessage: 'After'})},
    ]

    const presets = [
        {id: 'today', label: intl.formatMessage({id: 'DateFilterPanel.today', defaultMessage: 'Today'})},
        {id: 'yesterday', label: intl.formatMessage({id: 'DateFilterPanel.yesterday', defaultMessage: 'Yesterday'})},
        {id: 'last7days', label: intl.formatMessage({id: 'DateFilterPanel.last7days', defaultMessage: 'Last 7 days'})},
        {id: 'last30days', label: intl.formatMessage({id: 'DateFilterPanel.last30days', defaultMessage: 'Last 30 days'})},
    ]

    const conditionLabel = conditions.find((c) => c.value === currentCondition)?.label || ''

    return (
        <div className='FilterValuePanel'>
            <div className='FilterValuePanel__date-panel'>
                <div className='FilterValuePanel__date-conditions'>
                    <div className='FilterValuePanel__date-section-label'>
                        {intl.formatMessage({id: 'DateFilterPanel.condition', defaultMessage: 'Condition'})}
                    </div>
                    <div className='FilterValuePanel__date-condition-group'>
                        {conditions.map((c) => (
                            <button
                                key={c.value}
                                className={`FilterValuePanel__date-condition-btn${currentCondition === c.value ? ' FilterValuePanel__date-condition-btn--active' : ''}`}
                                onClick={() => handleConditionChange(c.value)}
                            >
                                {c.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className='FilterValuePanel__date-presets'>
                    <div className='FilterValuePanel__date-section-label'>
                        {intl.formatMessage({id: 'DateFilterPanel.presets', defaultMessage: 'Quick select'})}
                    </div>
                    <div className='FilterValuePanel__date-preset-group'>
                        {presets.map((p) => (
                            <button
                                key={p.id}
                                className='FilterValuePanel__date-preset-btn'
                                onClick={() => handlePresetClick(p.id)}
                            >
                                {p.label}
                            </button>
                        ))}
                    </div>
                </div>

                {offsetDate && (
                    <div className='FilterValuePanel__date-selected'>
                        <span className='FilterValuePanel__date-selected-label'>
                            {conditionLabel}
                        </span>
                        <span className='FilterValuePanel__date-selected-value'>
                            {Utils.displayDate(offsetDate, intl)}
                        </span>
                        <button
                            className='FilterValuePanel__date-clear-btn'
                            onClick={handleClear}
                            title={intl.formatMessage({id: 'DateFilterPanel.clear', defaultMessage: 'Clear'})}
                        >
                            {'×'}
                        </button>
                    </div>
                )}

                <div className='FilterValuePanel__date-calendar'>
                    <DayPicker
                        key={offsetDate ? offsetDate.getTime() : 'none'}
                        initialMonth={offsetDate || new Date()}
                        showOutsideDays={false}
                        locale={locale}
                        localeUtils={MomentLocaleUtils}
                        selectedDays={offsetDate}
                        onDayClick={handleDayClick}
                    />
                </div>
            </div>
        </div>
    )
}

// ---- Utility Functions ----

function findClauseForProperty(view: BoardView, propertyId: string): FilterClause | undefined {
    const filters = view.fields.filter?.filters || []
    for (const f of filters) {
        if (!isAFilterGroupInstance(f)) {
            const clause = f as FilterClause
            if (clause.propertyId === propertyId) {
                return clause
            }
        }
    }
    return undefined
}

function findClauseIndex(filters: Array<FilterClause | ReturnType<typeof createFilterGroup>>, propertyId: string): number {
    for (let i = 0; i < filters.length; i++) {
        const f = filters[i]
        if (!isAFilterGroupInstance(f)) {
            const clause = f as FilterClause
            if (clause.propertyId === propertyId) {
                return i
            }
        }
    }
    return -1
}

function toggleFilterValue(
    boardId: string,
    activeView: BoardView,
    propertyId: string,
    value: string,
    currentValues: string[],
    condition: 'includes' | 'notIncludes',
): void {
    const filterGroup = createFilterGroup(activeView.fields.filter)
    const clauseIndex = findClauseIndex(filterGroup.filters, propertyId)

    if (clauseIndex >= 0) {
        const clause = filterGroup.filters[clauseIndex] as FilterClause
        const updatedClause = createFilterClause(clause)

        if (currentValues.includes(value)) {
            // Uncheck: remove value from clause
            updatedClause.values = updatedClause.values.filter((v) => v !== value)
            if (updatedClause.values.length === 0) {
                // Remove clause entirely when all values unchecked
                filterGroup.filters.splice(clauseIndex, 1)
            } else {
                filterGroup.filters[clauseIndex] = updatedClause
            }
        } else {
            // Check: add value to clause (OR logic within same property)
            updatedClause.values.push(value)
            filterGroup.filters[clauseIndex] = updatedClause
        }
    } else {
        // Create new clause for this property
        const newClause = createFilterClause()
        newClause.propertyId = propertyId
        newClause.condition = condition
        newClause.values = [value]
        filterGroup.filters.push(newClause)
    }

    mutator.changeViewFilter(boardId, activeView.id, activeView.fields.filter, filterGroup)
}

export default React.memo(FilterValuePanel)
