// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback} from 'react'
import {MessageDescriptor, useIntl} from 'react-intl'

import {BoardView} from '../../blocks/boardView'
import {useViewAccess} from '../../hooks/viewAccess'
import mutator from '../../mutator'
import {ViewAccessMode} from '../../viewAccess'
import Button from '../../widgets/buttons/button'
import CheckIcon from '../../widgets/icons/check'
import Menu from '../../widgets/menu'
import MenuWrapper from '../../widgets/menuWrapper'

type Props = {
    activeView: BoardView
    sharedViewCount: number
    readonly: boolean
}

const modeLabels: Record<ViewAccessMode, MessageDescriptor> = {
    everyone: {id: 'ViewHeader.access-everyone', defaultMessage: 'Everyone'},
    admin: {id: 'ViewHeader.access-admin', defaultMessage: 'Admins'},
    private: {id: 'ViewHeader.access-private', defaultMessage: 'Private'},
}

// Who may see this view and who may change what it shows. Sits after the sort
// menu and looks like it: a button carrying the current answer, a menu with the
// answers this person may give (specs/022-view-permission/contracts/ui-surfaces.md).
//
// Items this person may not choose are not disabled but absent. The button
// itself stays, disabled, when there is nothing to choose: knowing the mode is
// what explains why the other menus are locked.
const ViewHeaderAccessMenu = (props: Props): React.JSX.Element | null => {
    const {activeView, sharedViewCount, readonly} = props
    const intl = useIntl()
    const access = useViewAccess(activeView, sharedViewCount)

    const onPick = useCallback((picked: string) => {
        const mode = picked as ViewAccessMode
        if (mode === access.mode) {
            return
        }
        mutator.changeViewAccessMode(activeView.boardId, activeView.id, access.mode, mode)
    }, [activeView.boardId, activeView.id, access.mode])

    if (readonly) {
        return null
    }

    const cannotChange = intl.formatMessage({id: 'ViewHeader.access-cannot-change', defaultMessage: "You can't change who may edit this view."})

    return (
        <MenuWrapper
            usePortal={true}
            menuPosition='bottom'
            disabled={!access.canChange}
        >
            <Button
                active={access.mode !== 'everyone' && access.canChange}
                disabled={!access.canChange}
                title={access.canChange ? undefined : cannotChange}
            >
                {intl.formatMessage(modeLabels[access.mode])}
            </Button>
            <Menu>
                {access.targets.map((mode) => (
                    <Menu.Text
                        key={mode}
                        id={mode}
                        name={intl.formatMessage(modeLabels[mode])}
                        rightIcon={mode === access.mode ? <CheckIcon/> : undefined}
                        onClick={onPick}
                    />
                ))}
            </Menu>
        </MenuWrapper>
    )
}

export default React.memo(ViewHeaderAccessMenu)
