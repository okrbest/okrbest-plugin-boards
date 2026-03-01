// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useMemo} from 'react'
import {useIntl} from 'react-intl'

import {IPropertyTemplate} from '../../../blocks/board'
import {FilterClause} from '../../../blocks/filterClause'
import {isAFilterGroupInstance} from '../../../blocks/filterGroup'
import {BoardView} from '../../../blocks/boardView'
import propsRegistry from '../../../properties'

import './filterPropertyList.scss'

type Props = {
    properties: IPropertyTemplate[]
    activeView: BoardView
    activePropertyId: string
    onSelectProperty: (propertyId: string) => void
}

const FilterPropertyList = (props: Props): React.JSX.Element => {
    const {properties, activeView, activePropertyId, onSelectProperty} = props
    const intl = useIntl()

    const filterableProperties = useMemo(() => {
        return properties.filter((p) => propsRegistry.get(p.type).canFilter)
    }, [properties])

    const filterCountByProperty = useMemo(() => {
        const counts: Record<string, number> = {}
        const filters = activeView.fields.filter?.filters || []
        filters.forEach((f) => {
            if (!isAFilterGroupInstance(f)) {
                const clause = f as FilterClause
                if (clause.propertyId && clause.values.length > 0) {
                    counts[clause.propertyId] = (counts[clause.propertyId] || 0) + clause.values.length
                } else if (clause.propertyId && (clause.condition === 'isSet' || clause.condition === 'isNotSet')) {
                    counts[clause.propertyId] = (counts[clause.propertyId] || 0) + 1
                }
            }
        })
        return counts
    }, [activeView.fields.filter])

    if (filterableProperties.length === 0) {
        return (
            <div className='FilterPropertyList'>
                <div className='FilterPropertyList__empty'>
                    {intl.formatMessage({
                        id: 'FilterPanel.no-filterable-properties',
                        defaultMessage: 'No filterable properties',
                    })}
                </div>
            </div>
        )
    }

    return (
        <div className='FilterPropertyList'>
            {filterableProperties.map((property) => {
                const isActive = property.id === activePropertyId
                const count = filterCountByProperty[property.id]
                return (
                    <div
                        key={property.id}
                        className={`FilterPropertyList__item${isActive ? ' FilterPropertyList__item--active' : ''}`}
                        onClick={() => onSelectProperty(property.id)}
                        role='button'
                        tabIndex={0}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault()
                                onSelectProperty(property.id)
                            }
                        }}
                    >
                        <span className='FilterPropertyList__item-name'>
                            {property.name}
                        </span>
                        {count > 0 && (
                            <span className='FilterPropertyList__item-badge'>
                                {count}
                            </span>
                        )}
                    </div>
                )
            })}
        </div>
    )
}

export default React.memo(FilterPropertyList)
