// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useState, useMemo} from 'react'
import {useIntl} from 'react-intl'

import {Board, IPropertyTemplate} from '../../../blocks/board'
import {BoardView} from '../../../blocks/boardView'
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

    // Default to first filterable property
    const [activePropertyId, setActivePropertyId] = useState<string>(() => {
        if (filterableProperties.length > 0) {
            return filterableProperties[0].id
        }
        return ''
    })

    const activePropertyTemplate = useMemo((): IPropertyTemplate | undefined => {
        return board.cardProperties.find((p) => p.id === activePropertyId)
    }, [board.cardProperties, activePropertyId])

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
                    properties={board.cardProperties}
                    activeView={activeView}
                    activePropertyId={activePropertyId}
                    onSelectProperty={setActivePropertyId}
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
