// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useState, useMemo, useCallback} from 'react'
import {useIntl} from 'react-intl'

import {Board, IPropertyTemplate} from '../../../blocks/board'
import {BoardView} from '../../../blocks/boardView'
import {FilterClause} from '../../../blocks/filterClause'
import {createFilterGroup, isAFilterGroupInstance} from '../../../blocks/filterGroup'
import mutator from '../../../mutator'
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
    const intl = useIntl()

    const filterableProperties = useMemo(() => {
        return board.cardProperties.filter((p) => propsRegistry.get(p.type).canFilter)
    }, [board.cardProperties])

    // Prioritize the first filterable property that has an active filter clause
    const [activePropertyId, setActivePropertyId] = useState<string>(() => {
        if (filterableProperties.length === 0) {
            return ''
        }
        const activeFilterIds = new Set(
            (activeView.fields.filter?.filters || [])
                .filter((f) => !isAFilterGroupInstance(f))
                .map((f) => (f as FilterClause).propertyId),
        )
        const firstWithFilter = filterableProperties.find((p) => activeFilterIds.has(p.id))
        return firstWithFilter?.id ?? filterableProperties[0].id
    })

    const activePropertyTemplate = useMemo((): IPropertyTemplate | undefined => {
        return board.cardProperties.find((p) => p.id === activePropertyId)
    }, [board.cardProperties, activePropertyId])

    const hasAnyFilter = useMemo(() => {
        const filters = activeView.fields.filter?.filters || []
        return filters.some((f) => !isAFilterGroupInstance(f))
    }, [activeView.fields.filter])

    const handleClearProperty = useCallback((propertyId: string) => {
        const filterGroup = createFilterGroup(activeView.fields.filter)
        filterGroup.filters = filterGroup.filters.filter((f) => {
            if (isAFilterGroupInstance(f)) {
                return true
            }
            return (f as FilterClause).propertyId !== propertyId
        })
        mutator.changeViewFilter(board.id, activeView.id, activeView.fields.filter, filterGroup)
    }, [board.id, activeView])

    const handleClearAll = useCallback(() => {
        const filterGroup = createFilterGroup(activeView.fields.filter)
        filterGroup.filters = []
        mutator.changeViewFilter(board.id, activeView.id, activeView.fields.filter, filterGroup)
    }, [board.id, activeView])

    if (filterableProperties.length === 0) {
        return (
            <Modal onClose={onClose}>
                <div className='FilterPanel'>
                    <div className='FilterPanel__empty'>
                        {intl.formatMessage({
                            id: 'FilterPanel.no-filterable-properties',
                            defaultMessage: 'No filterable properties',
                        })}
                    </div>
                </div>
            </Modal>
        )
    }

    return (
        <Modal onClose={onClose}>
            <div className='FilterPanel'>
                <FilterPropertyList
                    filterableProperties={filterableProperties}
                    activeView={activeView}
                    activePropertyId={activePropertyId}
                    onSelectProperty={setActivePropertyId}
                    onClearProperty={handleClearProperty}
                    onClearAll={handleClearAll}
                    hasAnyFilter={hasAnyFilter}
                />
                <FilterValuePanel
                    board={board}
                    activeView={activeView}
                    propertyTemplate={activePropertyTemplate}
                />
            </div>
        </Modal>
    )
}

export default React.memo(FilterPanel)
