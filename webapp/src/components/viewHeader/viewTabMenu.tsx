// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useEffect, useRef} from 'react'
import {useIntl} from 'react-intl'

type Props = {
    onRename: () => void
    onDuplicate: () => void
    onDelete: () => void
    onClose: () => void
    canDelete: boolean
}

const ViewTabMenu = (props: Props): React.JSX.Element => {
    const {onRename, onDuplicate, onDelete, onClose, canDelete} = props
    const intl = useIntl()
    const menuRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                onClose()
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [onClose])

    return (
        <div
            className='ViewTabMenu'
            ref={menuRef}
        >
            <div
                className='ViewTabMenu__item'
                onClick={(e) => {
                    e.stopPropagation()
                    onRename()
                    onClose()
                }}
            >
                {intl.formatMessage({id: 'ViewTabMenu.rename', defaultMessage: 'Rename'})}
            </div>
            <div
                className='ViewTabMenu__item'
                onClick={(e) => {
                    e.stopPropagation()
                    onDuplicate()
                    onClose()
                }}
            >
                {intl.formatMessage({id: 'View.DuplicateView', defaultMessage: 'Duplicate view'})}
            </div>
            {canDelete && (
                <div
                    className='ViewTabMenu__item ViewTabMenu__item--danger'
                    onClick={(e) => {
                        e.stopPropagation()
                        onDelete()
                        onClose()
                    }}
                >
                    {intl.formatMessage({id: 'View.DeleteView', defaultMessage: 'Delete view'})}
                </div>
            )}
        </div>
    )
}

export default React.memo(ViewTabMenu)
