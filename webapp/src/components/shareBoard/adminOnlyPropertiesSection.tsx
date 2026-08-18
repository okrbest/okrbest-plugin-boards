// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react'
import {useIntl} from 'react-intl'

import {Board} from '../../blocks/board'
import mutator from '../../mutator'
import Switch from '../../widgets/switch'
import {cardPropertiesAdminOnly} from '../../cardPropertyLock'
import BoardPermissionGate from '../permissions/boardPermissionGate'
import {Permission} from '../../constants'

type Props = {
    board: Board
}

// Keeps the property editor to board admins — what the board records, rather than
// what a card says.
//
// A property's type or a select's options reach every card already filed under
// them, so a board may want that to be an admin's job. Turning the switch off
// puts it back where it was; nothing a user already wrote is touched.
//
// The switch itself sits behind the same permission it grants. An editor who
// could turn it off would not be restricted by it.
const AdminOnlyPropertiesSection = (props: Props): React.JSX.Element => {
    const {board} = props
    const intl = useIntl()

    const enabled = cardPropertiesAdminOnly(board.properties)

    const onChanged = (isOn: boolean) => {
        mutator.setCardPropertiesAdminOnly(board, isOn)
    }

    return (
        <BoardPermissionGate permissions={[Permission.ManageBoardRoles]}>
            <div className='tabs-content'>
                <div className='d-flex justify-content-between'>
                    <div className='d-flex flex-column'>
                        <div className='text-heading2'>
                            {intl.formatMessage({id: 'AdminOnlyProperties.title', defaultMessage: 'Only admins may edit properties'})}
                        </div>
                        <div className='text-light'>
                            {intl.formatMessage({id: 'AdminOnlyProperties.description', defaultMessage: 'Adding, renaming, retyping or deleting a property — and editing the options a select offers — becomes a board admin\'s job. Filling in card values is unaffected.'})}
                        </div>
                    </div>
                    <div>
                        <Switch
                            isOn={enabled}
                            size='medium'
                            onChanged={onChanged}
                        />
                    </div>
                </div>
            </div>
        </BoardPermissionGate>
    )
}

export default AdminOnlyPropertiesSection
