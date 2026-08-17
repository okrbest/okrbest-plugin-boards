// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react'
import {useIntl} from 'react-intl'

import {Board} from '../../blocks/board'
import mutator from '../../mutator'
import Switch from '../../widgets/switch'
import {okrBoardSettings} from '../../okrBoard'
import BoardPermissionGate from '../permissions/boardPermissionGate'
import {Permission} from '../../constants'

type Props = {
    board: Board
}

// Marks a board as an OKR board so new cards start on the rung their depth
// implies. It sits above the card access section because it is the coarser
// statement — what kind of board this is, rather than who may see which card.
//
// The switch turns the filling on and off and nothing else. Switching off leaves
// the property and every value a card carries alone, so the action is one a user
// can undo by switching back on (FR-011).
//
// Being coarser is also why it takes the same permission as the access rules
// rather than the looser one that guards ordinary board properties. Switching a
// live OKR board off takes the ladder away from everybody at once, and an editor
// shown the switch would be shown a control the server refuses.
const OkrBoardSection = (props: Props): React.JSX.Element => {
    const {board} = props
    const intl = useIntl()

    const enabled = Boolean(okrBoardSettings(board.properties))

    const onChanged = (isOn: boolean) => {
        if (isOn) {
            mutator.enableOkrBoard(board)
            return
        }
        mutator.disableOkrBoard(board)
    }

    return (
        <BoardPermissionGate permissions={[Permission.ManageBoardRoles]}>
            <div className='tabs-content'>
                <div className='d-flex justify-content-between'>
                    <div className='d-flex flex-column'>
                        <div className='text-heading2'>
                            {intl.formatMessage({id: 'OkrBoard.title', defaultMessage: 'Use as OKR Board'})}
                        </div>
                        <div className='text-light'>
                            {intl.formatMessage({id: 'OkrBoard.description', defaultMessage: 'New cards start on the rung their depth implies — Objective, Key Results, then Tasks. You can change any of them afterwards.'})}
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

export default OkrBoardSection
