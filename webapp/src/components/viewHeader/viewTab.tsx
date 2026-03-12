// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react'

import {BoardView, IViewType} from '../../blocks/boardView'
import BoardIcon from '../../widgets/icons/board'
import TableIcon from '../../widgets/icons/table'
import GalleryIcon from '../../widgets/icons/gallery'
import CalendarIcon from '../../widgets/icons/calendar'

type Props = {
    view: BoardView
    isActive: boolean
    readonly: boolean
    onClick: () => void
}

const iconForViewType = (viewType: IViewType): React.JSX.Element => {
    switch (viewType) {
    case 'board': return <BoardIcon/>
    case 'table': return <TableIcon/>
    case 'gallery': return <GalleryIcon/>
    case 'calendar': return <CalendarIcon/>
    default: return <div/>
    }
}

const ViewTab = (props: Props): React.JSX.Element => {
    const {view, isActive, onClick} = props
    const className = `ViewTab ${isActive ? 'ViewTab--active' : ''}`

    return (
        <div
            className={className}
            onClick={onClick}
            role='tab'
            aria-selected={isActive}
        >
            <span className='ViewTab__icon'>
                {iconForViewType(view.fields.viewType)}
            </span>
            <span className='ViewTab__name'>
                {view.title}
            </span>
            {isActive && (
                <span className='ViewTab__arrow'>
                    {'▲'}
                </span>
            )}
        </div>
    )
}

export default React.memo(ViewTab)
