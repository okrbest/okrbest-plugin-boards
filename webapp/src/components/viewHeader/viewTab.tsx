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
            {!props.readonly && (
                <span className='ViewTab__chevron'>
                    <svg
                        width='14'
                        height='14'
                        viewBox='0 0 14 14'
                        fill='none'
                        xmlns='http://www.w3.org/2000/svg'
                    >
                        <path
                            d='M3.5 5.25L7 8.75L10.5 5.25'
                            stroke='currentColor'
                            strokeWidth='1.5'
                            strokeLinecap='round'
                            strokeLinejoin='round'
                        />
                    </svg>
                </span>
            )}
        </div>
    )
}

export default React.memo(ViewTab)
